/**
 * WoWok Skills installer
 *
 * npm lifecycle integration:
 *   postinstall  → copy SKILL.md folders to ~/.claude/skills/ (and more via env)
 *   preuninstall → remove SKILL.md folders from all installed client dirs
 *
 * Environment variables:
 *   WOWOK_SKILLS_TARGETS  Comma-separated client targets (claude,agents,codebuddy)
 *                         Defaults to "claude". Example: "claude,agents"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_DIRS = [
  'wowok-provider',
  'wowok-arbitrator',
  'wowok-order',
  'wowok-messenger',
  'wowok-guard',
  'wowok-machine',
  'wowok-tools',
  'wowok-safety',
];

const CLIENT_DIRS = {
  claude: path.join(os.homedir(), '.claude', 'skills'),
  agents: path.join(os.homedir(), '.agents', 'skills'),
  codebuddy: path.join(os.homedir(), '.codebuddy', 'skills'),
  cursor: path.join(os.homedir(), '.cursor', 'rules'),
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
  const exts = { claude: '.md', agents: '.md', codebuddy: '.md', cursor: '.mdc', copilot: '.prompt.md' };
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

  for (const dir of SKILL_DIRS) {
    const dirPath = path.join(targetDir, dir);
    if (fs.existsSync(dirPath)) {
      removeDir(dirPath);
      count++;
      console.log(`[wowok-skills]   removed: ${dirPath}`);
    }
  }

  return count;
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

  if (event === 'postinstall') {
    const targets = getTargets();
    console.log(`[wowok-skills] Installing skills to ${targets.length} client(s)...`);

    let total = 0;
    for (const target of targets) {
      const dir = CLIENT_DIRS[target];
      console.log(`[wowok-skills] → ${dir}`);
      const count = installSkills(dir, target);
      total += count;
    }

    console.log(`[wowok-skills] Done — ${total} skills installed across ${targets.length} client(s).`);
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
  for (const dir of SKILL_DIRS) {
    if (fs.existsSync(path.join(targetDir, dir))) {
      count++;
    }
  }
  return count;
}

main();