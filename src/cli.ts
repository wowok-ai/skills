#!/usr/bin/env node

/**
 * `wowok-skills` CLI.
 *
 * All installation/MCP logic lives in src/installer.ts + src/targets.ts so the
 * CLI and the npm postinstall hook can never drift apart again.
 */

import { getSkillsByRole, getRoleSkills, getSkillByName, recommendSkills } from './skills';
import { SkillRole } from './types';
import {
  CLIENT_TARGETS,
  DEFAULT_TARGET_IDS,
  MANIFEST_FILE,
  expandHome,
  resolveSkillRoots,
  type ClientTargetId,
} from './targets';
import {
  ensureMcpServer,
  installSkillsForTargets,
  packageVersion,
  registerMcpForTargets,
  resolveMcpLaunch,
  resolveTargets,
  restartMcpServer,
  saveReferrer,
  statusForTargets,
  uninstallSkillsForTargets,
} from './installer';

const ROLE_DISPLAY: Record<SkillRole, string> = {
  customer: '👤 Customer',
  provider: '🏪 Provider',
  supplier: '📦 Supplier',
  collaborator: '🤝 Collaborator',
  arbitrator: '⚖️  Arbitrator',
  shared: '🛠️  Shared',
};

// =========================================================================
// Informational commands
// =========================================================================

function cmdList(): void {
  console.log('Available WoWok Skills (by role):\n');
  for (const group of getRoleSkills()) {
    console.log(ROLE_DISPLAY[group.role]);
    console.log(`  ${group.description}`);
    for (const skill of group.skills) {
      const loading = skill.loading === 'always' ? '[always]' : '[on-demand]';
      console.log(`    • ${skill.name} ${loading}`);
      console.log(`      ${skill.description}`);
    }
    console.log('');
  }
}

function cmdGet(name: string): void {
  const skill = getSkillByName(name);
  if (!skill) {
    console.error(`Skill not found: ${name}`);
    process.exit(1);
  }
  console.log(`Name: ${skill.name}`);
  console.log(`Role: ${ROLE_DISPLAY[skill.role]}`);
  console.log(`Loading: ${skill.loading}`);
  console.log(`Version: ${skill.version}`);
  console.log(`Description: ${skill.description}`);
  if (skill.related?.length) console.log(`Related: ${skill.related.join(', ')}`);
}

function cmdRole(role: string): void {
  const roles: SkillRole[] = ['customer', 'provider', 'supplier', 'collaborator', 'arbitrator', 'shared'];
  if (!roles.includes(role as SkillRole)) {
    console.error(`Invalid role: ${role}`);
    console.error(`Valid roles: ${roles.join(' | ')}`);
    process.exit(1);
  }
  console.log(`${ROLE_DISPLAY[role as SkillRole]} Skills:\n`);
  for (const skill of getSkillsByRole(role as SkillRole)) {
    const loading = skill.loading === 'always' ? '[always]' : '[on-demand]';
    console.log(`  • ${skill.name} ${loading}`);
    console.log(`    ${skill.description}`);
  }
}

function cmdRecommend(intent: string): void {
  const recommended = recommendSkills(intent);
  console.log(`Recommended skills for: "${intent}"\n`);
  if (recommended.length === 0) {
    console.log('  (no skill matches — this knowledge is served by the MCP server directly)');
    return;
  }
  const byRole: Record<string, string[]> = {};
  for (const skill of recommended) (byRole[skill.role] ||= []).push(skill.name);
  for (const [role, names] of Object.entries(byRole)) {
    console.log(`${ROLE_DISPLAY[role as SkillRole]}:`);
    for (const name of names) console.log(`  • ${name}`);
    console.log('');
  }
}

// =========================================================================
// Install / uninstall
// =========================================================================

interface ParsedArgs {
  targets?: string[];
  noMcp: boolean;
  referrer?: string;
  force: boolean;
  user: boolean;
  project: boolean;
}

function parseInitArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { noMcp: false, force: false, user: false, project: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' || arg === '-t') {
      const value = args[++i];
      if (value) parsed.targets = value.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (arg === '--no-mcp') {
      parsed.noMcp = true;
    } else if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--user') {
      parsed.user = true;
    } else if (arg === '--project') {
      parsed.project = true;
    } else if (arg === '--referrer') {
      parsed.referrer = args[++i]?.trim() || undefined;
    } else if (!arg.startsWith('-') && DEFAULT_TARGET_IDS.includes(arg as ClientTargetId)) {
      parsed.targets = [arg];
    }
  }
  return parsed;
}

