// @rhema/run-task — the direct identity log line (SEC.3; discharges the "no literal uid= print" caveat on
// D-P0.15f-1 / D-P1.22-2(a)). Every process entry (harness-main, agent-entry, scoped-runner) prints ONE
// line with its real/effective uid+gid and a capability summary, so the pod-log two-uid proof no longer
// rests on inference. The line carries ONLY ids + cap names — never a secret, env value, prompt text, or
// path content (manifest invariants 3/10).

import { readFileSync } from "node:fs";

/** Capability bit → name (linux/capability.h order) for the summary decode. */
const CAP_NAMES: readonly string[] = [
  "chown", "dac_override", "dac_read_search", "fowner", "fsetid", "kill", "setgid", "setuid",
  "setpcap", "linux_immutable", "net_bind_service", "net_broadcast", "net_admin", "net_raw",
  "ipc_lock", "ipc_owner", "sys_module", "sys_rawio", "sys_chroot", "sys_ptrace", "sys_pacct",
  "sys_admin", "sys_boot", "sys_nice", "sys_resource", "sys_time", "sys_tty_config", "mknod",
  "lease", "audit_write", "audit_control", "setfcap", "mac_override", "mac_admin", "syslog",
  "wake_alarm", "block_suspend", "audit_read", "perfmon", "bpf", "checkpoint_restore",
];

/** Decode the `/proc/self/status` CapEff hex mask into cap names ("unavailable" off-Linux). */
export function capSummary(status?: string): string {
  const text = status ?? readStatus();
  if (text === null) return "unavailable";
  const m = /^CapEff:\s*([0-9a-fA-F]+)\s*$/m.exec(text);
  if (!m) return "unavailable";
  let bits = BigInt(`0x${m[1]!}`);
  const names: string[] = [];
  for (let i = 0; bits > 0n && i < CAP_NAMES.length; i++, bits >>= 1n) {
    if (bits & 1n) names.push(CAP_NAMES[i]!);
  }
  return names.length ? names.join(",") : "none";
}

function readStatus(): string | null {
  try {
    return readFileSync("/proc/self/status", "utf8");
  } catch {
    return null; // non-Linux dev hosts — the line still prints the uid/gid half
  }
}

/**
 * The single identity line — `[<label>] identity uid=<uid> euid=<euid> gid=<gid> egid=<egid>
 * capEff=<names>`. getuid/geteuid/getgid/getegid are absent on Windows; default to -1 there.
 */
export function identityLine(label: string, status?: string): string {
  const uid = process.getuid?.() ?? -1;
  const euid = process.geteuid?.() ?? -1;
  const gid = process.getgid?.() ?? -1;
  const egid = process.getegid?.() ?? -1;
  return `[${label}] identity uid=${uid} euid=${euid} gid=${gid} egid=${egid} capEff=${capSummary(status)}`;
}
