import { Skill, SkillConfig, SkillRole, RoleSkills, SkillMode } from './types';

/**
 * WoWok Skills organized by role
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
 * 3. ARBITRATOR (wowok-arbitrator)
 *    - Use when: User operates an arbitration service for dispute resolution
 *    - Key actions: Create Arbitration, review evidence, organize voting, manage fees
 * 
 * 4. SHARED (wowok-tools, wowok-safety, wowok-guard)
 *    - Use when: Any role needs tool usage, safety protocols, or guard design
 *    - Always loaded: wowok-tools, wowok-safety
 *    - On-demand: wowok-guard (complex guard design)
 */

export const wowokSkills: SkillConfig = {
  skills: [
    // === CUSTOMER ROLE ===
    {
      name: 'wowok-order',
      description: 'Customer order lifecycle — place orders, track progress via Order/Progress, submit arbitration disputes, claim compensation. Use when user acts as a customer/buyer.',
      version: '1.0.0',
      role: 'customer',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-arbitrator', 'wowok-messenger', 'wowok-tools']
    },

    // === PROVIDER ROLE ===
    {
      name: 'wowok-provider',
      description: 'Service provider guide — create Service, design Machine workflow, configure Allocators for fund distribution, handle order fulfillment and customer service via Messenger. Use when user is a merchant/seller.',
      version: '1.0.0',
      role: 'provider',
      loading: 'on-demand',
      related: ['wowok-machine', 'wowok-guard', 'wowok-messenger', 'wowok-tools']
    },
    {
      name: 'wowok-machine',
      description: 'Machine workflow design — state machines, node definitions, progress tracking, forward/guard logic. Used by providers to design order processing workflows.',
      version: '1.0.0',
      role: 'provider',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-guard']
    },

    // === ARBITRATOR ROLE ===
    {
      name: 'wowok-arbitrator',
      description: 'Arbitration service operation — create Arbitration, receive evidence via Messenger, organize voting processes, manage compensation funds, extract fees. Use when user operates dispute resolution.',
      version: '1.0.0',
      role: 'arbitrator',
      loading: 'on-demand',
      related: ['wowok-order', 'wowok-messenger', 'wowok-tools']
    },

    // === SHARED / ALL ROLES ===
    {
      name: 'wowok-messenger',
      description: 'Encrypted messaging — end-to-end encrypted communication, WTS evidence generation, conversation management. Used by all roles for secure off-chain communication and arbitration evidence.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-order', 'wowok-provider', 'wowok-arbitrator']
    },
    {
      name: 'wowok-tools',
      description: 'MCP tool usage mastery — query_toolkit, onchain_operations, messenger_operation, schema_query, and all 13 tools with correct parameter formats. ALWAYS loaded for all roles.',
      version: '1.0.0',
      role: 'shared',
      loading: 'always',
      related: ['wowok-safety']
    },
    {
      name: 'wowok-safety',
      description: 'Safety protocol — dry-run validation, user confirmation checkpoints, execute with authorization. ALWAYS loaded for protection against mistakes.',
      version: '1.0.0',
      role: 'shared',
      loading: 'always',
      related: ['wowok-tools']
    },
    {
      name: 'wowok-output',
      description: 'Output processing — post-processes all WoWok tool responses for human-readable presentation. Handles address resolution, name mapping, amount formatting, and data visualization. ALWAYS loaded for all roles.',
      version: '1.0.0',
      role: 'shared',
      loading: 'always',
      related: ['wowok-tools']
    },
    {
      name: 'wowok-guard',
      description: 'Guard design mastery — programmable trust rules, multi-signature authorization, guard2file export/import. Used by providers and arbitrators for complex validation logic.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-provider', 'wowok-machine']
    },

    // === ONBOARDING / PLANNING / AUDIT (L3+L4 BRIDGE) ===
    {
      name: 'wowok-onboard',
      description: 'First-touch onboarding — guides a new user from zero to their first published Service in a structured 10-round dialogue. Use when a new user says "I want to open a shop" or has no published Service yet.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-scenario', 'wowok-tools', 'wowok-provider', 'wowok-safety', 'wowok-guard', 'wowok-machine']
    },
    {
      name: 'wowok-scenario',
      description: 'Industry mode templates — freelance, rental, digital goods, travel, subscription. Pre-fills Permission indexes, Machine node graphs, Guard bindings, and Allocation splits based on business type.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-onboard', 'wowok-provider', 'wowok-machine', 'wowok-guard']
    },
    {
      name: 'wowok-planner',
      description: 'Main planning Skill for the Harness Plan Loop — converts natural language intent into an Object Dependency Graph (ODG). Covers 5 scenario templates: freelance, rental, digital_goods, travel_package, general. Hand-off protocol to Harness documented.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-onboard', 'wowok-scenario', 'wowok-auditor', 'wowok-provider']
    },
    {
      name: 'wowok-auditor',
      description: 'Pre-publish audit Skill for the Harness Verify Loop — checks Guard completeness, Machine soundness, fund flow correctness, and publish readiness before irreversible publish operations. 4 audit rule tables with 32 total checks.',
      version: '1.0.0',
      role: 'shared',
      loading: 'on-demand',
      related: ['wowok-planner', 'wowok-provider', 'wowok-safety', 'wowok-guard', 'wowok-machine']
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
  
  // Arbitrator keywords
  if (/\b(arbitration|arbitrator|dispute resolution|voting|evidence|arb object)\b/.test(lower)) {
    return getSkillsByRole('arbitrator');
  }
  
  // Guard keywords
  if (/\b(guard design|validation rules?|multi.sig|permission|authorization)\b/.test(lower)) {
    return [getSkillByName('wowok-guard')!];
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
