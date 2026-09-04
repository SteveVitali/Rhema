// Network: the custom-mode VPC, the three subnets (§13.2), Cloud NAT for the private-app tier ONLY, and
// the firewall rules that make the sandbox subnet a one-way street to the egress-proxy (REQ-ARCH-2).
//
// The security-critical facts (sandbox has no default route and no Cloud NAT; its only egress target is
// the proxy) are the same facts asserted by `infra/config/stages.test.ts` — this module is where they
// become live GCP resources, and a post-deploy check (see README, D-P0.01-2) reads them back off the VPC.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig, sandboxSubnetOf } from "../config/stages";

/** The network tag the egress-proxy instances carry; the sandbox's only egress firewall target. */
export const EGRESS_PROXY_TAG = "egress-proxy";
/** The network tag the run-task (sandbox) pods/nodes carry. */
export const SANDBOX_TAG = "sandbox";

/**
 * The GKE private control-plane CIDR (must match `compute.ts` `privateClusterConfig.masterIpv4CidrBlock`).
 * Sandbox NODES need egress to it (443 for the API server, 10250 for kubelet ↔ konnectivity) to register.
 */
export const GKE_MASTER_CIDR = "172.16.0.0/28";

/**
 * The `private.googleapis.com` VIP block (199.36.153.8/30 = .8–.11). A no-NAT/no-internet subnet reaches
 * every Google API (Artifact Registry, GCS, Secret Manager, the GKE API, logging) ONLY through this VIP over
 * Private Google Access — a route to it + a DNS override + an egress-allow to it, and nothing else. This is
 * NOT arbitrary-internet egress: the pods are still locked to the proxy by a k8s NetworkPolicy (D-P0.15c-8).
 */
export const PRIVATE_GOOGLE_APIS_CIDR = "199.36.153.8/30";
const PRIVATE_GOOGLE_APIS_IPS = ["199.36.153.8", "199.36.153.9", "199.36.153.10", "199.36.153.11"];

export interface NetworkArgs {
  stack: string;
  cfg: StageConfig;
  region: pulumi.Input<string>;
}

export interface Network {
  network: gcp.compute.Network;
  subnets: Record<string, gcp.compute.Subnetwork>;
  /** The name of the sandbox subnet, for placing the run-task node pool. */
  sandboxSubnetSelfLink: pulumi.Output<string>;
  /**
   * The private-services-access peering AlloyDB + Memorystore(PRIVATE_SERVICE_ACCESS) require. Data-plane
   * resources must depend on this so the peering exists before they try to allocate a private IP.
   */
  psaConnection: gcp.servicenetworking.Connection;
}

// The three /20 subnet CIDRs. Distinct ranges so the VPC has no overlap; the sandbox is deliberately the
// last block so a mis-sized subnet can never bleed into it.
const SUBNET_CIDRS: Record<string, string> = {
  public: "10.8.0.0/20",
  "private-app": "10.8.16.0/20",
  sandbox: "10.8.240.0/20",
};

