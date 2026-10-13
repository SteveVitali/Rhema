#!/usr/bin/env bash
# Apply the run-task k8s state after `pulumi up` (D-P0.15c-8). Provisions the `runs` namespace, the
# Workload-Identity-bound `run-task-ksa`, and the pod egress NetworkPolicy the dataplane-v2 cluster enforces.
# Stack-parameterized (the GSA email depends on project/stack), which is why this is a documented post-up
# apply rather than a GCP resource in the Pulumi program.
#
# Prereqs: `gcloud container clusters get-credentials <cluster> --region <region>` has set kube context.
#   PROJECT=rhema-507501 STACK=dev ./infra/k8s/apply.sh
set -euo pipefail

PROJECT="${PROJECT:?set PROJECT (e.g. rhema-507501)}"
STACK="${STACK:?set STACK (e.g. dev)}"
export RUN_TASK_GSA_EMAIL="rhema-${STACK}-run-task@${PROJECT}.iam.gserviceaccount.com"
export WORKER_GSA_EMAIL="rhema-${STACK}-worker@${PROJECT}.iam.gserviceaccount.com"
# SLO.1 — the image-prewarm DaemonSet (40-*.yaml): the digest-pinned run-task image ref + the sandbox
# node-pool name it warms (the pool's actual k8s name — `gcloud container node-pools list --cluster
# rhema-${STACK}-gke` or the worker's SANDBOX_NODE_POOL env; the Pulumi name gets a hashed suffix).
# Re-run this script on every run-task image bump so the sleeper tracks the current digest (a stale
# digest just degrades to a normal cold pull — never a failure).
#   RUN_TASK_IMAGE="$(pulumi stack output runTaskImageDigest)" RUN_TASK_NODEPOOL="$(gcloud container node-pools list --cluster rhema-${STACK}-gke --region <region> --format='value(name)')"
export RUN_TASK_IMAGE="${RUN_TASK_IMAGE:?set RUN_TASK_IMAGE to the full repo@sha256:<digest> run-task ref — see the example above}"
export RUN_TASK_NODEPOOL="${RUN_TASK_NODEPOOL:?set RUN_TASK_NODEPOOL to the run-task node pool real k8s name — see the example above}"
# SEC.3 — the apparmor-loader DaemonSet (50-*.yaml): the digest-pinned loader image ref pushed to the
# stack's AR repo (`docker build -f infra/k8s/apparmor/Dockerfile.loader …`; push under Private Google
# Access — the sandbox pool has no internet route). Apply BEFORE enabling the Localhost profile on
# the worker config: a run pod lands on a node only after that node's loader has the profile enforced.
export APPARMOR_LOADER_IMAGE="${APPARMOR_LOADER_IMAGE:?set APPARMOR_LOADER_IMAGE to the full repo@sha256:<digest> apparmor-loader ref — same repo as RUN_TASK_IMAGE, tag apparmor-loader}"

DIR="$(cd "$(dirname "$0")" && pwd)"

kubectl apply -f "${DIR}/00-runs-namespace.yaml"
# the KSA carries the stack-templated GSA annotation.
envsubst < "${DIR}/10-run-task-ksa.yaml" | kubectl apply -f -
kubectl apply -f "${DIR}/20-run-task-egress-policy.yaml"
# the worker's launcher Role/RoleBinding carries the stack-templated worker GSA (P1.22; D-P0.01-5).
envsubst < "${DIR}/30-worker-job-rbac.yaml" | kubectl apply -f -
# SLO.1 — the image-prewarm DaemonSet carries the stack-templated digest + pool name.
envsubst < "${DIR}/40-image-prepull-daemonset.yaml" | kubectl apply -f -
# SEC.3 — the apparmor-loader DaemonSet: the digest-pinned loader image + the same pool name.
envsubst < "${DIR}/50-apparmor-loader-daemonset.yaml" | kubectl apply -f -
kubectl -n kube-system rollout status daemonset/apparmor-loader --timeout=300s

# Complete the Workload-Identity binding GSA-side (the KSA annotation above is only the pod-side half).
gcloud iam service-accounts add-iam-policy-binding "${RUN_TASK_GSA_EMAIL}" \
  --project "${PROJECT}" \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT}.svc.id.goog[runs/run-task-ksa]"

echo "applied: runs namespace + run-task-ksa (WI-bound to ${RUN_TASK_GSA_EMAIL}) + run-task-egress NetworkPolicy + worker launcher RBAC (${WORKER_GSA_EMAIL}) + apparmor-loader DaemonSet (image ${APPARMOR_LOADER_IMAGE})"
