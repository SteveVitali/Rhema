// Network: the custom-mode VPC, the three subnets (§13.2), Cloud NAT for the private-app tier ONLY, and
// the firewall rules that make the sandbox subnet a one-way street to the egress-proxy (REQ-ARCH-2).
//
// The security-critical facts (sandbox has no default route and no Cloud NAT; its only egress target is
// the proxy) are the same facts asserted by `infra/config/stages.test.ts` — this module is where they
// become live GCP resources, and a post-deploy check (see README, D-P0.01-2) reads them back off the VPC.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig, sandboxSubnetOf } from "../config/stages.js";

/** The network tag the egress-proxy instances carry; the sandbox's only egress firewall target. */
export const EGRESS_PROXY_TAG = "egress-proxy";
/** The network tag the run-task (sandbox) pods/nodes carry. */
export const SANDBOX_TAG = "sandbox";

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

  const sandboxSubnet = sandboxSubnetOf(cfg);
  if (!sandboxSubnet) throw new pulumi.RunError("stage config has no sandbox subnet — refusing to deploy");

  return {
    network,
    subnets,
    sandboxSubnetSelfLink: subnets["sandbox"].selfLink,
  };
}