export function createNetwork(args: NetworkArgs): Network {
  const { stack, cfg, region } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;

  // Custom-mode network: no auto subnets, so NOTHING gets a default route we did not author.
  const network = new gcp.compute.Network(name("net"), {
    autoCreateSubnetworks: false,
    routingMode: "REGIONAL",
    description: `Rhema ${stack} VPC (custom subnets; sandbox has no egress but the proxy).`,
  });

  const subnets: Record<string, gcp.compute.Subnetwork> = {};
  for (const subnet of cfg.vpc.subnets) {
    subnets[subnet.name] = new gcp.compute.Subnetwork(name(subnet.name), {
      network: network.id,
      region,
      ipCidrRange: SUBNET_CIDRS[subnet.name],
      // Private Google Access lets the private-app + sandbox tiers reach Google APIs (GCS, Secret
      // Manager, AlloyDB) over Google's backbone WITHOUT a route to the public internet. The sandbox
      // uses this only for the control-plane sidecar (harness uid); the agent uid still has no route out.
      privateIpGoogleAccess: true,
      description: `${subnet.name} tier`,
    });
  }

  // Cloud Router + Cloud NAT for the PRIVATE-APP subnet only. The sandbox subnet is deliberately NOT
  // listed as a NAT source range, so run-task pods get no NATed egress (REQ-ARCH-2).
  const router = new gcp.compute.Router(name("router"), { network: network.id, region });
  const privateApp = subnets["private-app"];
  new gcp.compute.RouterNat(name("nat"), {
    router: router.name,
    region,
    natIpAllocateOption: "AUTO_ONLY",
    // ONLY the private-app subnet is a NAT source — never the sandbox.
    sourceSubnetworkIpRangesToNat: "LIST_OF_SUBNETWORKS",
    subnetworks: [{ name: privateApp.id, sourceIpRangesToNats: ["ALL_IP_RANGES"] }],
    logConfig: { enable: true, filter: "ERRORS_ONLY" },
  });

  // --- Firewall: the sandbox is a one-way street to the proxy ------------------------------------
  // GCP has an implied allow-all egress rule at priority 65535. We override it: a low-priority
  // deny-all-egress on the sandbox tag, then a high-priority allow to the proxy tag only.
  new gcp.compute.Firewall(name("sandbox-deny-egress"), {
    network: network.id,
    direction: "EGRESS",
    priority: 1000,
    destinationRanges: ["0.0.0.0/0"],
    denies: [{ protocol: "all" }],
    targetTags: [SANDBOX_TAG],
    description: "REQ-ARCH-2: the sandbox may not egress anywhere by default.",
  });
  new gcp.compute.Firewall(name("sandbox-allow-proxy"), {
    network: network.id,
    direction: "EGRESS",
    priority: 900, // beats the deny above
    // The proxy is reached by its tag, resolved to its instances' IPs by GCP.
    destinationRanges: [SUBNET_CIDRS["private-app"]],
    allows: [{ protocol: "tcp", ports: ["443", "8443"] }],
    targetTags: [SANDBOX_TAG],
    description: "REQ-ARCH-2: the sandbox's ONLY egress target is the egress-proxy tier.",
  });

  // The proxy itself lives on the private-app tier and egresses to the internet via Cloud NAT; a
  // dedicated egress rule keeps its reach auditable (443 out only).
  new gcp.compute.Firewall(name("proxy-egress"), {
    network: network.id,
    direction: "EGRESS",
    priority: 1000,
    destinationRanges: ["0.0.0.0/0"],
    allows: [{ protocol: "tcp", ports: ["443"] }],
    targetTags: [EGRESS_PROXY_TAG],
    description: "The egress-proxy reaches api.anthropic.com (443) via Cloud NAT.",
  });

  // INGRESS to the proxy tier — the custom VPC has no default allow-internal for the 10.8.x ranges, so without
  // this the sandbox's SYN to the proxy is dropped (surfaced live P0.15e — the pod connect + the MIG health
  // check both timed out). Allow the sandbox subnet + the GKE pod range (pod egress may keep the pod IP) on
  // 8443/443, and the GCP health-check prober ranges on 8443 (else autohealing recreates the proxy in a loop).
  new gcp.compute.Firewall(name("proxy-ingress"), {
    network: network.id,
    direction: "INGRESS",
    priority: 1000,
    sourceRanges: [SUBNET_CIDRS["sandbox"], "10.92.0.0/14", "35.191.0.0/16", "130.211.0.0/22"],
    allows: [{ protocol: "tcp", ports: ["443", "8443"] }],
    targetTags: [EGRESS_PROXY_TAG],
    description: "Sandbox + pod range reach the proxy (8443/443); GCP health-check probers reach 8443.",
  });

  // --- Sandbox NODE bootstrap over Private Google Access (D-P0.15c-8) -----------------------------
  // The run-task nodes sit in the no-NAT/no-internet sandbox subnet, so the subnet-level deny-all-egress
  // (correct for the PODS) also blocks NODE bootstrap: image pull from Artifact Registry, the kubelet ↔
  // control-plane connection, and every Google-API call a node makes. Give the SANDBOX-tagged nodes exactly
  // two egress targets beyond the proxy — the Private-Google-APIs VIP and the GKE master CIDR — and nothing
  // else. Pods are still locked to the proxy by a k8s NetworkPolicy (infra/k8s), a strictly tighter layer;
  // the node keeping Google-API egress is NOT arbitrary-internet egress (REQ-ARCH-2 holds at the pod layer).

  // A route for the VIP block via the default internet gateway — with no default route, the sandbox has no
  // way to the VIP otherwise. Restricted to the sandbox tag so only run-task nodes use it.
  new gcp.compute.Route(name("sandbox-pga-route"), {
    network: network.id,
    destRange: PRIVATE_GOOGLE_APIS_CIDR,
    nextHopGateway: "default-internet-gateway",
    tags: [SANDBOX_TAG],
    priority: 1000,
    description: "Private Google Access: sandbox nodes reach googleapis via the VIP (no internet egress).",
  });

  // Egress-allow to the Private-Google-APIs VIP (443 for the APIs, 80 for a redirect some clients use).
  new gcp.compute.Firewall(name("sandbox-allow-google-apis"), {
    network: network.id,
    direction: "EGRESS",
    priority: 900, // beats the deny-all-egress (1000)
    destinationRanges: [PRIVATE_GOOGLE_APIS_CIDR],
    allows: [{ protocol: "tcp", ports: ["443", "80"] }],
    targetTags: [SANDBOX_TAG],
    description: "D-P0.15c-8: sandbox nodes reach Google APIs (Artifact Registry / GCS / SM) via PGA only.",
  });

  // Egress-allow to the GKE private control plane so the node can register + the kubelet can be reached.
  // Port 8132 is the KONNECTIVITY proxy-server (the node's konnectivity-agent dials `<master>:8132`); without
  // it the agent never registers and `kubectl logs`/`exec` fail "No agent available" — the live pod-log blind
  // spot (D-P0.15e-4, diagnosed P0.15f). 443 = API server, 10250 = kubelet.
  new gcp.compute.Firewall(name("sandbox-allow-gke-master"), {
    network: network.id,
    direction: "EGRESS",
    priority: 900,
    destinationRanges: [GKE_MASTER_CIDR],
    allows: [{ protocol: "tcp", ports: ["443", "10250", "8132"] }],
    targetTags: [SANDBOX_TAG],
    description: "D-P0.15c-8/D-P0.15e-4: sandbox nodes reach the GKE control plane (API server + kubelet + konnectivity 8132).",
  });

  // Egress-allow node→node kubelet (10250) within the sandbox subnet: `kubectl logs`/`exec` proxy from the
  // API server through a konnectivity-agent to the TARGET node's kubelet, which is cross-node when the agent
  // and the pod are on different nodes. The deny-all-egress (priority 1000) would otherwise block it, leaving
  // logs failing "dial <node>:10250 i/o timeout" even after konnectivity registers (D-P0.15e-4, P0.15f).
  new gcp.compute.Firewall(name("sandbox-node-kubelet"), {
    network: network.id,
    direction: "EGRESS",
    priority: 900,
    destinationRanges: [SUBNET_CIDRS["sandbox"]],
    allows: [{ protocol: "tcp", ports: ["10250"] }],
    targetTags: [SANDBOX_TAG],
    description: "D-P0.15e-4: node→node kubelet (10250) within the sandbox subnet for kubectl logs/exec via konnectivity.",
  });

  // Private DNS: override googleapis.com / pkg.dev / gcr.io to resolve to the VIP inside the VPC, so a
  // no-internet node resolves Artifact Registry, GCS, Secret Manager, etc. to the PGA VIP (not a public IP
  // it cannot reach). Standard private-GKE DNS setup.
  privateGoogleApisDns(name, network);

  // Private Services Access: a reserved /16 + a servicenetworking peering. AlloyDB and Memorystore Redis
  // (PRIVATE_SERVICE_ACCESS) allocate their private IPs out of this range over the VPC peering — without it
  // their creation fails (surfaced by the live `pulumi preview`/`up`). This grants NO internet egress.
  const psaRange = new gcp.compute.GlobalAddress(name("psa-range"), {
    purpose: "VPC_PEERING",
    addressType: "INTERNAL",
    prefixLength: 16,
    network: network.id,
    description: "Reserved range for private services access (AlloyDB / Memorystore).",
  });
  const psaConnection = new gcp.servicenetworking.Connection(name("psa"), {
    network: network.id,
    service: "servicenetworking.googleapis.com",
    reservedPeeringRanges: [psaRange.name],
  });

  const sandboxSubnet = sandboxSubnetOf(cfg);
  if (!sandboxSubnet) throw new pulumi.RunError("stage config has no sandbox subnet — refusing to deploy");

  return {
    network,
    subnets,
    sandboxSubnetSelfLink: subnets["sandbox"].selfLink,
    psaConnection,
  };
}

