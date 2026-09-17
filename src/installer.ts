/**
 * The ONE installer implementation, shared by:
 *   - the npm lifecycle hook (scripts/install.js → dist/installer.js)
 *   - the CLI (`wowok-skills init|uninit|doctor` → src/cli.ts)
 *
 * Responsibilities
 *   - copy every SKILL.md to every resolved target root (idempotent, hash-based)
 *   - prune skills that this tool installed but no longer ships
 *   - clean up deprecated skills + pre-3.1 artifacts (cursor `.mdc` rules, …)
 *   - register the MCP server in each client's DOCUMENTED config file, using a
 *     Windows-safe launcher (`node <abs entry>` instead of bare `npx`)
 *   - report per-client state (`doctor`)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import {
  CLIENT_TARGETS,
  DEFAULT_TARGET_IDS,
  LEGACY_SKILL_NAMES,
  MANIFEST_FILE,
  MCP_PACKAGE,
  SKILL_MIGRATION_TARGETS,
  SKILL_NAMES,
  expandHome,
  getClientTarget,
  resolveMcpSpecs,
  resolveSkillRoots,
  type ClientTargetId,
  type McpLaunch,
  type McpSpec,
} from './targets';

// =========================================================================
// Small helpers
// =========================================================================

export function packageRoot(): string {
  return path.resolve(__dirname, '..');
}

export function packageVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf-8');
    return JSON.parse(raw).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function hashContent(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 16);
}

function readSkillSource(name: string): string | null {
  const file = path.join(packageRoot(), name, 'SKILL.md');
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function readJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Is `dir/<name>/SKILL.md` one of our artifacts (or a deprecated one)? */
function isOurSkillDir(dir: string, name: string): boolean {
  const file = path.join(dir, name, 'SKILL.md');
  if (!fs.existsSync(file)) return false;
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const m = raw.match(/^---\r?\n[\s\S]*?\bname:\s*([\w-]+)/);
    return !m || m[1] === name;
  } catch {
    return false;
  }
}

// =========================================================================
// Manifest (freshness + ownership)
// =========================================================================

interface Manifest {
  tool: string;
  version: string;
  updated_at: string;
  files: Record<string, string>;
}

function readManifest(root: string): Manifest | null {
  const m = readJson(path.join(root, MANIFEST_FILE));
  return m && typeof m === 'object' && m.files ? (m as Manifest) : null;
}

function writeManifest(root: string, files: Record<string, string>): void {
  const manifest: Manifest = {
    tool: '@wowok/skills',
    version: packageVersion(),
    updated_at: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

// =========================================================================
// Skills: install / uninstall / migrate
// =========================================================================

export interface RootInstallResult {
  root: string;
  written: number;
  unchanged: number;
  pruned: number;
  legacyRemoved: number;
  errors: string[];
}

/** Install (or refresh) every shipped skill into one root directory. */
export function installSkillsInto(root: string, opts: { force?: boolean } = {}): RootInstallResult {
  const result: RootInstallResult = {
    root,
    written: 0,
    unchanged: 0,
    pruned: 0,
    legacyRemoved: 0,
    errors: [],
  };

  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (err: any) {
    result.errors.push(`cannot create ${root}: ${err.message}`);
    return result;
  }

  // 1. Remove deprecated skills (v2.0 sink refactor) — only our own artifacts.
  for (const legacy of LEGACY_SKILL_NAMES) {
    const dir = path.join(root, legacy);
    if (fs.existsSync(dir) && isOurSkillDir(root, legacy)) {
      removeDir(dir);
      result.legacyRemoved++;
      console.log(
        `[wowok-skills]   removed deprecated skill: ${dir}  (now served by ${SKILL_MIGRATION_TARGETS[legacy]})`,
      );
    }
  }

  // 2. Write every shipped skill when its content differs.
  const previous = readManifest(root);
  const files: Record<string, string> = {};
  for (const name of SKILL_NAMES) {
    const content = readSkillSource(name);
    if (content === null) {
      result.errors.push(`SKILL.md not found in package for ${name}`);
      continue;
    }
    const hash = hashContent(content);
    files[name] = hash;
    const destDir = path.join(root, name);
    const dest = path.join(destDir, 'SKILL.md');
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf-8') : null;
    if (!opts.force && current !== null && hashContent(current) === hash) {
      result.unchanged++;
      continue;
    }
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, content, 'utf-8');
    result.written++;
  }

  // 3. Prune skills a previous version installed but this version no longer ships.
  if (previous) {
    for (const name of Object.keys(previous.files)) {
      if (SKILL_NAMES.includes(name)) continue;
      const dir = path.join(root, name);
      if (fs.existsSync(dir) && isOurSkillDir(root, name)) {
        removeDir(dir);
        result.pruned++;
        console.log(`[wowok-skills]   pruned obsolete skill: ${dir}`);
      }
    }
  }

  // 4. Remove pre-3.1 artifacts: dirs that only hold an old cursor `.mdc` rule.
  for (const name of [...SKILL_NAMES, ...LEGACY_SKILL_NAMES]) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    const onlyLegacyMdc =
      entries.length > 0 &&
      entries.every((e) => e === `${name}.mdc` || e === 'SKILL.md') &&
      entries.some((e) => e.endsWith('.mdc'));
    if (onlyLegacyMdc) {
      removeDir(dir);
      result.pruned++;
      console.log(`[wowok-skills]   removed legacy rule artifact: ${dir}`);
    }
  }

  writeManifest(root, files);
  return result;
}

