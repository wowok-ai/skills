# Appendix — wowok-scenario

> This file is loaded on-demand (Progressive Disclosure).
> Main skill: [SKILL.md](./SKILL.md)

---

## Tier Layering

### Novice Tier — Full Driving Mode

- User selects an industry; mode defaults fill R3-R8 with no manual configuration
- 10-round build completes with user only confirming mode defaults
- Audit checklist enforces all blocker items
- Failure playbook provides step-by-step recovery

### Advanced Tier — Customize Defaults

- User selects a mode but overrides specific fields (e.g., freelance Allocator changed from 100% provider to 80% provider + 20% platform)
- Mode template is the starting point, not the contract
- Audit checklist still runs; user can dismiss warnings with explicit confirmation
- Trigger: user says "I want to customize" or has done this before

### Expert Tier — Free Mode

- User invokes `general` mode (escape hatch)
- No defaults applied; raw MCP operations exposed
- wowok-machine, wowok-guard, wowok-provider become the primary references
- Audit checklist is optional but recommended
- Trigger: user explicitly asks for "expert mode" or invokes MCP operations by name

---

## IndustryModeSchema (Reference)

```typescript
type IndustryModeSchema = {
  name: "freelance" | "rental" | "education" | "travel" | "subscription" | "general";
  display_name: string;
  traits: IndustryTraits;
  defaults: {
    permission_indexes: { role: string; index: number | null; scope: string }[]; // null = uses namedOperator: ""
    machine_template: {
      nodes: { name: string; prev_node: string; threshold: number }[];
      forwards: {
        name: string;
        weight: number;
        permissionIndex?: number;   // user-defined ≥1000; absent if using namedOperator
        namedOperator?: string;     // "" = order owner/agents (customer/renter)
        guard?: string;             // Forward guard name (binds via Machine MODIFY)
      }[];
    };
    guard_templates: {
      name: string;
      host: string;              // Service.buy_guard | Machine Forward <name> | Allocator trigger
      validation_logic: string;
      table_entries: { identifier: number; b_submission: boolean; value_type: string; value?: string; name: string }[];
    }[];
    // Mirrors AllocatorSchema: each allocator has guard + sharing[] (each item has who + sharing + mode)
    allocator_strategy: {
      guard: string;             // Allocator trigger guard name (NOT trigger_guard — matches AllocatorSchema)
      sharing: { who: RecipientType; sharing: number; mode: "Amount" | "Rate" | "Surplus" }[];
      fix?: number;              // optional fixed amount
      max?: number | null;       // optional cap
    }[];
    arbitration_enabled: boolean;
  };
  dialogue_script: { round: string; goal: string; mcp_calls: string[] }[];
  audit_checklist: { id: number; check: string; blocker: boolean }[];
  failure_playbook: { scenario: string; mitigation: string; recovery: string }[];
  escape_hatch: {
    available: true;
    warning: string;
  };
};

type RecipientType =
  | { Entity: { name_or_address: string } }
  | { GuardIdentifier: number }
  | { Signer: "signer" };
```

Every mode definition in this Skill follows this schema. Phase 2/3 modes (education, travel, subscription) will fill in the same schema when promoted to Phase 1 detail level.

---

## Quick Reference

| Want to... | Use this |
|------------|----------|
| Pick a mode for a new user | §Mode Selection Logic |
| Get freelance defaults | §Freelance Mode |
| Get rental defaults | §Rental Mode |
| Combine two modes | §Mode Composition |
| Switch to manual config | §Escape Hatch |
| Validate before publish | Mode-specific §Audit Checklist |
| Recover from a stuck flow | Mode-specific §Failure Playbooks |
