#!/usr/bin/env node
// Copyright (c) Wowok.
// SPDX-License-Identifier: Apache-2.0

/**
 * SKILL.md ↔ MCP parameter/tool drift audit.
 *
 * Skills are consumed verbatim by agents: a wrong tool name or parameter
 * shape in a SKILL.md produces a schema error on the agent's first MCP
 * call. validate-skills.mjs checks the file SHAPE; this script checks the
 * CONTENT against the MCP surface:
 *
 *   1. Every explicit call site (`tool: "x"`, `tool='x'`) must name a real
 *      MCP sub-tool (TOOL_INVENTORY, pinned to the @wowok/agent-mcp surface).
 *   2. Banned call shapes — concrete drift bugs that have shipped before:
 *      - `wowok_buildin_info` takes `info=`, NEVER `action=`
 *      - `migration_preflight` rejects `source=`/`target=`
 *        (the optional params are `source_network`/`target_network`)
 *      - `recommend_industry` requires `intent`
 *      - `search_messages` is SDK-only (not an MCP op) — use watch_messages filters
 *   3. Banned/dead URLs and stale strings.
 *
 * The skill repos do NOT depend on @wowok/agent-mcp, so this is a static
 * audit with a pinned inventory. When the MCP adds/renames a tool or a
 * parameter, extend TOOL_INVENTORY / RULES here. The source of truth is:
 *   agent/mcp/src/tools/registry/*.ts  (TOOL_REGISTRY names)
 *   agent/mcp/src/schema/**           (input schemas / discriminators)
 *
 * Usage
 *   node scripts/check-skill-mcp-drift.mjs          # audit (exit 1 on drift)
 *   node scripts/check-skill-mcp-drift.mjs --json   # machine-readable report
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const jsonOutput = process.argv.includes('--json');

/**
 * Pinned MCP sub-tool inventory (agent-mcp TOOL_REGISTRY).
 * Keep sorted; update when the MCP surface changes.
 */
const TOOL_INVENTORY = [
  'account_operation',
  'ask_user',
  'bridge_operation',
  'config_operation',
  'employee_operation',
  'goal_operation',
  'guard2file',
  'industry_pack_operation',
  'intent_radar',
  'keeper_operation',
  'local_history_operation',
  'local_info_operation',
  'local_mark_operation',
  'machineNode2file',
  'messenger_operation',
  'monitor_events',
  'monitor_subscription',
  'onchain_events',
  'onchain_operations',
  'onchain_table_data',
  'permission_operation',
  'persona_operation',
  'query_toolkit',
  'schema_query',
  'trust_score',
  'watch_operation',
  'wip_file',
  'workflow_operation',
  'wowok_buildin_info',
  'workspace_operation',
  'evaluation_operation',
];
const TOOL_SET = new Set(TOOL_INVENTORY);

/** Strings that must never appear in a shipped SKILL.md. */
const BANNED_STRINGS = [
  {
    id: 'dead-airdrop-host',
    pattern: /airdrop\.wowok\.net/,
    message: "airdrop.wowok.net does not resolve. Use https://wowok.net/airdrop.html (and don't hardcode round status — the page is the live source).",
  },
  {
    id: 'airdrop-under-construction',
    pattern: /airdrop[^.\n]{0,60}under construction/i,
    message: 'Do not state the airdrop is "under construction"; point to the airdrop page for live round status.',
  },
  {
    id: 'non-mcp-op-search-messages',
    pattern: /\bsearch_messages\b/,
    message: "'search_messages' is an SDK-only function, NOT an MCP messenger_operation op. Keyword/time/direction/status filtering is done via watch_messages filters (keyword/startTime/endTime/direction/status).",
  },
  {
    id: 'internal-graphql-query-name',
    pattern: /\bquery_(arbs|services|demands)\b/,
    message: "'query_arbs'/'query_services'/'query_demands' are internal GraphQL/data-layer names, NOT MCP tools. Describe the behavior (e.g. 'history is auto-fetched'; use match_discover/discover_services/discover_demands evaluation actions) instead.",
  },
  {
    id: 'hardcoded-network-testnet-example',
    pattern: /"network"\s*:\s*"testnet"/,
    message: 'Hardcoded "network": "testnet" in an example teaches the model to guess a network. The runtime stamps the user\'s CURRENT network (client UI selection) — OMIT env.network in examples; set it only when the user explicitly names a different network.',
  },
  {
    id: 'default-network-is-testnet-copy',
    pattern: /default network (is\s+)?\*{0,2}testnet/i,
    message: '"Default network is testnet" is stale guidance — the runtime resolves the USER\'S CURRENT network (client UI selection). Say: omit env.network; set it only when the user explicitly names a different network.',
  },
];