/** Remove every skill this tool owns from one root directory. */
export function uninstallSkillsFrom(root: string): number {
  let removed = 0;
  for (const name of [...SKILL_NAMES, ...LEGACY_SKILL_NAMES]) {
    const dir = path.join(root, name);
    if (fs.existsSync(dir) && isOurSkillDir(root, name)) {
      removeDir(dir);
      removed++;
      console.log(`[wowok-skills]   removed: ${dir}`);
    }
  }
  const manifest = path.join(root, MANIFEST_FILE);
  if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
  return removed;
}

/**
 * Remove stale artifacts written by installers older than v3.1:
 * cursor `.mdc` rules, `.prompt.md` files, and skills placed in directories the
 * client never reads (`~/.codex/skills`, `~/.windsurf/skills`, …).
 *
 * Only entries named `wowok-*` that carry one of OUR files are touched, and a
 * directory that is also a current target root is never touched (so a legacy
 * path that became correct keeps working).
 */
export function cleanupLegacyArtifacts(
  targetIds: readonly string[],
  scope: 'user' | 'project',
  cwd: string,
): number {
  let removed = 0;
  const currentRoots = resolveSkillRoots(targetIds, scope, cwd);
  for (const id of targetIds) {
    const target = getClientTarget(id);
    if (!target) continue;
    const dirs =
      scope === 'user'
        ? (target.legacyUserDirs ?? [])
        : (target.legacyProjectDirs ?? []);
    for (const raw of dirs) {
      const top = scope === 'user' ? expandHome(raw) : path.resolve(cwd, raw);
      if (currentRoots.includes(top)) continue;
      if (!fs.existsSync(top)) continue;
      let removedHere = 0;
      for (const entry of fs.readdirSync(top, { withFileTypes: true })) {
        if (!entry.name.startsWith('wowok-')) continue;
        const dir = path.join(top, entry.name);
        const artifacts = [
          'SKILL.md',
          `${entry.name}.mdc`,
          `${entry.name}.prompt.md`,
        ];
        let isOurs: boolean;
        if (entry.isDirectory()) {
          isOurs = fs.readdirSync(dir).some((f) => artifacts.includes(f));
        } else {
          isOurs = entry.name.endsWith('.mdc') || entry.name.endsWith('.prompt.md');
        }
        if (isOurs) {
          removeDir(dir);
          removed++;
          removedHere++;
          console.log(`[wowok-skills]   removed pre-3.1 artifact: ${dir}`);
        }
      }
      // Drop the container directory only when THIS pass emptied it — never
      // delete an empty directory we did not contribute to.
      if (removedHere > 0 && fs.existsSync(top) && fs.readdirSync(top).length === 0) {
        fs.rmdirSync(top);
        console.log(`[wowok-skills]   removed empty directory: ${top}`);
      }
    }
  }
  return removed;
}