function printTargets(): void {
  console.log('Targets (--target <t> — repeatable, comma-separated; omit for all):');
  for (const target of CLIENT_TARGETS) {
    const roots = target.projectSkillDirs.join(', ');
    console.log(`  ${target.id.padEnd(10)} project: ${roots.padEnd(20)} ${target.label}`);
  }
  console.log(`  ${'all'.padEnd(10)} every target above (default)`);
}

function cmdInit(parsed: ParsedArgs): void {
  const { targets, unknown } = resolveTargets(parsed.targets);
  if (unknown.length > 0) {
    console.error(`Unknown target(s): ${unknown.join(', ')}`);
    console.error('');
    printTargets();
    process.exit(1);
  }

  const scopes: Array<'user' | 'project'> = parsed.user || parsed.project
    ? [...(parsed.user ? (['user'] as const) : []), ...(parsed.project ? (['project'] as const) : [])]
    : ['user', 'project'];

  // Project scope always targets the current working directory.
  const cwd = process.cwd();

  console.log(`[wowok-skills] Installing skills (${scopes.join(' + ')}) for ${targets.length} target(s)...`);
  const results = installSkillsForTargets(targets, scopes, cwd, { force: parsed.force });
  for (const r of results) {
    console.log(
      `  → ${r.root}\n    ${r.written} written · ${r.unchanged} up to date · ${r.pruned} pruned · ${r.legacyRemoved} deprecated removed`,
    );
    for (const err of r.errors) console.error(`    ERROR: ${err}`);
  }

  if (!parsed.noMcp) {
    console.log('');
    console.log('[wowok-skills] Checking MCP server...');
    const changed = ensureMcpServer();
    const launch = resolveMcpLaunch();
    console.log(`[wowok-skills] launcher: ${launch.command} ${launch.args.join(' ')}`);
    const mcpScopes: Array<'user' | 'project'> = parsed.project
      ? ['project']
      : parsed.user
        ? ['user']
        : ['user', 'project'];
    console.log('[wowok-skills] Registering MCP server...');
    // Explicitly selected targets always get their registration; a default
    // (all-targets) run skips clients with no trace on this machine (skills#3).
    const explicitTargets = (parsed.targets?.length ?? 0) > 0;
    for (const r of registerMcpForTargets(targets, mcpScopes, cwd, { explicitTargets })) {
      console.log(`  ${r.status.padEnd(9)} ${r.path}${r.detail ? `  (${r.detail})` : ''}`);
    }
    if (changed) restartMcpServer();
  } else {
    console.log('[wowok-skills] --no-mcp: MCP setup skipped.');
  }

  if (parsed.referrer) {
    console.log('');
    saveReferrer(parsed.referrer);
  }

  console.log('');
  console.log('[wowok-skills] Done. Verify with: wowok-skills doctor');
}

function cmdUninit(parsed: ParsedArgs): void {
  const { targets, unknown } = resolveTargets(parsed.targets);
  if (unknown.length > 0) {
    console.error(`Unknown target(s): ${unknown.join(', ')}`);
    process.exit(1);
  }
  const scopes: Array<'user' | 'project'> = parsed.user || parsed.project
    ? [...(parsed.user ? (['user'] as const) : []), ...(parsed.project ? (['project'] as const) : [])]
    : ['user', 'project'];
  const removed = uninstallSkillsForTargets(targets, scopes, process.cwd());
  console.log(`[wowok-skills] Removed ${removed} skill director${removed === 1 ? 'y' : 'ies'}.`);
  console.log('[wowok-skills] MCP config entries are left in place — delete the "wowok" entry manually if unwanted.');
}