/**
 * Segment-scoped rule: only inspect the text from the tool name up to the
 * next different tool name, so a line that legitimately mentions two tools
 * ("`wowok_buildin_info` info=… + `schema_query` action=…") is handled.
 */
function toolSegment(line, tool) {
  const start = line.indexOf(tool);
  if (start === -1) return null;
  let end = line.length;
  for (const other of TOOL_INVENTORY) {
    if (other === tool) continue;
    const idx = line.indexOf(other, start + tool.length);
    if (idx !== -1) end = Math.min(end, idx);
  }
  // Also stop at a new sentence / clause when no other tool follows.
  return line.slice(start, end);
}

/** Line-level rules. Each returns an error message or null. */
const LINE_RULES = [
  {
    id: 'buildin-info-needs-info-param',
    check(line) {
      const seg = toolSegment(line, 'wowok_buildin_info');
      if (seg && /\baction\s*[=:]/.test(seg)) {
        return "wowok_buildin_info takes info= (e.g. info='funding guidance'), not action=. (schema_query / industry_pack_operation / goal_operation legitimately use action= — scoped to the buildin_info segment.)";
      }
      return null;
    },
  },
  {
    id: 'migration-preflight-network-param-names',
    check(line) {
      if (line.includes('migration_preflight') && /\b(source|target)\s*=/.test(line)) {
        return "migration_preflight rejects source=/target= — the optional overrides are source_network=/target_network= (account is required; direction defaults testnet → mainnet).";
      }
      return null;
    },
  },
  {
    id: 'recommend-industry-needs-intent',
    check(line) {
      // Only the actual invocation form `action='recommend_industry'` is
      // required to name `intent`; menu/table mentions are exempt.
      if (/action\s*[=:]\s*['"]recommend_industry['"]/.test(line) && !line.includes('intent')) {
        return "recommend_industry requires parameter intent=<business description text>; name it explicitly (a bare 'business description' leads agents to guess 'description', which is rejected).";
      }
      return null;
    },
  },
];

/** Explicit call-site tool names: tool: "x", tool: 'x', tool="x", tool='x'. */
const CALL_SITE_RE = /\btool\s*[:=]\s*['"]([a-z0-9_]+)['"]/g;

function auditFile(file) {
  const raw = readFileSync(file, 'utf-8');
  const errors = [];
  const lines = raw.split(/\r?\n/);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const rule of LINE_RULES) {
      const msg = rule.check(line);
      if (msg) errors.push({ line: lineNo, rule: rule.id, message: msg, text: line.trim() });
    }
    for (const banned of BANNED_STRINGS) {
      if (banned.pattern.test(line)) {
        errors.push({ line: lineNo, rule: banned.id, message: banned.message, text: line.trim() });
      }
    }
    const callSites = [...line.matchAll(CALL_SITE_RE)];
    for (const m of callSites) {
      if (!TOOL_SET.has(m[1])) {
        errors.push({
          line: lineNo,
          rule: 'unknown-mcp-tool',
          message: `'${m[1]}' is not an MCP sub-tool in the pinned inventory (${TOOL_INVENTORY.length} tools). If the MCP renamed/added it, update TOOL_INVENTORY in scripts/check-skill-mcp-drift.mjs; otherwise fix the call.`,
          text: line.trim(),
        });
      }
    }
  });

  return errors;
}

function listSkillDirs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function main() {
  const report = [];
  let totalErrors = 0;

  for (const skill of listSkillDirs()) {
    const file = join(ROOT, skill, 'SKILL.md');
    const errors = auditFile(file);
    report.push({ skill, errors });
    totalErrors += errors.length;
  }

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify({ totalErrors, report }, null, 2)}\n`);
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  WoWok Skills ↔ MCP Drift CI Audit');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Skills audited : ${report.length}`);
  console.log(`  MCP tools pinned: ${TOOL_INVENTORY.length}`);

  for (const { skill, errors } of report) {
    if (errors.length === 0) {
      console.log(`  🟢 ${skill}`);
    } else {
      console.log(`  🔴 ${skill} (${errors.length} drift issue${errors.length > 1 ? 's' : ''})`);
      for (const e of errors) {
        console.log(`      L${e.line} [${e.rule}] ${e.message}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════');
  if (totalErrors === 0) {
    console.log('  ✅ No SKILL.md ↔ MCP drift detected.');
  } else {
    console.log(`  🔴 ${totalErrors} drift issue(s) — fix the SKILL.md (or update the pinned MCP inventory if the MCP surface changed).`);
  }
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