/** Install skills for the given targets into the requested scope(s). */
export function installSkillsForTargets(
  targetIds: readonly string[],
  scopes: Array<'user' | 'project'>,
  cwd: string,
  opts: { force?: boolean } = {},
): RootInstallResult[] {
  const results: RootInstallResult[] = [];
  for (const scope of scopes) {
    try {
      cleanupLegacyArtifacts(targetIds, scope, cwd);
    } catch (err: any) {
      console.log(`[wowok-skills]   ERROR during legacy cleanup (continuing): ${err?.message || err}`);
    }
    for (const root of resolveSkillRoots(targetIds, scope, cwd)) {
      try {
        results.push(installSkillsInto(root, opts));
      } catch (err: any) {
        // One broken root must never abort the whole postinstall — record it
        // and keep going so the remaining targets still get their skills.
        console.log(`[wowok-skills]   ERROR installing ${root}: ${err?.message || err}`);
        results.push({
          root,
          written: 0,
          unchanged: 0,
          pruned: 0,
          legacyRemoved: 0,
          errors: [`unhandled: ${err?.message || err}`],
        });
      }
    }
  }
  return results;
}

/** Uninstall skills for the given targets (both scopes). */
export function uninstallSkillsForTargets(
  targetIds: readonly string[],
  scopes: Array<'user' | 'project'>,
  cwd: string,
): number {
  let total = 0;
  for (const scope of scopes) {
    for (const root of resolveSkillRoots(targetIds, scope, cwd)) {
      if (!fs.existsSync(root)) continue;
      total += uninstallSkillsFrom(root);
    }
    cleanupLegacyArtifacts(targetIds, scope, cwd);
  }
  return total;
}

// =========================================================================
// MCP server: install / upgrade / register
// =========================================================================

