#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';
import { getSkills, getSkillByName, getRoleSkills, recommendSkills, getSkillsByRole, checkSkillMigration, DEPRECATED_SKILLS } from './skills';
import { SkillRole, ClientTarget, CLIENT_SKILL_DIRS, CLIENT_FILE_EXT, ALL_CLIENT_TARGETS } from './types';

/**
 * Skill directory names (must match folder names in package)
 * Must stay in sync with scripts/install.js SKILL_DIRS
 * Ordered by role for clarity:
 * - Customer: wowok-order
 * - Provider: wowok-provider, wowok-machine
 * - Arbitrator: wowok-arbitrator
 * - Shared: wowok-messenger, wowok-output
 * - Onboarding: wowok-onboard, wowok-planner, wowok-auditor
 *
 * GLM5-31 sink refactor: wowok-guard/tools/safety/scenario were sunk into
 * the MCP knowledge layer and are no longer installed (see DEPRECATED_SKILLS).
 */
const SKILL_DIRS = [
  'wowok-order',
  'wowok-provider',
  'wowok-machine',
  'wowok-arbitrator',
  'wowok-messenger',
  'wowok-output',
  'wowok-onboard',
  'wowok-planner',
  'wowok-auditor',
];

/**
 * Deprecated skill dirs — never installed, but uninit still removes them
 * from legacy installs so users can clean up pre-refactor installations.
 */
const LEGACY_SKILL_DIRS: string[] = [...DEPRECATED_SKILLS];

/**
 * Role display names for CLI output
 */
const ROLE_DISPLAY: Record<SkillRole, string> = {
  customer: '👤 Customer',
  provider: '🏪 Provider',
  arbitrator: '⚖️  Arbitrator',
  shared: '🛠️  Shared'
};

function getPackageRoot(): string {
  return path.resolve(__dirname, '..');
}

function copyDir(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

function removeDir(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDir(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dir);
}

function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter: Record<string, any> = {};
  let currentKey: string | null = null;
  let currentValue: string = '';
  for (const line of frontmatterStr.split('\n')) {
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      if (currentKey) {
        frontmatter[currentKey] = currentValue.trim();
      }
      currentKey = kvMatch[1];
      currentValue = kvMatch[2];
    } else if (currentKey) {
      currentValue += '\n' + line;
    }
  }
  if (currentKey) {
    frontmatter[currentKey] = currentValue.trim();
  }
  return { frontmatter, body };
}

function convertToCursor(content: string, skillDir: string): string {
  const parsed = parseFrontmatter(content);
  if (!parsed) return content;

  const { frontmatter, body } = parsed;
  let description = frontmatter.description || frontmatter.name || skillDir;
  if (typeof description === 'string') {
    description = description.replace(/\n/g, ' ');
  }
  const isAlways = frontmatter.loading === 'always' || frontmatter.always === true || frontmatter.always === 'true';
  const alwaysApply = isAlways ? 'true' : 'false';

  const newFrontmatter = [
    '---',
    `description: "${description}"`,
    `alwaysApply: ${alwaysApply}`,
    '---',
  ].join('\n');

  return newFrontmatter + '\n' + body;
}

function convertToCopilot(content: string): string {
  const parsed = parseFrontmatter(content);
  if (!parsed) return content;
  return parsed.body;
}

function convertSkillContent(content: string, target: string, skillDir: string): string {
  if (target === 'cursor') return convertToCursor(content, skillDir);
  if (target === 'copilot') return convertToCopilot(content);
  return content;
}

// =========================================================================
// MCP Server Management — shared by postinstall and `wowok-skills init`
// =========================================================================

const MCP_PACKAGE = '@wowok/agent-mcp';

