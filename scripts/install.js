/**
 * WoWok Skills installer
 *
 * npm lifecycle integration:
 *   postinstall  → copy SKILL.md folders to ~/.claude/skills/ (and more via env)
 *   preuninstall → remove SKILL.md folders from all installed client dirs
 *
 * Environment variables:
 *   WOWOK_SKILLS_TARGETS  Comma-separated client targets (claude,cursor,windsurf,codebuddy,codex,trae,qoder,roo,copilot)
 *                         Defaults to "claude". Example: "claude,cursor,trae"
 *   WOWOK_SKILLS_NO_MCP   Set to "1" or "true" to skip MCP server management (default: auto-install MCP)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Retained skills (post GLM5-31 sink refactor) — only these are installed.
 * The 4 rule-reference skills (wowok-safety/tools/scenario/guard) were sunk
 * into the MCP knowledge layer and are served by the MCP server directly:
 *   - wowok-safety   → schema_query action='get_safety_rules'
 *   - wowok-tools    → schema_query action='get_tool_reference'
 *   - wowok-scenario → project_operation recommend_industry / create_project
 *   - wowok-guard    → schema_query action='get_guard_design_patterns'
 */
const SKILL_DIRS = [
  'wowok-provider',
  'wowok-arbitrator',
  'wowok-order',
  'wowok-messenger',
  'wowok-machine',
  'wowok-output',
  'wowok-onboard',
  'wowok-planner',
  'wowok-auditor',
];

/**
 * Deprecated skills removed in the GLM5-31 sink refactor. They are NEVER
 * installed, but preuninstall/init still clean them up from legacy installs
 * and warn the user where the content now lives.
 */
const LEGACY_SKILL_DIRS = [
  'wowok-guard',
  'wowok-tools',
  'wowok-safety',
  'wowok-scenario',
];

/** Where each deprecated skill's content now lives (migration message). */
const SKILL_MIGRATION_MAP = {
  'wowok-safety': "MCP schema_query action='get_safety_rules'",
  'wowok-tools': "MCP schema_query action='get_tool_reference'",
  'wowok-scenario': "MCP project_operation action='recommend_industry' / 'create_project'",
  'wowok-guard': "MCP schema_query action='get_guard_design_patterns'",
};

const CLIENT_DIRS = {
  claude: path.join(os.homedir(), '.claude', 'skills'),
  cursor: path.join(os.homedir(), '.cursor', 'rules'),
  windsurf: path.join(os.homedir(), '.windsurf', 'skills'),
  codebuddy: path.join(os.homedir(), '.codebuddy', 'skills'),
  codex: path.join(os.homedir(), '.codex', 'skills'),
  trae: path.join(os.homedir(), '.agents', 'skills'),
  qoder: path.join(os.homedir(), '.qoder', 'skills'),
  roo: path.join(os.homedir(), '.roo', 'skills'),
  agents: path.join(os.homedir(), '.agents', 'skills'), // deprecated alias
  copilot: path.join(os.homedir(), '.github', 'prompts'),
};

function getPackageRoot() {
  return path.resolve(__dirname, '..');
}