function globalNpmRoot(): string | null {
  try {
    const out = execSync('npm root -g', { encoding: 'utf-8', stdio: 'pipe', timeout: 15000 });
    const dir = out.trim();
    return dir && fs.existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

/** Absolute path of the globally installed MCP entry file, if present. */
export function resolveInstalledMcpEntry(): string | null {
  const root = globalNpmRoot();
  if (!root) return null;
  const pkgDir = path.join(root, MCP_PACKAGE);
  const pkgJson = readJson(path.join(pkgDir, 'package.json'));
  if (!pkgJson) return null;
  const main: string = pkgJson.main || 'dist/index.js';
  const entry = path.resolve(pkgDir, main);
  return fs.existsSync(entry) ? entry : null;
}

/**
 * How a client should launch the MCP server.
 *
 * Preferred: `node <absolute entry>` — version-pinned to the package that
 * `ensureMcpServer()` verified, and works on native Windows (node.exe is a real
 * executable, unlike the `npx.cmd` shim).
 * Fallback: `cmd /c npx -y …` on Windows / `npx -y …` elsewhere — required
 * because bare `npx` cannot be spawned on native Windows (spawn ENOENT).
 */
export function resolveMcpLaunch(): McpLaunch {
  const entry = resolveInstalledMcpEntry();
  if (entry) return { command: 'node', args: [entry] };
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', MCP_PACKAGE] };
  }
  return { command: 'npx', args: ['-y', MCP_PACKAGE] };
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Atomic write for MCP config files (notably ~/.claude.json, the client's main
 * state file): write a temp file first, back up the previous content next to
 * the target, then rename. A crash or concurrent reader can therefore never
 * observe a half-written or truncated config.
 */
function atomicWriteFile(file: string, content: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.wowok-tmp`);
  fs.writeFileSync(tmp, content, 'utf-8');
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.wowok-bak`);
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

export interface McpWriteResult {
  path: string;
  status: 'written' | 'unchanged' | 'skipped' | 'error';
  detail?: string;
}

function writeMcpSpec(spec: McpSpec, launch: McpLaunch): McpWriteResult {
  const { path: file, format } = spec;
  try {
    // ── TOML (Codex: ~/.codex/config.toml) ────────────────────────────
    if (format === 'toml') {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
      if (/^\s*\[mcp_servers\.wowok\]\s*$/m.test(existing)) {
        return { path: file, status: 'unchanged' };
      }
      const block =
        `\n[mcp_servers.wowok]\n` +
        `command = ${tomlString(launch.command)}\n` +
        `args = [${launch.args.map(tomlString).join(', ')}]\n`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWriteFile(file, existing + block);
      return { path: file, status: 'written' };
    }

    // ── Kilo / OpenCode: { "mcp": { "wowok": { type:"local", command:[…] } } }
    if (format === 'mcp-array-json') {
      let config: any = {};
      if (fs.existsSync(file)) {
        try {
          config = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (err: any) {
          return { path: file, status: 'error', detail: `not valid JSON — left untouched (${err.message})` };
        }
      }
      const before = JSON.stringify(config);
      config.mcp = config.mcp || {};
      config.mcp.wowok = {
        type: 'local',
        command: [launch.command, ...launch.args],
        enabled: true,
      };
      if (JSON.stringify(config) === before) return { path: file, status: 'unchanged' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      atomicWriteFile(file, JSON.stringify(config, null, 2) + '\n');
      return { path: file, status: 'written' };
    }

    // ── JSON with an `mcpServers` map (everyone else) ────────────────
    let config: any = {};
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8');
      try {
        config = raw.trim() ? JSON.parse(raw) : {};
      } catch (err: any) {
        return { path: file, status: 'error', detail: `not valid JSON — left untouched (${err.message})` };
      }
      if (config === null || typeof config !== 'object' || Array.isArray(config)) {
        return { path: file, status: 'error', detail: 'unexpected JSON shape — left untouched' };
      }
    }

    const before = JSON.stringify(config);
    config.mcpServers = config.mcpServers || {};
    const previousEntry = config.mcpServers.wowok;
    const entry: Record<string, unknown> = {
      ...(spec.extraEntry || {}),
      command: launch.command,
      args: launch.args,
    };
    // Never silently re-enable a server the user disabled on purpose.
    if (previousEntry && typeof previousEntry === 'object' && 'disabled' in previousEntry) {
      if (previousEntry.disabled) entry.disabled = true;
    }
    config.mcpServers.wowok = entry;

    if (JSON.stringify(config) === before) return { path: file, status: 'unchanged' };

    fs.mkdirSync(path.dirname(file), { recursive: true });
    atomicWriteFile(file, JSON.stringify(config, null, 2) + '\n');
    return { path: file, status: 'written' };
  } catch (err: any) {
    return { path: file, status: 'error', detail: err.message };
  }
}

/**
 * Remove stale MCP entries that a pre-3.1 installer wrote into files the client
 * never reads (`~/.claude/settings.json`, Qoder's `mcp-settings.json`,
 * CodeBuddy's dotted `~/.codebuddy/.mcp.json`). Only the `wowok` entry is
 * touched; a file that becomes empty is deleted, anything else in it is
 * preserved.
 */
export function cleanupLegacyMcpEntries(targetIds: readonly string[]): number {
  let cleaned = 0;
  for (const id of targetIds) {
    const target = getClientTarget(id);
    if (!target?.legacyMcpFiles) continue;
    for (const file of target.legacyMcpFiles) {
      if (!fs.existsSync(file)) continue;
      const config = readJson(file);
      if (!config || typeof config !== 'object') continue;
      let touched = false;
      for (const container of ['mcpServers', 'mcp']) {
        if (config[container] && typeof config[container] === 'object' && 'wowok' in config[container]) {
          delete config[container].wowok;
          touched = true;
        }
      }
      if (!touched) continue;
      const meaningful = Object.entries(config).some(
        ([, value]) =>
          value !== null &&
          typeof value === 'object' &&
          Object.keys(value as Record<string, unknown>).length > 0,
      );
      if (meaningful) {
        atomicWriteFile(file, JSON.stringify(config, null, 2) + '\n');
        console.log(`[wowok-skills]   removed stale MCP entry from ${file}`);
      } else {
        fs.unlinkSync(file);
        console.log(`[wowok-skills]   removed stale MCP file (created by a pre-3.1 installer): ${file}`);
      }
      cleaned++;
    }
  }
  return cleaned;
}

/** Register the MCP server for the given targets (defaults to the given scope). */
export function registerMcpForTargets(
  targetIds: readonly string[],
  scopes: Array<'user' | 'project'>,
  cwd: string,
): McpWriteResult[] {
  const launch = resolveMcpLaunch();
  const results: McpWriteResult[] = [];
  const notes = new Set<string>();
  cleanupLegacyMcpEntries(targetIds);
  for (const scope of scopes) {
    for (const spec of resolveMcpSpecs(targetIds, scope, cwd)) {
      if (spec.note) notes.add(spec.note);
      results.push(writeMcpSpec(spec, launch));
    }
  }
  for (const id of targetIds) {
    for (const note of getClientTarget(id)?.notes ?? []) notes.add(note);
  }
  for (const note of notes) console.log(`[wowok-skills]   note: ${note}`);
  return results;
}

function semverMajor(version: string | null): number {
  if (!version) return 0;
  return parseInt(version.split('.')[0], 10) || 0;
}

export function getInstalledMcpVersion(): string | null {
  try {
    const out = execSync(`npm ls -g ${MCP_PACKAGE} --depth=0 --json`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    const parsed = JSON.parse(out);
    const pkg = parsed.dependencies?.[MCP_PACKAGE] || parsed[MCP_PACKAGE];
    return pkg?.version || null;
  } catch {
    return null;
  }
}

function getLatestMcpVersion(): string | null {
  try {
    const out = execSync(`npm view --prefer-online ${MCP_PACKAGE} version`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function npmInstallGlobal(pkg: string, retries = 2): boolean {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit', timeout: 180000 });
      return true;
    } catch (err: any) {
      if (attempt >= retries) {
        console.error(`[wowok-skills]   npm install failed after ${retries} attempts: ${err.message}`);
        return false;
      }
      console.log(`[wowok-skills]   npm install attempt ${attempt} failed, retrying...`);
      execSync(process.platform === 'win32' ? 'ping -n 3 127.0.0.1 >nul' : 'sleep 2', {
        stdio: 'pipe',
        timeout: 8000,
      });
    }
  }
  return false;
}

/** Ensure the global MCP server exists and is current. Returns true if changed. */
export function ensureMcpServer(): boolean {
  const current = getInstalledMcpVersion();
  const latest = getLatestMcpVersion();

  if (current) {
    console.log(`[wowok-skills] MCP server ${MCP_PACKAGE} v${current} found.`);
    if (!latest) {
      console.log('  cannot reach the registry — keeping the installed version.');
      return false;
    }
    if (current === latest) {
      console.log(`  up to date (v${current}).`);
      return false;
    }
    if (semverMajor(latest) > semverMajor(current)) {
      console.warn(`  ⚠ major version bump v${current} → v${latest}; skipping auto-upgrade.`);
      console.warn(`    upgrade manually: npm install -g ${MCP_PACKAGE}@latest`);
      return false;
    }
    console.log(`  upgrading v${current} → v${latest}...`);
    if (npmInstallGlobal(`${MCP_PACKAGE}@latest`)) return true;
    console.error(`  upgrade failed — keeping v${current}.`);
    return false;
  }

  console.log(`[wowok-skills] Installing MCP server ${MCP_PACKAGE}...`);
  if (npmInstallGlobal(MCP_PACKAGE)) {
    console.log('  installed.');
    return true;
  }
  console.error('  installation failed.');
  return false;
}

/**
 * Kill the running MCP server process so clients relaunch it with the new code.
 * Matches ONLY our launcher (`node <entry>` / the npx cache invocation) so an
 * unrelated node process is never touched.
 */
export function restartMcpServer(): void {
  try {
    if (process.platform === 'win32') {
      const entry = resolveInstalledMcpEntry();
      const patterns = [`'%${MCP_PACKAGE}%'`, `'%agent-mcp%'`];
      const entryClause = entry
        ? `OR (${patterns.map((p) => `CommandLine LIKE ${p}`).join(' OR ')})`
        : '';
      const ps =
        'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
        `Where-Object { $_.CommandLine -like '*agent-mcp*' ${entryClause} } | ` +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
      const encoded = Buffer.from(ps, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'pipe', timeout: 15000 });
    } else {
      execSync(`pkill -f "node_modules/${MCP_PACKAGE}/" || pkill -f "npx.*${MCP_PACKAGE}" || true`, {
        stdio: 'pipe',
        timeout: 8000,
      });
    }
    console.log('[wowok-skills] MCP server process terminated (clients auto-restart it).');
  } catch {
    console.log('[wowok-skills] No running MCP server process found.');
  }
}

// =========================================================================
// Airdrop referrer
// =========================================================================

/** Wow MCP data dir — mirrors @wowok/wowok getWowMcpDir(). */
export function wowMcpDir(): string {
  const h = os.homedir();
  let wowDir: string;
  if (process.env.WOWOK_DATA_DIR) {
    wowDir = process.env.WOWOK_DATA_DIR;
  } else if (process.platform === 'win32') {
    wowDir = path.join(h, '.wow', 'V1');
  } else if (process.platform === 'darwin') {
    wowDir = path.join(h, 'Library', 'Application Support', '.wow', 'V1');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    const xdgData = process.env.XDG_DATA_HOME;
    if (xdgConfig) wowDir = path.join(xdgConfig, '.wow', 'V1');
    else wowDir = xdgData ? path.join(xdgData, '.wow', 'V1') : path.join(h, '.wow', 'V1');
  }
  return path.join(path.dirname(wowDir), 'mcp');
}

export function saveReferrer(referrer: string): void {
  const dir = wowMcpDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'referrer'), referrer.trim() + '\n', 'utf-8');
  console.log(`[wowok-skills] airdrop referrer saved: ${referrer.trim()}`);
  console.log('[wowok-skills] it is auto-recorded on your first on-chain interaction.');
}

// =========================================================================
// Target selection
// =========================================================================

/** Parse `--target` / positional / env overrides into a validated target list. */
export function resolveTargets(
  requested: readonly string[] | undefined,
  env: string | undefined = process.env.WOWOK_SKILLS_TARGETS,
): { targets: ClientTargetId[]; unknown: string[] } {
  let ids: string[] = [];
  const unknown: string[] = [];

  if (requested && requested.length > 0) {
    ids = [...requested];
  } else if (env) {
    ids = env.split(',').map((t) => t.trim()).filter(Boolean);
  } else {
    return { targets: [...DEFAULT_TARGET_IDS], unknown };
  }

  if (ids.includes('all')) return { targets: [...DEFAULT_TARGET_IDS], unknown };

  const targets: ClientTargetId[] = [];
  for (const id of ids) {
    const target = getClientTarget(id);
    if (!target) {
      unknown.push(id);
      continue;
    }
    if (!targets.includes(target.id)) targets.push(target.id);
  }
  return { targets, unknown };
}

export function supportedTargetList(): string {
  return CLIENT_TARGETS.map((t) => `${t.id.padEnd(10)} ${t.label}`).join('\n');
}

// =========================================================================
// Status report (`wowok-skills doctor`)
// =========================================================================

export interface RootStatus {
  root: string;
  present: boolean;
  fresh: number;
  stale: number;
  missing: number;
  legacy: number;
  manifestVersion: string | null;
}

export interface McpStatus {
  path: string;
  present: boolean;
  registered: boolean;
  detail?: string;
}

export interface TargetStatus {
  id: string;
  label: string;
  userRoots: RootStatus[];
  projectRoots: RootStatus[];
  mcp: McpStatus[];
  notes: string[];
}

function rootStatus(root: string): RootStatus {
  const status: RootStatus = {
    root,
    present: fs.existsSync(root),
    fresh: 0,
    stale: 0,
    missing: 0,
    legacy: 0,
    manifestVersion: readManifest(root)?.version ?? null,
  };
  for (const name of SKILL_NAMES) {
    const dest = path.join(root, name, 'SKILL.md');
    const src = readSkillSource(name);
    if (!fs.existsSync(dest)) {
      status.missing++;
    } else if (src !== null && hashContent(fs.readFileSync(dest, 'utf-8')) === hashContent(src)) {
      status.fresh++;
    } else {
      status.stale++;
    }
  }
  status.legacy = LEGACY_SKILL_NAMES.filter((n) => fs.existsSync(path.join(root, n))).length;
  return status;
}

export function statusForTargets(
  targetIds: readonly string[],
  cwd: string,
): TargetStatus[] {
  return targetIds.map((id) => {
    const target = getClientTarget(id)!;
    const mcp = [
      ...resolveMcpSpecs([id], 'user', cwd),
      ...resolveMcpSpecs([id], 'project', cwd),
    ].map((spec) => {
      const present = fs.existsSync(spec.path);
      let registered = false;
      let detail: string | undefined;
      if (present) {
        const raw = fs.readFileSync(spec.path, 'utf-8');
        registered =
          spec.format === 'toml'
            ? /^\s*\[mcp_servers\.wowok\]\s*$/m.test(raw)
            : /"wowok"\s*:/.test(raw);
      }
      if (spec.note) detail = spec.note;
      if (id === 'trae' && present && registered) {
        const parsed = readJson(spec.path);
        if (parsed?.mcpServers?.wowok?.disabled) detail = 'entry exists but is DISABLED in Trae — enable it in the MCP panel';
      }
      return { path: spec.path, present, registered, detail };
    });
    return {
      id,
      label: target.label,
      userRoots: resolveSkillRoots([id], 'user', cwd).map(rootStatus),
      projectRoots: resolveSkillRoots([id], 'project', cwd).map(rootStatus),
      mcp,
      notes: target.notes ?? [],
    };
  });
}

// =========================================================================
// Entry points
// =========================================================================

/**
 * npm lifecycle hook. `postinstall` installs to every client (this is the
 * one-command onboarding path). There is intentionally NO uninstall hook —
 * npm v7+ never runs `preuninstall`, so removal is an explicit CLI command.
 */
export function runLifecycle(event: string): void {
  if (event !== 'postinstall') return;

  const { targets, unknown } = resolveTargets(undefined);
  if (unknown.length > 0) console.warn(`[wowok-skills] ignoring unknown targets: ${unknown.join(', ')}`);

  console.log(`[wowok-skills] Installing skills for ${targets.length} client target(s)...`);
  const results = installSkillsForTargets(targets, ['user'], process.cwd());
  let written = 0;
  let unchanged = 0;
  for (const r of results) {
    written += r.written;
    unchanged += r.unchanged;
    console.log(
      `[wowok-skills] → ${r.root}  (${r.written} written, ${r.unchanged} up to date, ${r.legacyRemoved} deprecated removed)`,
    );
    for (const err of r.errors) console.warn(`[wowok-skills]   WARN: ${err}`);
  }
  console.log(`[wowok-skills] Done — ${written} files written, ${unchanged} already current.`);

  const skipMcp = process.env.WOWOK_SKILLS_NO_MCP === '1' || process.env.WOWOK_SKILLS_NO_MCP === 'true';
  if (skipMcp) {
    console.log('[wowok-skills] WOWOK_SKILLS_NO_MCP=1 — skipping MCP server management.');
  } else {
    console.log('');
    console.log('[wowok-skills] Checking MCP server...');
    const changed = ensureMcpServer();
    console.log('[wowok-skills] Registering MCP server in client config files...');
    const launch = resolveMcpLaunch();
    console.log(
      `[wowok-skills]   launcher: ${launch.command} ${launch.args.join(' ')}` +
        (launch.command === 'node' ? '  (version-pinned, Windows-safe)' : '  (npx fallback)'),
    );
    for (const r of registerMcpForTargets(targets, ['user'], process.cwd())) {
      console.log(
        `[wowok-skills]   ${r.status.padEnd(9)} ${r.path}${r.detail ? `  (${r.detail})` : ''}`,
      );
    }
    if (changed) restartMcpServer();
  }

  const referrer = process.env.WOWOK_REFERRER;
  if (referrer && referrer.trim()) {
    console.log('');
    saveReferrer(referrer);
  }

  console.log('');
  console.log('[wowok-skills] Global install complete. Verify with: wowok-skills doctor');
  console.log('[wowok-skills] To also commit skills into a project: cd <project> && wowok-skills init');
}
