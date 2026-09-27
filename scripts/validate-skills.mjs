#!/usr/bin/env node
// Copyright (c) Wowok.
// SPDX-License-Identifier: Apache-2.0

/**
 * SKILL.md conformance audit.
 *
 * Enforces the portable Agent Skills shape so EVERY client can load the file:
 *   https://agentskills.io/specification
 *   https://code.claude.com/docs/en/skills
 *   https://developers.openai.com/codex/skills
 *
 * Rules
 *   1. One directory per skill, each containing SKILL.md, first line `---` (no BOM).
 *   2. Frontmatter keys ⊆ {name, description, license, compatibility, metadata, allowed-tools}.
 *      Custom attributes (version/role/loading/related) MUST live under `metadata:`.
 *   3. name === directory name, lowercase [a-z0-9-], ≤ 64 chars.
 *   4. description: non-empty, ≤ 1024 chars, no XML-ish tags.
 *   5. Body ≤ 500 lines (progressive disclosure).
 *   6. The skill set on disk must match SKILL_NAMES in src/targets.ts.
 *
 * Usage
 *   node scripts/validate-skills.mjs            # audit (exit 1 on any error)
 *   node scripts/validate-skills.mjs --json     # machine-readable report
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const jsonOutput = process.argv.includes('--json');

const ALLOWED_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);
const ALLOWED_METADATA_KEYS = new Set(['version', 'role', 'loading', 'related', 'always', 'aliases']);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Skills declared by the code — the list that actually gets installed. */
function declaredSkillNames() {
  const source = readFileSync(join(ROOT, 'src', 'targets.ts'), 'utf-8');
  const match = source.match(/export const SKILL_NAMES[^=]*=\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error('SKILL_NAMES not found in src/targets.ts');
  return [...match[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
}

/** Minimal frontmatter reader (top-level scalars + one nested metadata map). */
function parseFrontmatter(raw) {
  const result = { keys: [], fields: {}, metadata: {}, errors: [], body: '' };
  if (raw.charCodeAt(0) === 0xfeff) result.errors.push('file starts with a BOM');
  const body = raw.replace(/^\uFEFF/, '');
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    result.errors.push('missing YAML frontmatter (file must start with ---)');
    return result;
  }
  result.body = match[2];

  let blockKey = null;
  let blockLines = [];
  let inMetadata = false;
  const flush = () => {
    if (blockKey && blockKey !== 'metadata') {
      result.fields[blockKey] = blockLines.join(' ').trim().replace(/\s+/g, ' ');
    }
    blockKey = null;
    blockLines = [];
  };

  for (const line of match[1].split(/\r?\n/)) {
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      flush();
      inMetadata = false;
      const key = top[1];
      const value = top[2].trim();
      result.keys.push(key);
      if (key === 'metadata' && value === '') {
        inMetadata = true;
        continue;
      }
      if (value === '' || /^[|>][-+]?$/.test(value)) {
        blockKey = key;
      } else {
        result.fields[key] = value.replace(/^["']|["']$/g, '');
      }
      continue;
    }
    const nested = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/);
    if (inMetadata && nested) {
      result.metadata[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    if (blockKey) blockLines.push(line.trim());
  }
  flush();
  return result;
}

const declared = declaredSkillNames();
const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'src' && e.name !== 'scripts')
  .map((e) => e.name)
  .filter((name) => existsSync(join(ROOT, name, 'SKILL.md')));

const report = { errors: [], warnings: [], skills: [] };

for (const name of declared) {
  if (!dirs.includes(name)) report.errors.push(`${name}: declared in src/targets.ts but no SKILL.md on disk`);
}
for (const name of dirs) {
  if (!declared.includes(name)) report.errors.push(`${name}: SKILL.md exists but the skill is not in SKILL_NAMES (it would never be installed)`);
}

for (const name of dirs) {
  const file = join(ROOT, name, 'SKILL.md');
  const raw = readFileSync(file, 'utf-8');
  const parsed = parseFrontmatter(raw);
  const skill = { name, errors: [], warnings: [] };
  const fail = (msg) => skill.errors.push(msg);
  const warn = (msg) => skill.warnings.push(msg);

  for (const err of parsed.errors) fail(err);

  for (const key of parsed.keys) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(`frontmatter key "${key}" is not part of the Agent Skills spec — move it under metadata:`);
    }
  }
  for (const key of Object.keys(parsed.metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) warn(`metadata.${key} is not used by any tooling`);
  }

  const fmName = parsed.fields.name;
  if (!fmName) fail('missing frontmatter "name"');
  else {
    if (fmName !== name) fail(`name "${fmName}" must equal the directory name "${name}"`);
    if (fmName.length > 64) fail(`name is ${fmName.length} chars (max 64)`);
    if (!NAME_RE.test(fmName)) fail('name must be lowercase letters/digits/hyphens (no leading/trailing/double hyphen)');
  }

  const description = parsed.fields.description ?? '';
  if (!description) fail('missing or empty frontmatter "description"');
  else {
    if (description.length > 1024) fail(`description is ${description.length} chars (max 1024)`);
    if (/[<>]/.test(description)) fail('description must not contain XML-ish tags (< or >)');
    if (!/use when/i.test(description)) warn('description has no "Use when:" trigger clause — most clients match on description only');
  }

  const bodyLines = parsed.body.split('\n').length;
  if (bodyLines > 500) fail(`body is ${bodyLines} lines (spec recommends ≤ 500)`);

  const declaredMetadataSidecar = name.startsWith('wowok-')
    || ['file-analysis', 'data-analysis', 'web-research'].includes(name);
  if (!declaredMetadataSidecar) warn('unexpected directory name prefix');

  report.skills.push(skill);
  for (const e of skill.errors) report.errors.push(`${name}: ${e}`);
  for (const w of skill.warnings) report.warnings.push(`${name}: ${w}`);
}

if (jsonOutput) {
  console.log(JSON.stringify({ roots: ROOT, skills: dirs, ...report }, null, 2));
} else {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SKILL.md conformance audit (Agent Skills spec)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  skills on disk : ${dirs.length}`);
  console.log(`  declared in TS : ${declared.length}`);
  console.log('═══════════════════════════════════════════════════\n');
  for (const skill of report.skills) {
    const icon = skill.errors.length > 0 ? '🔴' : skill.warnings.length > 0 ? '🟡' : '🟢';
    console.log(`  ${icon} ${skill.name}`);
    for (const e of skill.errors) console.log(`       ✗ ${e}`);
    for (const w of skill.warnings) console.log(`       • ${w}`);
  }
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  errors: ${report.errors.length}   warnings: ${report.warnings.length}`);
  console.log('═══════════════════════════════════════════════════\n');
  if (report.errors.length > 0) {
    for (const e of report.errors) console.error(`❌ ${e}`);
    process.exit(1);
  }
  console.log('✅ All SKILL.md files conform to the portable Agent Skills shape.');
}

process.exit(report.errors.length > 0 ? 1 : 0);