/**
 * Private DNS override so a no-internet node resolves Google API + registry hostnames to the PGA VIP. For each
 * of googleapis.com / pkg.dev / gcr.io: a VPC-private managed zone with an A record for the apex → the VIP
 * IPs and a wildcard CNAME → the apex, the canonical private-GKE pattern (D-P0.15c-8). Visible only inside the
 * VPC, so it changes nothing for any other network.
 */
function privateGoogleApisDns(name: (suffix: string) => string, network: gcp.compute.Network): void {
  // `run.app` resolves to the VIP too, so the sandbox pod reaches the INTERNAL Cloud Run api over Private
  // Google Access (its public frontend IP is blocked by the sandbox egress — surfaced live P0.15e).
  for (const domain of ["googleapis.com", "pkg.dev", "gcr.io", "run.app"]) {
    const slug = domain.replace(/\./g, "-");
    const zone = new gcp.dns.ManagedZone(name(`pga-${slug}`), {
      dnsName: `${domain}.`,
      visibility: "private",
      privateVisibilityConfig: { networks: [{ networkUrl: network.id }] },
      description: `Private Google Access override for ${domain} (sandbox reaches Google APIs via the VIP).`,
    });
    new gcp.dns.RecordSet(name(`pga-${slug}-a`), {
      managedZone: zone.name,
      name: `${domain}.`,
      type: "A",
      ttl: 300,
      rrdatas: PRIVATE_GOOGLE_APIS_IPS,
    });
    new gcp.dns.RecordSet(name(`pga-${slug}-cname`), {
      managedZone: zone.name,
      name: `*.${domain}.`,
      type: "CNAME",
      ttl: 300,
      rrdatas: [`${domain}.`],
    });
  }
}
