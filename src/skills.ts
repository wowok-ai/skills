import { Skill, SkillConfig, SkillRole, RoleSkills, SkillMode } from './types';

/**
 * WoWok Skills organized by role (post GLM5-31 sink refactor)
 *
 * 4 rule-reference skills were SUNK into the MCP knowledge layer and REMOVED:
 *   - wowok-safety   → MCP safety-rules (runtime confirm-gate +
 *                      schema_query action='get_safety_rules')
 *   - wowok-tools    → MCP tools-reference
 *                      (schema_query action='get_tool_reference')
 *   - wowok-scenario → MCP scenario-modes
 *                      (project_operation recommend_industry / create_project,
 *                       industry mode registry)
 *   - wowok-guard    → MCP guard-design-patterns
 *                      (schema_query action='get_guard_design_patterns')
 *
 * The MCP server now serves all rules/reference knowledge directly — installing
 * skills is NOT required for correctness. The 9 retained skills keep only the
 * dialogue orchestration layer (business process flows) that cannot be sunk.
 *
 * Role-based skill selection guide for AI:
 *
 * 1. CUSTOMER (wowok-order)
 *    - Use when: User wants to place orders, track progress, request arbitration as a customer
 *    - Key actions: Purchase from Service, operate Order/Progress, submit disputes
 *
 * 2. PROVIDER (wowok-provider, wowok-machine)
 *    - Use when: User is a merchant/service provider building or operating services
 *    - Key actions: Create Service, design Machine workflow, set Allocators, handle customer orders
 *
 * 3. SUPPLIER (wowok-supplier)
 *    - Use when: User is a sub-order provider presenting to a Demand and fulfilling sub-orders
 *    - Key actions: Present service to Demand, fulfill sub-order via Progress, collect settlement
 *
 * 4. COLLABORATOR (wowok-collaborator)
 *    - Use when: User is an operator executing workflow forwards (internal staff or external named operator)
 *    - Key actions: Execute permission/named-operator forwards, submit guard evidence
 *
 * 5. ARBITRATOR (wowok-arbitrator)
 *    - Use when: User operates an arbitration service for dispute resolution
 *    - Key actions: Create Arbitration, review evidence, organize voting, manage fees
 *
 * 6. SHARED (wowok-messenger, wowok-output, wowok-onboard, wowok-planner, wowok-auditor)
 *    - Use when: Any role needs encrypted messaging, output formatting, onboarding,
 *      planning, or pre-publish audit
 *    - Always loaded: wowok-output
 *    - On-demand: the rest
 */

/**
 * Skills removed in the GLM5-31 sink refactor. Their content lives in the MCP
 * knowledge layer and is served via schema_query / project_operation — no skill
 * installation required. Kept here for migration detection (checkSkillMigration).
 */
export const DEPRECATED_SKILLS = [
  'wowok-safety',
  'wowok-tools',
  'wowok-scenario',
  'wowok-guard',
] as const;

export type DeprecatedSkill = (typeof DEPRECATED_SKILLS)[number];

/** Where each deprecated skill's content now lives (for migration messages). */
export const SKILL_MIGRATION_MAP: Record<DeprecatedSkill, string> = {
  'wowok-safety': "MCP schema_query action='get_safety_rules' (+ runtime confirm-gate on every on-chain write)",
  'wowok-tools': "MCP schema_query action='get_tool_reference'",
  'wowok-scenario': "MCP project_operation action='recommend_industry' / 'list_modes' / 'create_project' (industry mode registry)",
  'wowok-guard': "MCP schema_query action='get_guard_design_patterns' (+ action='get_guard_templates')",
};

