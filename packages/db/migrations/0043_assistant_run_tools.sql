-- 0043_assistant_run_tools.sql — DEF.1 (F1): the assistant seat's run-side tool list on an
-- already-seeded database.
--
-- Live STB.3 finding: `agent_types` rows are seeded `on conflict do nothing` (code-seed.ts), so a
-- database first seeded before P1.11 kept the P0.02-era assistant tool list — `read, web_search,
-- web_fetch, measure, propose_outline, read_artifact, start_workflow` — with NO `write` token.
-- The §12.6 hook enforces `agent_types.tools` (`tool:Write` → deny), so every outline / research-burst
-- run on the assistant seat had its `Write` calls denied (`[hook] Write deny — the assistant seat may
-- not use Write`), wrote no artifacts and no `.rhema/phase-result.json`, and failed the completion
-- oracle's leg (b) — the F1 kill on outline `01M3DC1VYGJXM1G36TAR9D7F8W` and research
-- `01M3DETHZ8ENTRTSXH3SJ6Y2FW`.
--
-- Stamp the CURRENT §7.1/P1.11 tool list (the same list `agentTypesSeed` inserts on a fresh
-- database), PLUS `subagent`: the research_burst `fetch` phase declares `allowsSubagents: true`
-- (manifests/research_burst.ts) and the PRB.24 `research_fanout` prompt contract instructs the seat
-- to fan out to `researcher` subagents in bounded batches — without the token the hook denies `Agent`
-- (`[hook] Agent deny — the assistant seat may not use Agent`), stranding the fan-out the manifest
-- itself declares. The §12.6 phase policy still gates `Agent` per phase (judge-class and
-- `allowsSubagents: false` phases deny it), so the grant only takes effect where the manifest opts in.

update agent_types set
  tools = array[
    'read',
    'write',
    'web_search',
    'web_fetch',
    'read_artifact',
    'start_workflow',
    'propose_outline',
    'visualize',
    'elicit',
    'measure',
    'attach',
    'subagent'
  ]
where key = 'assistant';