function cmdDoctor(): void {
  const cwd = process.cwd();
  const { targets } = resolveTargets(undefined);
  console.log(`WoWok Skills doctor · CLI v${packageVersion()}`);
  console.log(`Dirs: home=${expandHome('~')}  cwd=${cwd}\n`);

  const launch = resolveMcpLaunch();
  console.log(`MCP launcher: ${launch.command} ${launch.args.join(' ')}`);
  console.log(
    launch.command === 'node'
      ? '  ✔ version-pinned to the verified global install, Windows-safe\n'
      : '  ⚠ falling back to npx (global install not found) — run: npm install -g @wowok/agent-mcp\n',
  );

  const statuses = statusForTargets(targets, cwd);
  for (const status of statuses) {
    console.log(`${status.label}  [${status.id}]`);
    const sections: Array<[string, typeof status.userRoots]> = [
      ['user   ', status.userRoots],
      ['project', status.projectRoots],
    ];
    for (const [label, roots] of sections) {
      for (const root of roots) {
        if (!root.present) {
          // Project roots only matter inside a project — report quietly.
          console.log(`  ${label}  ✗ not installed  ${root.root}`);
          continue;
        }
        const total = root.fresh + root.stale + root.missing;
        const marker = total === 13 && root.stale === 0 && root.missing === 0 ? '✔' : '⚠';
        console.log(
          `  ${label}  ${marker} ${root.fresh} current / ${root.stale} stale / ${root.missing} missing` +
            `${root.legacy > 0 ? ` / ${root.legacy} deprecated` : ''}` +
            `  ${root.root}${root.manifestVersion ? `  (installed by v${root.manifestVersion})` : ''}`,
        );
      }
    }
    for (const mcp of status.mcp) {
      if (!mcp.present) {
        console.log(
          `  mcp     ○ no config file  ${mcp.path}${status.clientDetected ? '' : '  · client not detected'}`,
        );
        continue;
      }
      console.log(`  mcp     ${mcp.registered ? '✔' : '✗'} ${mcp.path}${mcp.detail ? `\n            ↳ ${mcp.detail}` : ''}`);
    }
    for (const note of status.notes) console.log(`  note    ↳ ${note}`);
    console.log('');
  }

  const problems = statuses.filter((s) =>
    [...s.userRoots, ...s.projectRoots].some((r) => r.present && (r.stale > 0 || r.missing > 0 || r.legacy > 0)),
  );
  console.log('-----------------------------------------------------------');
  console.log(`Manifest file written per root: ${MANIFEST_FILE}`);
  console.log(
    problems.length === 0
      ? '✅ No stale installs detected.'
      : `⚠ ${problems.length} root(s) need a refresh — run: wowok-skills init --force`,
  );
  console.log('Tip: `wowok-skills init` inside a project adds project-scoped copies (team sharing via git).');
}

// =========================================================================
// Help
// =========================================================================

function printUsage(): void {
  console.log('WoWok Skills CLI');
  console.log('Usage: wowok-skills <command> [options]\n');
  console.log('Commands:');
  console.log('  list                       List all skills (by role)');
  console.log('  get <name>                 Show skill details');
  console.log('  role <role>                List skills for a role');
  console.log('  recommend <intent>         Recommend skills from a user intent');
  console.log('  init [options]             Install skills + register MCP (default: user + project, all targets)');
  console.log('  uninit [options]           Remove installed skills (MCP entries are left alone)');
  console.log('  doctor                     Show per-client install + MCP registration state');
  console.log('  referrer <addr|name>       Save the airdrop referrer globally\n');
  console.log('Options:');
  console.log('  --target <t>               Target(s), comma separated (default: all)');
  console.log('  --user / --project         Restrict the scope (default: both for init)');
  console.log('  --force                    Rewrite every file even when unchanged');
  console.log('  --no-mcp                   Skip MCP server install/registration');
  console.log('  --referrer <addr|name>     Save the airdrop referrer during init\n');
  printTargets();
  console.log('\nExamples:');
  console.log('  wowok-skills init                        # all targets, user + project');
  console.log('  wowok-skills init --target claude,cursor --project');
  console.log('  wowok-skills doctor');
  console.log('  wowok-skills uninit --target codex');
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case 'list':
      cmdList();
      break;
    case 'get':
      if (!args[1]) {
        console.error('Error: skill name required');
        process.exit(1);
      }
      cmdGet(args[1]);
      break;
    case 'role':
      if (!args[1]) {
        console.error('Error: role required (customer|provider|supplier|collaborator|arbitrator|shared)');
        process.exit(1);
      }
      cmdRole(args[1]);
      break;
    case 'recommend':
      if (args.length < 2) {
        console.error('Error: intent description required');
        process.exit(1);
      }
      cmdRecommend(args.slice(1).join(' '));
      break;
    case 'init':
      cmdInit(parseInitArgs(args.slice(1)));
      break;
    case 'uninit':
      cmdUninit(parseInitArgs(args.slice(1)));
      break;
    case 'doctor':
      cmdDoctor();
      break;
    case 'referrer': {
      const value = args[1];
      if (!value || value.startsWith('--')) {
        console.error('Error: referrer address or name required — wowok-skills referrer <addr|name>');
        process.exit(1);
      }
      saveReferrer(value);
      break;
    }
    case 'targets':
      printTargets();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printUsage();
      process.exit(1);
  }
}

main();