export const wowokSkills: SkillConfig = {
  skills: [
    // === CUSTOMER ROLE ===
    {
      name: 'wowok-order',
      description: 'Customer order lifecycle — place orders, track progress via Order/Progress, submit arbitration disputes, claim compensation. Use when user acts as a customer/buyer.',
      version: '2.0.0',
      role: 'customer',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-arbitrator', 'wowok-messenger']
    },

    // === PROVIDER ROLE ===
    {
      name: 'wowok-provider',
      description: 'Service provider guide — create Service, design Machine workflow, configure Allocators for fund distribution, handle order fulfillment and customer service via Messenger. Use when user is a merchant/seller. Safety rules and tool reference are served by MCP (schema_query).',
      version: '2.0.0',
      role: 'provider',
      loading: 'on-demand',
      related: ['wowok-machine', 'wowok-messenger']
    },
    {
      name: 'wowok-machine',
      description: 'Machine workflow design — state machines, node definitions, progress tracking, forward/guard logic (R-M1-11 compliant: fund movement via Allocators, never via Machine terminal nodes). Used by providers to design order processing workflows.',
      version: '2.0.0',
      role: 'provider',
      loading: 'on-demand',
      related: ['wowok-provider']
    },

    // === SUPPLIER ROLE ===
    {
      name: 'wowok-supplier',
      description: 'Supplier (sub-order provider) guide — present your service to a Demand (open or passport-gated), fulfill the resulting sub-order via Progress, and collect settlement from the upstream merchant. Use when the user acts as a supplier answering an RFP/demand.',
      version: '2.0.0',
      role: 'supplier',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-machine', 'wowok-messenger']
    },

    // === COLLABORATOR ROLE ===
    {
      name: 'wowok-collaborator',
      description: 'Process collaborator guide — execute workflow forwards as internal staff (permission entity) or external operator (named operator). Covers routing, guard-gated evidence submission, and reputation protection. Use when the user is an operator advancing a Machine workflow.',
      version: '2.0.0',
      role: 'collaborator',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-machine', 'wowok-messenger']
    },

    // === ARBITRATOR ROLE ===
    {
      name: 'wowok-arbitrator',
      description: 'Arbitration service operation — create Arbitration, receive evidence via Messenger, organize voting processes, manage compensation funds, extract fees. Use when user operates dispute resolution.',
      version: '2.0.0',
      role: 'arbitrator',
      loading: 'on-demand',
      related: ['wowok-order', 'wowok-messenger']
    },

    // === SHARED / ALL ROLES ===
    {
      name: 'wowok-messenger',
      description: 'Encrypted messaging — end-to-end encrypted communication, WTS evidence generation, conversation management. Used by all roles for secure off-chain communication and arbitration evidence.',
      version: '2.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-order', 'wowok-provider', 'wowok-arbitrator']
    },
    {
      name: 'wowok-output',
      description: 'Output processing — post-processes all WoWok tool responses for human-readable presentation. Handles address resolution, name mapping, amount formatting, and data visualization. ALWAYS loaded for all roles.',
      version: '2.0.0',
      role: 'shared',
      loading: 'always',
      related: []
    },

    // === ONBOARDING / PLANNING / AUDIT (L3+L4 BRIDGE) ===
    {
      name: 'wowok-onboard',
      description: 'First-touch onboarding — guides a new user from zero to their first published Service through a Review opening + 12-round user-driven dialogue. Industry mode defaults (freelance/rental/education/travel/...) are served by MCP project_operation recommend_industry. Use when a new user says "I want to open a shop" or has no published Service yet.',
      version: '2.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-machine']
    },
    {
      name: 'wowok-planner',
      description: 'Main planning Skill for the Harness Plan Loop — converts natural language intent into an Object Dependency Graph (ODG). Industry templates are served by MCP scenario-modes; this skill retains the planning dialogue and Hand-off protocol to Harness.',
      version: '2.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-onboard', 'wowok-auditor', 'wowok-provider']
    },
    {
      name: 'wowok-auditor',
      description: 'Pre-publish audit Skill for the Harness Verify Loop — checks Guard completeness, Machine soundness (R-M1-11), fund flow correctness, and publish readiness before irreversible publish operations. 4 audit rule tables with 32 total checks.',
      version: '2.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-planner', 'wowok-provider', 'wowok-machine']
    }
  ]
};

/**
 * Get all skills
 */
export function getSkills(): Skill[] {
  return wowokSkills.skills;
}

/**
 * Get skill by name
 */
export function getSkillByName(name: string): Skill | undefined {
  return wowokSkills.skills.find(skill => skill.name === name);
}

/**
 * Get skills by role
 */
export function getSkillsByRole(role: SkillRole): Skill[] {
  return wowokSkills.skills.filter(skill => skill.role === role);
}

/**
 * Get skills by loading mode
 */
export function getSkillsByLoading(mode: 'always' | 'on-demand'): Skill[] {
  return wowokSkills.skills.filter(skill => skill.loading === mode);
}

/**
 * Get role-based skill groupings for AI guidance
 */
export function getRoleSkills(): RoleSkills[] {
  const roles: { role: SkillRole; roleName: string; description: string }[] = [
    {
      role: 'customer',
      roleName: 'Customer',
      description: 'Users placing orders and participating in commerce as buyers'
    },
    {
      role: 'provider',
      roleName: 'Service Provider',
      description: 'Merchants and sellers creating services and handling orders'
    },
    {
      role: 'supplier',
      roleName: 'Supplier',
      description: 'Sub-order providers presenting to Demands and fulfilling sub-orders'
    },
    {
      role: 'collaborator',
      roleName: 'Collaborator',
      description: 'Process operators (internal permission entities and external named operators)'
    },
    {
      role: 'arbitrator',
      roleName: 'Arbitrator',
      description: 'Dispute resolution services and voting organizers'
    },
    {
      role: 'shared',
      roleName: 'Shared Tools',
      description: 'Common tools and protocols for all roles'
    }
  ];

  return roles.map(r => ({
    ...r,
    skills: getSkillsByRole(r.role)
  }));
}

/**
 * AI skill selection helper
 * Returns recommended skills based on user intent keywords
 *
 * Note: Guard design / tool usage / safety / industry-mode questions are now
 * served directly by the MCP knowledge layer (schema_query actions
 * get_guard_design_patterns / get_tool_reference / get_safety_rules, and
 * project_operation recommend_industry) — no skill installation required.
 */
