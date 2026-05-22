/**
 * Skill role categories for AI selection
 */
export type SkillRole = 'customer' | 'provider' | 'arbitrator' | 'shared';

/**
 * Skill loading mode
 * - 'always': Always loaded, metadata in prompt
 * - 'on-demand': Loaded only when description matches task
 */
export type LoadingMode = 'always' | 'on-demand';

export type ClientTarget = 'claude' | 'agents' | 'codebuddy' | 'cursor' | 'copilot' | 'all';

export const CLIENT_SKILL_DIRS: Record<Exclude<ClientTarget, 'all'>, string> = {
  claude: '.claude/skills',
  agents: '.agents/skills',
  codebuddy: '.codebuddy/skills',
  cursor: '.cursor/rules',
  copilot: '.github/prompts',
};

export const CLIENT_FILE_EXT: Record<Exclude<ClientTarget, 'all'>, string> = {
  claude: '.md',
  agents: '.md',
  codebuddy: '.md',
  cursor: '.mdc',
  copilot: '.prompt.md',
};

export const ALL_CLIENT_TARGETS: Exclude<ClientTarget, 'all'>[] = ['claude', 'agents', 'codebuddy', 'cursor', 'copilot'];

/**
 * Skill definition
 */
export interface Skill {
  name: string;
  description: string;
  version: string;
  /** Role this skill is for */
  role: SkillRole;
  /** Loading mode */
  loading: LoadingMode;
  /** Related skills that might also be relevant */
  related?: string[];
}

/**
 * Skill configuration
 */
export interface SkillConfig {
  skills: Skill[];
}

/**
 * Role-based skill grouping for AI guidance
 */
export interface RoleSkills {
  role: SkillRole;
  roleName: string;
  description: string;
  skills: Skill[];
}
