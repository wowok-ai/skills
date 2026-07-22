#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { getSkills, getSkillByName, getRoleSkills, recommendSkills, getSkillsByRole } from './skills';
import { SkillRole, ClientTarget, CLIENT_SKILL_DIRS, CLIENT_FILE_EXT, ALL_CLIENT_TARGETS } from './types';

/**
 * Skill directory names (must match folder names in package)
 * Must stay in sync with scripts/install.js SKILL_DIRS
 * Ordered by role for clarity:
 * - Customer: wowok-order
 * - Provider: wowok-provider, wowok-machine
 * - Arbitrator: wowok-arbitrator
 * - Shared: wowok-guard, wowok-tools, wowok-safety, wowok-output
 * - Onboarding: wowok-onboard, wowok-scenario, wowok-planner, wowok-auditor
 * - Distillation: wowok-distill
 */
const SKILL_DIRS = [
  'wowok-order',
  'wowok-provider',
  'wowok-machine',
  'wowok-arbitrator',
  'wowok-guard',
  'wowok-messenger',
  'wowok-output',
  'wowok-tools',
  'wowok-safety',
  'wowok-onboard',
  'wowok-scenario',
  'wowok-planner',
  'wowok-auditor',
  'wowok-distill',
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
  console.error(`Invalid target: ${targetArg}`);
  console.error(`Valid targets: claude, codex, agents, codebuddy, cursor, copilot, all`);
  process.exit(1);
}

function cmdInit(targetArg?: string): void {
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
  }

  if (targets.length > 1) {
    console.log(`[wowok-skills] Total: ${totalCount} skills across ${targets.length} clients.`);
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

    for (const dir of SKILL_DIRS) {
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
  console.log('  init [--target <t>]     Install skills to project (default: .claude/skills/)');
  console.log('  uninit [--target <t>]   Remove skills from project');
  console.log('');
  console.log('Targets:');
  console.log('  claude       .claude/skills/       (Claude Code, default)');
  console.log('  codex        .codex/skills/        (OpenAI Codex)');
  console.log('  agents       .agents/skills/       (Trae IDE)');
  console.log('  codebuddy    .codebuddy/skills/    (CodeBuddy)');
  console.log('  cursor       .cursor/rules/        (Cursor IDE)');
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
      cmdInit(parseTargetArg(args.slice(1)));
      break;

    case 'uninit':
      cmdUninit(parseTargetArg(args.slice(1)));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function parseTargetArg(rest: string[]): string | undefined {
  const idx = rest.indexOf('--target');
  if (idx !== -1 && idx + 1 < rest.length) {
    return rest[idx + 1];
  }
  return undefined;
}

main();