type McpConfigEntry = { configPath: string; merge?: (config: any) => any; format?: 'toml' };
const MCP_TARGET_CONFIGS: Record<string, McpConfigEntry | null> = {
  claude: {
    configPath: path.join(os.homedir(), '.claude', 'settings.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  codebuddy: {
    configPath: path.join(os.homedir(), '.codebuddy', 'mcp.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  windsurf: {
    configPath: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  qoder: {
    configPath: process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Qoder', 'mcp-settings.json')
      : path.join(os.homedir(), '.config', 'qoder', 'mcp-settings.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  roo: {
    configPath: path.join(os.homedir(), '.roo', 'mcp_settings.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  // trae / agents: IDE-managed MCP via ~/.trae-cn/mcps/ directory structure
  trae: null,
  agents: null,
  // cursor: project-level only
  cursor: null,
  // copilot: user-level MCP config (Copilot CLI)
  copilot: {
    configPath: path.join(os.homedir(), '.copilot', 'mcp-config.json'),
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { type: 'local', command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  // codex: global TOML config (~/.codex/config.toml)
  codex: {
    configPath: path.join(os.homedir(), '.codex', 'config.toml'),
    format: 'toml' as const,
  },
};

/** Project-level MCP configs (written relative to cwd). */
const MCP_PROJECT_CONFIGS: Record<string, { configPath: string; merge: (config: any) => any } | null> = {
  cursor: {
    configPath: '.cursor/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  windsurf: {
    configPath: '.windsurf/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  trae: {
    configPath: '.trae/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  agents: {
    configPath: '.trae/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  qoder: {
    configPath: '.qoder/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
  roo: {
    configPath: '.roo/mcp.json',
    merge: (config: any) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    },
  },
};

function getInstalledMcpVersion(): string | null {
  try {
    const output = execSync(`npm ls -g ${MCP_PACKAGE} --depth=0 --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    const parsed = JSON.parse(output);
    const pkg = parsed.dependencies?.[MCP_PACKAGE] || parsed[MCP_PACKAGE];
    return pkg?.version || null;
  } catch { return null; }
}

function getLatestMcpVersion(): string | null {
  try {
    const output = execSync(`npm view ${MCP_PACKAGE} version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    return output.trim();
  } catch { return null; }
}

function semverMajor(version: string | null): number {
  if (!version) return 0;
  const parts = version.split('.');
  return parseInt(parts[0], 10) || 0;
}

function npmInstallGlobal(pkg: string, retries = 2): boolean {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit', timeout: 120000 });
      return true;
    } catch (err: any) {
      if (attempt < retries) {
        console.log(`[wowok-skills]   npm install attempt ${attempt} failed, retrying...`);
        const waitCmd = process.platform === 'win32'
          ? 'ping -n 3 127.0.0.1 >nul'
          : 'sleep 2';
        execSync(waitCmd, { stdio: 'pipe', timeout: 5000 });
      } else {
        console.error(`[wowok-skills]   npm install failed after ${retries} attempts: ${err.message}`);
        return false;
      }
    }
  }
  return false;
}

function ensureMcpServer(): boolean {
  const currentVersion = getInstalledMcpVersion();
  const latestVersion = getLatestMcpVersion();

  if (currentVersion) {
    console.log(`[wowok-skills] MCP server ${MCP_PACKAGE} v${currentVersion} found.`);

    if (!latestVersion) {
      console.log(`[wowok-skills]   Cannot check latest version (offline or registry unreachable). Keeping v${currentVersion}.`);
      return false;
    }

    if (currentVersion === latestVersion) {
      console.log(`[wowok-skills] MCP server is up to date (v${currentVersion}).`);
      return false;
    }

    const currentMajor = semverMajor(currentVersion);
    const latestMajor = semverMajor(latestVersion);

    if (latestMajor > currentMajor) {
      console.warn(`[wowok-skills] ⚠ WARNING: Major version bump detected v${currentVersion} → v${latestVersion}.`);
      console.warn(`[wowok-skills]   Skipping auto-upgrade to avoid breaking changes.`);
      console.warn(`[wowok-skills]   To upgrade manually: npm install -g ${MCP_PACKAGE}@latest`);
      return false;
    }

    console.log(`[wowok-skills] Upgrading MCP server v${currentVersion} → v${latestVersion}...`);
    if (npmInstallGlobal(`${MCP_PACKAGE}@latest`)) {
      console.log(`[wowok-skills] MCP server upgraded to v${latestVersion}.`);
      return true;
    }
    console.error(`[wowok-skills] MCP server upgrade FAILED. Keeping v${currentVersion}.`);
    return false;
  }

  console.log(`[wowok-skills] Installing MCP server ${MCP_PACKAGE}...`);
  if (npmInstallGlobal(MCP_PACKAGE)) {
    console.log(`[wowok-skills] MCP server installed.`);
    return true;
  }
  console.error(`[wowok-skills] MCP server installation FAILED.`);
  return false;
}

function writeMcpConfig(target: string, configMap: Record<string, any>, cwd?: string): boolean {
  const cfg = configMap[target];
  if (!cfg) {
    console.log(`[wowok-skills]   MCP config: ${target} does not support external MCP registration (skipped).`);
    return false;
  }

  try {
    const configPath = cwd ? path.join(cwd, cfg.configPath) : cfg.configPath;

    // ── TOML format (Codex CLI uses ~/.codex/config.toml) ──────────────
    if (cfg.format === 'toml') {
      const tomlEntry = '\n[mcp_servers.wowok]\ncommand = "npx"\nargs = ["-y", "@wowok/agent-mcp"]\n';
      let content = '';
      if (fs.existsSync(configPath)) {
        content = fs.readFileSync(configPath, 'utf-8');
      }
      if (content.includes('[mcp_servers.wowok]')) {
        console.log(`[wowok-skills]   MCP config already up to date: ${configPath}`);
        return false;
      }
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, content + tomlEntry, 'utf-8');
      console.log(`[wowok-skills]   MCP config written: ${configPath}`);
      return true;
    }

    // ── JSON format (all other clients) ────────────────────────────────
    let config: any = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const before = JSON.stringify(config);
    config = cfg.merge(config);
    const after = JSON.stringify(config);

    if (before !== after) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[wowok-skills]   MCP config written: ${configPath}`);
      return true;
    }

    console.log(`[wowok-skills]   MCP config already up to date: ${configPath}`);
    return false;
  } catch (err: any) {
    console.error(`[wowok-skills]   ERROR writing MCP config for ${target}: ${err.message}`);
    return false;
  }
}

function restartMcpServer(): void {
  try {
    if (process.platform === 'win32') {
      const psScript =
        'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' AND CommandLine LIKE \'%wowok%agent-mcp%\'" | ' +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'pipe', timeout: 10000 });
    } else {
      execSync('pkill -f "wowok.*agent-mcp" 2>/dev/null || true', { stdio: 'pipe', timeout: 5000 });
    }
    console.log('[wowok-skills] MCP server process terminated (IDE will auto-restart).');
  } catch {
    console.log('[wowok-skills] No running MCP server process found. Start your IDE to launch it.');
  }
}

function getTargets(targetArg: string | undefined): Exclude<ClientTarget, 'all'>[] {
  if (!targetArg || targetArg === 'claude') {
    return ['claude'];
  }
  if (targetArg === 'all') {
    return [...ALL_CLIENT_TARGETS];
  }
  if (ALL_CLIENT_TARGETS.includes(targetArg as any)) {
    return [targetArg as Exclude<ClientTarget, 'all'>];
  }
  console.error(`Invalid target: "${targetArg}"`);
  console.error('');
  console.error('Supported targets:');
  console.error('  claude       .claude/skills/       (Claude Code)');
  console.error('  cursor       .cursor/rules/        (Cursor IDE)');
  console.error('  windsurf     .windsurf/skills/     (Windsurf / Codeium)');
  console.error('  codebuddy    .codebuddy/skills/    (CodeBuddy)');
  console.error('  codex        .codex/skills/        (OpenAI Codex / ChatGPT Desktop Codex Mode)');
  console.error('  trae         .agents/skills/       (Trae CN & Trae Work)');
  console.error('  qoder        .qoder/skills/        (Qoder / Qoder CN)');
  console.error('  roo          .roo/skills/          (Roo Code)');
  console.error('  copilot      .github/prompts/      (GitHub Copilot)');
  console.error('  all          All of the above');
  process.exit(1);
}

function cmdInit(targetArg: string | undefined, withMcp: boolean, referrer?: string): void {
  const cwd = process.cwd();
  const pkgRoot = getPackageRoot();
  const targets = getTargets(targetArg);
  let totalCount = 0;

  for (const target of targets) {
    const skillsDir = CLIENT_SKILL_DIRS[target];
    const targetDir = path.join(cwd, skillsDir);
    const ext = CLIENT_FILE_EXT[target];
    let count = 0;

    fs.mkdirSync(targetDir, { recursive: true });

    for (const dir of SKILL_DIRS) {
      const src = path.join(pkgRoot, dir, 'SKILL.md');
      if (!fs.existsSync(src)) {
        console.warn(`[wowok-skills] WARN: SKILL.md not found for ${dir}`);
        continue;
      }

      const content = fs.readFileSync(src, 'utf-8');
      const converted = convertSkillContent(content, target, dir);
      const basename = target === 'cursor' || target === 'copilot'
        ? `wowok-${dir.replace('wowok-', '')}${ext}`
        : 'SKILL.md';
      const destDir = path.join(targetDir, dir);
      const dest = path.join(destDir, basename);

      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(dest, converted, 'utf-8');
      count++;
      console.log(`[wowok-skills]   installed: ${dest}`);
    }

    totalCount += count;
    console.log(`[wowok-skills] Done — ${count} skills installed to ${targetDir}`);

    // GLM5-31 §3.2: detect stale pre-refactor skills and print migration hint.
    const legacyFound = LEGACY_SKILL_DIRS.filter((dir) => fs.existsSync(path.join(targetDir, dir)));
    if (legacyFound.length > 0) {
      const migration = checkSkillMigration(legacyFound);
      console.warn(`\n[wowok-skills] ⚠ ${migration.message}`);
      console.warn('[wowok-skills] Remove them with: wowok-skills uninit\n');
    }
  }

  if (targets.length > 1) {
    console.log(`[wowok-skills] Total: ${totalCount} skills across ${targets.length} clients.`);
  }

  // ─── MCP setup (default: enabled, use --no-mcp to skip) ────────────
  if (withMcp) {
    console.log('');
    console.log('[wowok-skills] Setting up MCP server (use --no-mcp to skip)...');

    const mcpChanged = ensureMcpServer();

    console.log('[wowok-skills] Registering MCP server in client config...');
    for (const target of targets) {
      // Global-level config (Claude, CodeBuddy, Windsurf, Qoder, Roo)
      writeMcpConfig(target, MCP_TARGET_CONFIGS);
      // Project-level config (Cursor, Windsurf, Trae, Qoder, Roo)
      writeMcpConfig(target, MCP_PROJECT_CONFIGS, cwd);
    }

    if (mcpChanged) {
      console.log('[wowok-skills] Restarting MCP server...');
      restartMcpServer();
    }

    console.log('[wowok-skills] MCP server setup complete.');
  } else {
    console.log('');
    console.log('[wowok-skills] --no-mcp: MCP server setup skipped (skills only).');
  }

  // ─── Airdrop referrer (--referrer <addr|name>) ─────────────────────
  // Persist it in the MCP data dir; the MCP auto-injects it into every call,
  // so it is recorded on-chain at the user's first real on-chain interaction.
  // No manual "tell your AI" step needed.
  if (referrer) {
    saveReferrer(referrer);
  }
}

function cmdUninit(targetArg?: string): void {
  const cwd = process.cwd();
  const targets = getTargets(targetArg);
  let totalCount = 0;

  for (const target of targets) {
    const skillsDir = CLIENT_SKILL_DIRS[target];
    const targetDir = path.join(cwd, skillsDir);
    let count = 0;

    // Remove both retained and legacy (deprecated) skills — legacy dirs may
    // still exist from pre-refactor installs and must be cleaned up.
    for (const dir of [...SKILL_DIRS, ...LEGACY_SKILL_DIRS]) {
      const dirPath = path.join(targetDir, dir);
      if (fs.existsSync(dirPath)) {
        removeDir(dirPath);
        count++;
        console.log(`[wowok-skills]   removed: ${dirPath}`);
      }
    }

    totalCount += count;
    if (count === 0) {
      console.log(`[wowok-skills] No skills found in ${targetDir}. Nothing to remove.`);
    } else {
      console.log(`[wowok-skills] Done — ${count} skills removed from ${targetDir}`);
    }
  }

  if (targets.length > 1 && totalCount > 0) {
    console.log(`[wowok-skills] Total: ${totalCount} skills across ${targets.length} clients.`);
  }
}

function cmdList(): void {
  console.log('Available WoWok Skills (organized by role):\n');
  
  const roleSkills = getRoleSkills();
  for (const roleGroup of roleSkills) {
    console.log(`${ROLE_DISPLAY[roleGroup.role]}`);
    console.log(`  ${roleGroup.description}`);
    for (const skill of roleGroup.skills) {
      const loading = skill.loading === 'always' ? '[always]' : '[on-demand]';
      console.log(`    • ${skill.name} ${loading}`);
      console.log(`      ${skill.description}`);
    }
    console.log('');
  }
}

function cmdGet(name: string): void {
  const skill = getSkillByName(name);
  if (skill) {
    console.log(`Name: ${skill.name}`);
    console.log(`Role: ${ROLE_DISPLAY[skill.role]}`);
    console.log(`Loading: ${skill.loading}`);
    console.log(`Version: ${skill.version}`);
    console.log(`Description: ${skill.description}`);
    if (skill.related && skill.related.length > 0) {
      console.log(`Related: ${skill.related.join(', ')}`);
    }
  } else {
    console.error(`Skill not found: ${name}`);
    process.exit(1);
  }
}

function cmdRecommend(intent: string): void {
  const recommended = recommendSkills(intent);
  console.log(`Recommended skills for: "${intent}"\n`);
  
  // Group by role
  const byRole: Record<string, typeof recommended> = {};
  for (const skill of recommended) {
    if (!byRole[skill.role]) byRole[skill.role] = [];
    byRole[skill.role].push(skill);
  }
  
  for (const [role, skills] of Object.entries(byRole)) {
    console.log(`${ROLE_DISPLAY[role as SkillRole]}:`);
    for (const skill of skills) {
      console.log(`  • ${skill.name}`);
    }
    console.log('');
  }
}

function cmdRole(role: string): void {
  if (!['customer', 'provider', 'arbitrator', 'shared'].includes(role)) {
    console.error(`Invalid role: ${role}`);
    console.error('Valid roles: customer, provider, arbitrator, shared');
    process.exit(1);
  }
  
  const skills = getSkillsByRole(role as SkillRole);
  console.log(`${ROLE_DISPLAY[role as SkillRole]} Skills:\n`);
  for (const skill of skills) {
    const loading = skill.loading === 'always' ? '[always]' : '[on-demand]';
    console.log(`  • ${skill.name} ${loading}`);
    console.log(`    ${skill.description}`);
  }
}

function printUsage(): void {
  console.log('WoWok Skills CLI');
  console.log('Usage: wowok-skills <command> [args]');
  console.log('');
  console.log('Commands:');
  console.log('  list                    List all available skills (by role)');
  console.log('  get <name>              Show skill details');
  console.log('  role <role>             List skills for a role (customer|provider|arbitrator|shared)');
  console.log('  recommend <intent>      Recommend skills based on user intent');
  console.log('  init [--target <t>] [--no-mcp] [--referrer <addr|name>]   Install skills to project (default: .claude/skills/ with MCP)');
  console.log('                              --no-mcp     Skip MCP server setup (skills only)');
  console.log('                              --referrer   Save the airdrop referrer; auto-recorded on first on-chain interaction');
  console.log('  referrer <addr|name>      Save the airdrop referrer GLOBALLY (no project needed)');
  console.log('  uninit [--target <t>]   Remove skills from project');
  console.log('');
  console.log('Targets:');
  console.log('  claude       .claude/skills/       (Claude Code)');
  console.log('  cursor       .cursor/rules/        (Cursor IDE)');
  console.log('  windsurf     .windsurf/skills/     (Windsurf / Codeium)');
  console.log('  codebuddy    .codebuddy/skills/    (CodeBuddy)');
  console.log('  codex        .codex/skills/        (OpenAI Codex / ChatGPT Desktop Codex Mode)');
  console.log('  trae         .agents/skills/       (Trae CN & Trae Work)');
  console.log('  qoder        .qoder/skills/        (Qoder / Qoder CN)');
  console.log('  roo          .roo/skills/          (Roo Code)');
  console.log('  copilot      .github/prompts/      (GitHub Copilot)');
  console.log('  all          All of the above');
  console.log('');
  console.log('Examples:');
  console.log('  wowok-skills list');
  console.log('  wowok-skills get wowok-provider');
  console.log('  wowok-skills role provider');
  console.log('  wowok-skills recommend "create a service"');
  console.log('  wowok-skills init');
  console.log('  wowok-skills init --target agents');
  console.log('  wowok-skills init --target all');
  console.log('  wowok-skills init --no-mcp');
  console.log('  wowok-skills init --target cursor --no-mcp');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'list':
      cmdList();
      break;

    case 'get':
      if (args.length < 2) {
        console.error('Error: Skill name required');
        process.exit(1);
      }
      cmdGet(args[1]);
      break;

    case 'role':
      if (args.length < 2) {
        console.error('Error: Role required (customer|provider|arbitrator|shared)');
        process.exit(1);
      }
      cmdRole(args[1]);
      break;

    case 'recommend':
      if (args.length < 2) {
        console.error('Error: Intent description required');
        process.exit(1);
      }
      cmdRecommend(args.slice(1).join(' '));
      break;

    case 'init': {
      const rest = args.slice(1);
      const withMcp = !rest.includes('--no-mcp');
      const referrer = parseReferrerArg(rest);
      cmdInit(parseTargetArg(rest), withMcp, referrer);
      break;
    }

    case 'uninit':
      cmdUninit(parseTargetArg(args.slice(1)));
      break;

    case 'referrer': {
      const value = args[1];
      if (!value || value.startsWith('--')) {
        console.error('Error: Referrer address or name required — wowok-skills referrer <addr|name>');
        process.exit(1);
      }
      saveReferrer(value);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function parseTargetArg(rest: string[]): string | undefined {
  // Check for --target <value> first
  const idx = rest.indexOf('--target');
  if (idx !== -1 && idx + 1 < rest.length) {
    return rest[idx + 1];
  }
  // Check for positional argument (first non-flag arg)
  const positional = rest.find(a => !a.startsWith('--'));
  if (positional && ALL_CLIENT_TARGETS.includes(positional as any)) {
    return positional;
  }
  return undefined;
}

function parseReferrerArg(rest: string[]): string | undefined {
  const idx = rest.indexOf('--referrer');
  if (idx !== -1 && idx + 1 < rest.length) {
    const v = rest[idx + 1].trim();
    return v || undefined;
  }
  return undefined;
}

/** Wow MCP data dir — mirrors @wowok/wowok getWowMcpDir(): dirname(wowDir)/mcp. */
function wowMcpDir(): string {
  const home = os.homedir();
  let wowDir: string;
  if (process.env.WOWOK_DATA_DIR) {
    wowDir = process.env.WOWOK_DATA_DIR;
  } else if (process.platform === 'win32') {
    wowDir = path.join(home, '.wow', 'V1');
  } else if (process.platform === 'darwin') {
    wowDir = path.join(home, 'Library', 'Application Support', '.wow', 'V1');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    if (xdgConfig) {
      wowDir = path.join(xdgConfig, '.wow', 'V1');
    } else {
      const xdgData = process.env.XDG_DATA_HOME;
      wowDir = xdgData ? path.join(xdgData, '.wow', 'V1') : path.join(home, '.wow', 'V1');
    }
  }
  return path.join(path.dirname(wowDir), 'mcp');
}

/** Persist the airdrop referrer so the MCP auto-injects it on every call. */
function saveReferrer(referrer: string): void {
  const dir = wowMcpDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'referrer'), referrer.trim() + '\n', 'utf-8');
  console.log(`[wowok-skills] airdrop referrer saved: ${referrer.trim()}`);
  console.log('[wowok-skills] it is auto-recorded on your first on-chain interaction.');
}

main();
