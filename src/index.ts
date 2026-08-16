import * as fs from 'fs';
import * as path from 'path';
import { getSkillByName } from './skills';

// Export types
export * from './types';

// Export skills with role-based helpers
export {
  wowokSkills,
  getSkills,
  getSkillByName,
  getSkillsByRole,
  getSkillsByLoading,
  getRoleSkills,
  recommendSkills,
  negotiateSkillMode,
  negotiateAllSkills,
  checkSkillMigration,
  DEPRECATED_SKILLS,
  SKILL_MIGRATION_MAP
} from './skills';
export type { DeprecatedSkill } from './skills';

/** Resolve the skills package root from the compiled output (dist/index.js → package root). */
function getPackageRoot(): string {
  return path.resolve(__dirname, '..');
}

/**
 * Load a skill's full SKILL.md body (YAML frontmatter stripped). Returns null
 * when the skill is unknown or its file is missing. This is the same content
 * the installer copies to external AI clients' skill directories.
 */
export function getSkillBody(name: string): string | null {
  const skill = getSkillByName(name);
  if (!skill) return null;
  const file = path.join(getPackageRoot(), name, 'SKILL.md');
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  // Tolerate both LF and CRLF line endings in the YAML frontmatter fence.
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return m ? m[1] : raw;
}
