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
