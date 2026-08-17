/**
 * Skill role categories for AI selection
 */
export type SkillRole = 'customer' | 'provider' | 'supplier' | 'collaborator' | 'arbitrator' | 'shared';

/**
 * Skill loading mode
 * - 'always': Always loaded, metadata in prompt
 * - 'on-demand': Loaded only when description matches task
 */
export type LoadingMode = 'always' | 'on-demand';

export type ClientTarget =
  | 'claude'    // Claude Code — .claude/skills/
  | 'cursor'    // Cursor — .cursor/rules/
  | 'windsurf'  // Windsurf (Codeium) — .windsurf/skills/
  | 'codebuddy' // CodeBuddy — .codebuddy/skills/
  | 'codex'     // OpenAI Codex — .codex/skills/ (MCP via config.toml)
  | 'trae'      // Trae CN & Trae Work — .agents/skills/ (CN) / .trae/skills/ (Work)
  | 'qoder'     // Qoder / Qoder CN — .qoder/skills/
  | 'roo'       // Roo Code — .roo/skills/
  | 'agents'    // [DEPRECATED] alias for 'trae'
  | 'copilot'   // GitHub Copilot — .github/prompts/ (MCP via mcp-config.json)
  | 'all';

export const CLIENT_SKILL_DIRS: Record<Exclude<ClientTarget, 'all'>, string> = {
  claude: '.claude/skills',
  cursor: '.cursor/rules',
  windsurf: '.windsurf/skills',
  codebuddy: '.codebuddy/skills',
  codex: '.codex/skills',
  trae: '.agents/skills',
  qoder: '.qoder/skills',
  roo: '.roo/skills',
  agents: '.agents/skills',
  copilot: '.github/prompts',
};

export const CLIENT_FILE_EXT: Record<Exclude<ClientTarget, 'all'>, string> = {
  claude: '.md',
  cursor: '.mdc',
  windsurf: '.md',
  codebuddy: '.md',
  codex: '.md',
  trae: '.md',
  qoder: '.md',
  roo: '.md',
  agents: '.md',
  copilot: '.prompt.md',
};

export const ALL_CLIENT_TARGETS: Exclude<ClientTarget, 'all'>[] = [
  'claude', 'cursor', 'windsurf', 'codebuddy', 'codex', 'trae', 'qoder', 'roo', 'copilot',
];

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
 * Skill negotiation mode.
 * Determines how a skill behaves relative to the MCP server version.
 * - 'full': Versions match — skill provides full orchestration (best experience)
 * - 'passthrough': MCP major > skill major — skill only forwards MCP responses, no orchestration
 * - 'legacy': MCP major < skill major — skill falls back to older content
 */
export type SkillMode = 'full' | 'passthrough' | 'legacy';

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
