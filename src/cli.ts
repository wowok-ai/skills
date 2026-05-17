#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { getSkills, getSkillByName } from './skills';

const SKILL_DIRS = [
  'wowok-build',
  'wowok-guard',
  'wowok-tools',
  'wowok-safety',
  'wowok-machine',
  'wowok-order',
];

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

function cmdInit(): void {
  const cwd = process.cwd();
  const targetDir = path.join(cwd, '.claude', 'skills');
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
    console.log(`[wowok-skills]   installed: ${destDir}`);
  }

  console.log(`[wowok-skills] Done — ${count} skills installed to ${targetDir}`);
  console.log('[wowok-skills] Skills will be available in your next Claude Code session.');
}

function cmdUninit(): void {
  const cwd = process.cwd();
  const targetDir = path.join(cwd, '.claude', 'skills');
  let count = 0;

  for (const dir of SKILL_DIRS) {
    const dirPath = path.join(targetDir, dir);
    if (fs.existsSync(dirPath)) {
      removeDir(dirPath);
      count++;
      console.log(`[wowok-skills]   removed: ${dirPath}`);
    }
  }

  if (count === 0) {
    console.log('[wowok-skills] No skills found in project. Nothing to remove.');
  } else {
    console.log(`[wowok-skills] Done — ${count} skills removed from ${targetDir}`);
  }
}

function printUsage(): void {
  console.log('WoWok Skills CLI');
  console.log('Usage: wowok-skills <command>');
  console.log('');
  console.log('Commands:');
  console.log('  list              List all available skills');
  console.log('  get <name>        Show skill details');
  console.log('  init              Install skills to current project (.claude/skills/)');
  console.log('  uninit            Remove skills from current project');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'list':
      console.log('Available WoWok Skills:');
      getSkills().forEach(skill => {
        console.log(`  - ${skill.name}: ${skill.description}`);
      });
      break;

    case 'get':
      if (args.length < 2) {
        console.error('Error: Skill name required');
        process.exit(1);
      }
      const skill = getSkillByName(args[1]);
      if (skill) {
        console.log(`Name: ${skill.name}`);
        console.log(`Description: ${skill.description}`);
        console.log(`Version: ${skill.version}`);
      } else {
        console.error(`Skill not found: ${args[1]}`);
        process.exit(1);
      }
      break;

    case 'init':
      cmdInit();
      break;

    case 'uninit':
      cmdUninit();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
