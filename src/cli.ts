#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { getSkills, getSkillByName, getRoleSkills, recommendSkills, getSkillsByRole } from './skills';
import { SkillRole } from './types';

/**
 * Skill directory names (must match folder names in package)
 * Ordered by role for clarity:
 * - Customer: wowok-order
 * - Provider: wowok-provider, wowok-machine
 * - Arbitrator: wowok-arbitrator
 * - Shared: wowok-guard, wowok-tools, wowok-safety
 */
const SKILL_DIRS = [
  // Customer
  'wowok-order',
  // Provider
  'wowok-provider',
  'wowok-machine',
  // Arbitrator
  'wowok-arbitrator',
  // Shared
  'wowok-guard',
  'wowok-tools',
  'wowok-safety',
];

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
  console.log('  init                    Install skills to current project (.claude/skills/)');
  console.log('  uninit                  Remove skills from current project');
  console.log('');
  console.log('Examples:');
  console.log('  wowok-skills list');
  console.log('  wowok-skills get wowok-provider');
  console.log('  wowok-skills role provider');
  console.log('  wowok-skills recommend "create a service"');
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
