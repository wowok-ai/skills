/**
 * WoWok Skills installer
 *
 * npm lifecycle integration:
 *   postinstall  → copy SKILL.md folders to ~/.claude/skills/
 *   preuninstall → remove SKILL.md folders from ~/.claude/skills/
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_DIRS = [
  'wowok-provider',
  'wowok-arbitrator',
  'wowok-order',
  'wowok-guard',
  'wowok-machine',
  'wowok-tools',
  'wowok-safety',
];

const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

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

function installSkills(targetDir) {
  const pkgRoot = getPackageRoot();
  let count = 0;

  fs.mkdirSync(targetDir, { recursive: true });

  for (const dir of SKILL_DIRS) {
    const src = path.join(pkgRoot, dir, 'SKILL.md');
    const destDir = path.join(targetDir, dir);
    const dest = path.join(destDir, 'SKILL.md');

    if (!fs.existsSync(src)) {
      console.warn(`[wowok-skills] WARN: SKILL.md not found for ${dir}`);
      continue;
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    count++;
    console.log(`[wowok-skills]   installed: ${dir} → ${destDir}`);
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

function main() {
  const event = process.env.npm_lifecycle_event || '';

  if (event === 'postinstall') {
    console.log('[wowok-skills] Installing skills to ~/.claude/skills/ ...');
    const count = installSkills(CLAUDE_SKILLS_DIR);
    console.log(`[wowok-skills] Done — ${count} skills installed.`);
    console.log('[wowok-skills] Skills will be available in your next Claude Code session.');
  } else if (event === 'preuninstall') {
    console.log('[wowok-skills] Removing skills from ~/.claude/skills/ ...');
    const count = uninstallSkills(CLAUDE_SKILLS_DIR);
    console.log(`[wowok-skills] Done — ${count} skills removed.`);
  }
}

main();