export function recommendSkills(intent: string): Skill[] {
  const lower = intent.toLowerCase();

  // Provider keywords
  if (/\b(create service|merchant|seller|provider|build service|allocators?|machine design)\b/.test(lower)) {
    return getSkillsByRole('provider');
  }

  // Customer keywords
  if (/\b(place order|buy|purchase|customer|order status|track progress|dispute|compensation)\b/.test(lower)) {
    return getSkillsByRole('customer');
  }

  // Supplier keywords
  if (/\b(supplier|sub.order|present service|present to demand|rfp|open call|fulfill sub.order)\b/.test(lower)) {
    return getSkillsByRole('supplier');
  }

  // Collaborator keywords
  if (/\b(collaborator|operator|permission index|named operator|execute forward|advance workflow)\b/.test(lower)) {
    return getSkillsByRole('collaborator');
  }

  // Arbitrator keywords
  if (/\b(arbitration|arbitrator|dispute resolution|voting|evidence|arb object)\b/.test(lower)) {
    return getSkillsByRole('arbitrator');
  }

  // Guard/tool/safety/scenario keywords → no dedicated skill anymore.
  // Return empty and let the AI consult the MCP knowledge layer instead.
  if (/\b(guard design|validation rules?|multi.sig|safety|industry mode|scenario)\b/.test(lower)) {
    return [];
  }

  // Default: return all on-demand skills
  return getSkillsByLoading('on-demand');
}

// ============================================================
// Skills Version Negotiation
// ============================================================

/**
 * Negotiate skill behavior mode based on MCP server version vs skill version.
 *
 * Decision matrix:
 *  - MCP major > skill major → "passthrough" (skill only forwards MCP responses)
 *  - MCP major < skill major → "legacy" (skill falls back to older content)
 *  - Major versions match    → "full" (normal orchestration)
 *
 * This ensures skills degrade gracefully when the MCP server is upgraded
 * but skills haven't been updated yet. Users still get MCP functionality
 * (via passthrough), just without the narrative/orchestration layer.
 *
 * @param mcpVersion   MCP server version string (e.g. "1.2.0")
 * @param skillVersion Skill version string (e.g. "1.0.0")
 * @returns negotiation mode: 'full' | 'passthrough' | 'legacy'
 */
export function negotiateSkillMode(mcpVersion: string, skillVersion: string): SkillMode {
  const mcpMajor = parseInt(mcpVersion.split('.')[0] || '0', 10);
  const skillMajor = parseInt(skillVersion.split('.')[0] || '0', 10);

  if (Number.isNaN(mcpMajor) || Number.isNaN(skillMajor)) {
    // Can't parse version — default to full (best-effort)
    return 'full';
  }

  if (mcpMajor > skillMajor) return 'passthrough';
  if (mcpMajor < skillMajor) return 'legacy';
  return 'full';
}

/**
 * Negotiate mode for all registered skills against a given MCP version.
 *
 * Returns a map of skill name → mode. Useful for the client to know
 * which skills are in passthrough/legacy mode and need AI fallback.
 *
 * @param mcpVersion MCP server version string
 * @returns array of { skill, version, mode } for all skills
 */
export function negotiateAllSkills(mcpVersion: string): Array<{
  skill: string;
  version: string;
  mode: SkillMode;
}> {
  return wowokSkills.skills.map((s) => ({
    skill: s.name,
    version: s.version,
    mode: negotiateSkillMode(mcpVersion, s.version),
  }));
}

// ============================================================
// Skill Migration (GLM5-31 §3.2)
// ============================================================

/**
 * Detect deprecated skills still installed on the client and tell the user
 * where their content now lives.
 *
 * The 4 sunk skills (wowok-safety/tools/scenario/guard) keep working after
 * the MCP upgrade (their calls are answered by the newer MCP), but their
 * content is stale — the MCP knowledge layer is the single source of truth.
 * Users should uninstall them to avoid the AI reading outdated rules.
 *
 * @param installedSkills names of skills currently installed on the client
 * @returns deprecated hits + a human-readable migration message
 */
export function checkSkillMigration(installedSkills: string[]): {
  deprecated: string[];
  migration_targets: Record<string, string>;
  message: string;
} {
  const deprecated = installedSkills.filter((s) =>
    (DEPRECATED_SKILLS as readonly string[]).includes(s),
  );

  const migration_targets: Record<string, string> = {};
  for (const s of deprecated) {
    migration_targets[s] = SKILL_MIGRATION_MAP[s as DeprecatedSkill];
  }

  return {
    deprecated,
    migration_targets,
    message:
      deprecated.length > 0
        ? `Skills [${deprecated.join(', ')}] have been migrated to the MCP knowledge layer ` +
          `(GLM5-31 sink refactor). Their content is now served directly by the MCP server — ` +
          `you can safely uninstall them:\n` +
          deprecated.map((s) => `  - ${s} → ${SKILL_MIGRATION_MAP[s as DeprecatedSkill]}`).join('\n')
        : '',
  };
}