function copyDir(src, dest) {
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

function removeDir(dir) {
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

function getFileExt(target) {
  const exts = { claude: '.md', codex: '.md', agents: '.md', codebuddy: '.md', cursor: '.mdc', copilot: '.prompt.md' };
  return exts[target] || '.md';
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};
  let currentKey = null;
  let currentValue = '';
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

function convertSkill(content, target, skillDir) {
  if (target === 'cursor') {
    const parsed = parseFrontmatter(content);
    if (!parsed) return content;
    const { frontmatter, body } = parsed;
    let description = (frontmatter.description || frontmatter.name || skillDir);
    if (typeof description === 'string') {
      description = description.replace(/\n/g, ' ');
    }
    const isAlways = frontmatter.loading === 'always' || frontmatter.always === true;
    const alwaysApply = isAlways ? 'true' : 'false';
    const newFrontmatter = [
      '---',
      `description: "${description}"`,
      `alwaysApply: ${alwaysApply}`,
      '---',
    ].join('\n');
    return newFrontmatter + '\n' + body;
  }
  if (target === 'copilot') {
    const parsed = parseFrontmatter(content);
    if (!parsed) return content;
    return parsed.body;
  }
  return content;
}

function installSkills(targetDir, target) {
  const pkgRoot = getPackageRoot();
  const ext = getFileExt(target);
  let count = 0;

  fs.mkdirSync(targetDir, { recursive: true });

  for (const dir of SKILL_DIRS) {
    const src = path.join(pkgRoot, dir, 'SKILL.md');

    if (!fs.existsSync(src)) {
      console.warn(`[wowok-skills] WARN: SKILL.md not found for ${dir}`);
      continue;
    }

    const content = fs.readFileSync(src, 'utf-8');
    const converted = convertSkill(content, target, dir);
    const basename = (target === 'cursor' || target === 'copilot')
      ? `wowok-${dir.replace('wowok-', '')}${ext}`
      : 'SKILL.md';
    const destDir = path.join(targetDir, dir);
    const dest = path.join(destDir, basename);

    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, converted, 'utf-8');
    count++;
    console.log(`[wowok-skills]   installed: ${dir} → ${dest}`);
  }

  return count;
}

function uninstallSkills(targetDir) {
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

  return count;
}

/**
 * Detect deprecated skills still present in a target dir and print a
 * migration hint (GLM5-31 §3.2). Returns the list of legacy dirs found.
 */
function warnLegacySkills(targetDir) {
  const found = LEGACY_SKILL_DIRS.filter((dir) => fs.existsSync(path.join(targetDir, dir)));
  if (found.length > 0) {
    console.warn(`[wowok-skills] ⚠ MIGRATION: deprecated skills detected in ${targetDir}:`);
    for (const dir of found) {
      console.warn(`[wowok-skills]   - ${dir} → content now served by ${SKILL_MIGRATION_MAP[dir]}`);
    }
    console.warn('[wowok-skills]   These skills are stale (MCP knowledge layer is the source of truth).');
    console.warn('[wowok-skills]   Remove them with: wowok-skills uninit  (or delete the folders above)');
  }
  return found;
}

function getTargets() {
  const envTargets = process.env.WOWOK_SKILLS_TARGETS;
  if (!envTargets) {
    return ['claude'];
  }
  return envTargets.split(',').map(t => t.trim()).filter(t => CLIENT_DIRS[t]);
}

function main() {
  const event = process.env.npm_lifecycle_event || '';
  const skipMcp = process.env.WOWOK_SKILLS_NO_MCP === '1' || process.env.WOWOK_SKILLS_NO_MCP === 'true';

  if (event === 'postinstall') {
    const targets = getTargets();
    console.log(`[wowok-skills] Installing skills to ${targets.length} client(s)...`);

    let total = 0;
    for (const target of targets) {
      const dir = CLIENT_DIRS[target];
      console.log(`[wowok-skills] → ${dir}`);
      const count = installSkills(dir, target);
      total += count;
      // GLM5-31 §3.2: warn about stale pre-refactor skills still present.
      warnLegacySkills(dir);
    }

    console.log(`[wowok-skills] Done — ${total} skills installed across ${targets.length} client(s).`);

    // ─── MCP Server Management ───────────────────────────────────────
    console.log('');

    if (skipMcp) {
      console.log('[wowok-skills] WOWOK_SKILLS_NO_MCP=1 — skipping MCP server management.');
    } else {
      console.log('[wowok-skills] Checking MCP server...');

      // Step 1: Install or upgrade the MCP server
      const mcpChanged = ensureMcpServer();

      // Step 2: Write MCP config for each target client
      console.log('[wowok-skills] Registering MCP server in client config...');
      for (const target of targets) {
        writeMcpConfig(target);
      }

      // Step 3: Restart MCP server so the new version takes effect
      if (mcpChanged) {
        console.log('[wowok-skills] Restarting MCP server (so IDE picks up the new version)...');
        restartMcpServer();
      } else {
        console.log('[wowok-skills] MCP server unchanged — no restart needed.');
      }

      console.log('[wowok-skills] MCP server setup complete.');
    }
  } else if (event === 'preuninstall') {
    const targets = Object.keys(CLIENT_DIRS);
    console.log('[wowok-skills] Removing skills from all client dirs...');

    let total = 0;
    for (const target of targets) {
      const dir = CLIENT_DIRS[target];
      if (countExisting(dir) > 0) {
        console.log(`[wowok-skills] → ${dir}`);
        total += uninstallSkills(dir);
      }
    }

    console.log(`[wowok-skills] Done — ${total} skills removed.`);
  }
}

function countExisting(targetDir) {
  let count = 0;
  for (const dir of [...SKILL_DIRS, ...LEGACY_SKILL_DIRS]) {
    if (fs.existsSync(path.join(targetDir, dir))) {
      count++;
    }
  }
  return count;
}

// =========================================================================
// MCP Server Management — auto-install, upgrade, config, and restart
// =========================================================================

/** MCP server npm package name */
const MCP_PACKAGE = '@wowok/agent-mcp';

/**
 * MCP config entries per client target.
 * null means the client does not support MCP or manages it internally.
 */
const MCP_TARGET_CONFIGS = {
  claude: {
    configPath: path.join(os.homedir(), '.claude', 'settings.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  codebuddy: {
    configPath: path.join(os.homedir(), '.codebuddy', 'mcp.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  windsurf: {
    configPath: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  qoder: {
    configPath: process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Qoder', 'mcp-settings.json')
      : path.join(os.homedir(), '.config', 'qoder', 'mcp-settings.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  roo: {
    configPath: path.join(os.homedir(), '.roo', 'mcp_settings.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  // trae / agents: IDE-managed MCP via ~/.trae-cn/mcps/ directory structure — skip global config
  trae: null,
  agents: null,
  // cursor: MCP config is project-level, handled by `wowok-skills init` in project dir
  cursor: null,
  // copilot: user-level MCP config (Copilot CLI)
  copilot: {
    configPath: path.join(os.homedir(), '.copilot', 'mcp-config.json'),
    merge: (config) => {
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.wowok = { type: 'local', command: 'npx', args: ['-y', '@wowok/agent-mcp'] };
      return config;
    }
  },
  // codex: global TOML config (~/.codex/config.toml)
  codex: {
    configPath: path.join(os.homedir(), '.codex', 'config.toml'),
    format: 'toml',
  },
};

/**
 * Parse a semver string to its major version number.
 * Returns 0 for invalid/missing versions.
 */
function semverMajor(version) {
  if (!version) return 0;
  const parts = version.split('.');
  return parseInt(parts[0], 10) || 0;
}

/**
 * Get the currently installed global version of the MCP server.
 * Uses `npm ls -g <package>` (targeted, no tree scan) for speed.
 * Returns null if not installed.
 */
function getInstalledMcpVersion() {
  try {
    // npm ls -g <pkg> is faster than npm list -g because it skips
    // scanning unrelated packages in the global node_modules.
    const output = execSync(`npm ls -g ${MCP_PACKAGE} --depth=0 --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    const parsed = JSON.parse(output);
    // npm ls output has the package as a top-level key, not under dependencies
    const pkg = parsed.dependencies?.[MCP_PACKAGE] || parsed[MCP_PACKAGE];
    return pkg?.version || null;
  } catch {
    return null;
  }
}

/**
 * Get the latest available version from the npm registry.
 * Returns null on failure (offline, registry unreachable, etc.).
 */
function getLatestMcpVersion() {
  try {
    const output = execSync(`npm view ${MCP_PACKAGE} version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Install an npm package globally with retry logic.
 * Retries up to 2 times on failure (covers transient network errors).
 */
function npmInstallGlobal(pkg, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit', timeout: 120000 });
      return true;
    } catch (err) {
      if (attempt < retries) {
        console.log(`[wowok-skills]   npm install attempt ${attempt} failed, retrying...`);
        // Wait 2s before retry to let network recover
        execSync('ping -n 3 127.0.0.1 >nul', { stdio: 'pipe', timeout: 5000 });
      } else {
        console.error(`[wowok-skills]   npm install failed after ${retries} attempts: ${err.message}`);
        return false;
      }
    }
  }
  return false;
}

/**
 * Ensure the MCP server is installed and up to date.
 *
 *   - Not installed        → install latest
 *   - Outdated (same major) → upgrade to latest
 *   - Major version bump   → warn user, skip auto-upgrade
 *   - Up to date           → skip
 *
 * Returns true if the package was installed or upgraded (changed).
 */
function ensureMcpServer() {
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

    // Major version guard: warn if the latest version has a different major
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

/**
 * Write MCP server config entry for a given client target.
 * Safely merges with any existing MCP configuration.
 * Supports JSON format (most clients) and TOML format (Codex).
 */
function writeMcpConfig(target) {
  const cfg = MCP_TARGET_CONFIGS[target];
  if (!cfg) {
    console.log(`[wowok-skills]   MCP config: ${target} does not support external MCP registration (skipped).`);
    return false;
  }

  // ── TOML format (Codex CLI uses ~/.codex/config.toml) ──────────────
  if (cfg.format === 'toml') {
    try {
      const tomlEntry = '\n[mcp_servers.wowok]\ncommand = "npx"\nargs = ["-y", "@wowok/agent-mcp"]\n';
      let content = '';
      if (fs.existsSync(cfg.configPath)) {
        content = fs.readFileSync(cfg.configPath, 'utf-8');
      }
      if (content.includes('[mcp_servers.wowok]')) {
        console.log(`[wowok-skills]   MCP config already up to date: ${cfg.configPath}`);
        return false;
      }
      fs.mkdirSync(path.dirname(cfg.configPath), { recursive: true });
      fs.writeFileSync(cfg.configPath, content + tomlEntry, 'utf-8');
      console.log(`[wowok-skills]   MCP config written: ${cfg.configPath}`);
      return true;
    } catch (err) {
      console.error(`[wowok-skills]   ERROR writing MCP config for ${target}: ${err.message}`);
      return false;
    }
  }

  // ── JSON format (all other clients) ────────────────────────────────
  try {
    let config = {};
    const dir = path.dirname(cfg.configPath);
    if (fs.existsSync(cfg.configPath)) {
      config = JSON.parse(fs.readFileSync(cfg.configPath, 'utf-8'));
    }

    const before = JSON.stringify(config);
    config = cfg.merge(config);
    const after = JSON.stringify(config);

    if (before !== after) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cfg.configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[wowok-skills]   MCP config written: ${cfg.configPath}`);
      return true;
    }

    console.log(`[wowok-skills]   MCP config already up to date: ${cfg.configPath}`);
    return false;
  } catch (err) {
    console.error(`[wowok-skills]   ERROR writing MCP config for ${target}: ${err.message}`);
    return false;
  }
}

/**
 * Attempt to restart the running MCP server process.
 *
 * The MCP server is a child process of the IDE (Claude Code, Trae, etc.).
 * We cannot directly "start" it — only kill the existing process so the IDE
 * detects the exit and auto-restarts it with the new version.
 *
 * Best-effort: if the kill fails (no process running), it's harmless.
 */
function restartMcpServer() {
  try {
    if (process.platform === 'win32') {
      // Windows: use PowerShell (via -EncodedCommand to avoid quoting hell)
      const psScript =
        'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' AND CommandLine LIKE \'%wowok%agent-mcp%\'" | ' +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
        stdio: 'pipe',
        timeout: 10000,
      });
    } else {
      // Unix: pkill by command-line pattern
      execSync('pkill -f "wowok.*agent-mcp" 2>/dev/null || true', {
        stdio: 'pipe',
        timeout: 5000,
        shell: true,
      });
    }
    console.log('[wowok-skills] MCP server process terminated (IDE will auto-restart).');
    return true;
  } catch (e) {
    console.log('[wowok-skills] No running MCP server process found. Start your IDE to launch it.');
    return false;
  }
}

main();