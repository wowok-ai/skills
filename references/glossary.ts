// Copyright (c) Wowok.
// SPDX-License-Identifier: Apache-2.0

// Phase 2 L3' Knowledge Layer — Concept Glossary (Topic 6)
// Single source of truth for authoritative terms. Schema fields and Skills must
// align with this table; aliases are deprecated and detected by validateText().

import { USER_DEFINED_PERM_INDEX_START } from "./onchain-constants.js";

export type GlossaryCategory =
    | "role"
    | "object"
    | "operation"
    | "acceptance"
    | "permission"
    | "fund";

export interface GlossaryEntry {
    /** Authoritative term (canonical, used in schema & docs). */
    term: string;
    /** Short definition. */
    definition: string;
    /** Deprecated aliases that should resolve to `term`. */
    aliases: string[];
    category: GlossaryCategory;
}

/**
 * Canonical glossary. Order is stable for deterministic scans.
 * When adding entries, keep `aliases` lowercase to match validateText().
 */
export const CONCEPT_GLOSSARY: GlossaryEntry[] = [
    // ── Permission triple (the three core permission definitions) ───────────
    {
        term: "Permission",
        definition:
            `Organization-wide permission object. indices 0-${USER_DEFINED_PERM_INDEX_START - 1} builtin, ` +
            `${USER_DEFINED_PERM_INDEX_START}-65535 custom. ` +
            "Shared across all Progress instances of a Service. Use for internal staff roles.",
        aliases: ["permission object"],
        category: "permission",
    },
    {
        term: "NamedOperator",
        definition:
            "Per-order role assignment inside a Progress. Each Progress node can map a role " +
            "string to an address. Use for external collaborators whose identity varies per order.",
        aliases: ["named operator", "namedoperator"],
        category: "permission",
    },
    {
        term: "OrderHolder",
        definition:
            "The order holder and their agents. Represented by namedOperator=\"\" (empty string) " +
            "on a Forward. Lets the customer operate their own order.",
        aliases: ["order owner", "orderholder", "order holder"],
        category: "permission",
    },
    // ── Process definition ───────────────────────────────────────────────────
    {
        term: "Forward",
        definition:
            "A state-transition edge in a Machine. Carries weight, a permission " +
            "(Permission index / NamedOperator / OrderHolder), and an optional Guard. " +
            "Every Forward MUST define at least one permission.",
        aliases: ["transition"],
        category: "operation",
    },
    {
        term: "Pair",
        definition:
            "A prev_node → next_node transition group in a Machine with a threshold. " +
            "When the cumulative weight of executed Forwards meets the threshold, the Pair fires.",
        aliases: ["transition pair"],
        category: "operation",
    },
    {
        term: "Machine",
        definition:
            "Workflow blueprint (directed graph). Becomes immutable after publish. " +
            "A Progress instance is created per order from the Machine.",
        aliases: ["machine template"],
        category: "object",
    },
    {
        term: "Progress",
        definition:
            "A workflow instance bound to one order. Advances via Forwards; " +
            "carries retained_submission values for Guard verification.",
        aliases: ["progress instance"],
        category: "object",
    },
    // ── Acceptance ────────────────────────────────────────────────────────────
    {
        term: "Guard",
        definition:
            "Immutable static validation rule. Verifies submissions and on-chain object data. " +
            "Returns boolean. Cannot be mutated after creation.",
        aliases: ["guard object"],
        category: "acceptance",
    },
    {
        term: "Repository",
        definition:
            "Mutable dynamic acceptance store. Keyed by (name, entity). " +
            "Used for data that can change over time (e.g. SLA config, review records).",
        aliases: ["repository object"],
        category: "acceptance",
    },
    {
        term: "Acceptance",
        definition:
            "The verification standard for a process step. Composed of static Guard + " +
            "dynamic Repository. Drives whether a Forward can execute.",
        aliases: ["acceptance standard"],
        category: "acceptance",
    },
    // ─── Objects ──────────────────────────────────────────────────────────────
    {
        term: "Service",
        definition:
            "A merchant's service listing. References Machine, order_allocators, arbitrations, " +
            "compensation_fund, rewards, buy_guard. machine & order_allocators lock after publish.",
        aliases: ["service object"],
        category: "object",
    },
    {
        term: "Order",
        definition:
            "An order against a Service. Funds are escrowed; released via Progress + Allocation. " +
            "Arb cases attach to orders for dispute resolution.",
        aliases: ["order instance"],
        category: "object",
    },
    {
        term: "Allocator",
        definition:
            "Fund distribution rules. Priority: Amount → Rate → Surplus. first-Guard-wins. " +
            "Locked on Service publish (order_allocators).",
        aliases: ["allocation"],
        category: "fund",
    },
    {
        term: "Allocation",
        definition:
            "The act of distributing escrowed funds to recipients per an Allocator. " +
            "Executed by the order holder or Permission holder.",
        aliases: ["allocation act"],
        category: "fund",
    },
    {
        term: "Arbitration",
        definition:
            "Independent arbitration service object. Configured with voting_guard, usage_guard, " +
            "fee. Generates Arb cases per dispute. Third-party preferred over self-built.",
        aliases: ["arb service"],
        category: "object",
    },
    {
        term: "Arb",
        definition:
            "A single dispute case instance of an Arbitration. Has a state machine " +
            "(dispute → confirm → vote → verdict → settle).",
        aliases: ["arb case"],
        category: "object",
    },
    {
        term: "compensation_fund",
        definition:
            "A fund attached to a Service. Arbitration indemnity is drawn from it. " +
            "Adequacy is a key trust signal for customers.",
        aliases: ["compensation fund"],
        category: "fund",
    },
    {
        term: "buy_guard",
        definition:
            "A Guard attached to a Service that gates purchasing. Validates customer eligibility.",
        aliases: ["buy guard"],
        category: "acceptance",
    },
    {
        term: "Sub-Order",
        definition:
            "A child order in a cross-Machine supply chain. Introduced at a node with transparent " +
            "suppliers; verified by Guard to originate from one of the declared suppliers.",
        aliases: ["suborder", "sub order"],
        category: "object",
    },
    {
        term: "Reward",
        definition:
            "Incentive pool. claim is Guard-gated. guard_add supports Fixed or GuardU64Identifier " +
            "(dynamic). Used for marketing (first-order, cumulative, referral).",
        aliases: ["reward pool"],
        category: "fund",
    },
    {
        term: "Demand",
        definition:
            "A user's posted service request with optional reward. presenters submit proposals; " +
            "Guard filters them. Matches Services for personalized acquisition.",
        aliases: ["demand request"],
        category: "object",
    },
    {
        term: "Personal",
        definition:
            "Permanently public on-chain identity profile. Social links, reputation (likes/dislikes), " +
            "personal info records. CRITICAL: everything here is PUBLIC forever.",
        aliases: ["personal profile"],
        category: "object",
    },
    {
        term: "Contact",
        definition:
            "Bridges a Service's um (contact) and the Messenger ims (messaging). Enables " +
            "off-chain encrypted communication for pre-order negotiation & evidence.",
        aliases: ["contact bridge"],
        category: "object",
    },
];

/** Lowercased alias → canonical term index. */
const ALIAS_INDEX: Map<string, string> = (() => {
    const m = new Map<string, string>();
    for (const e of CONCEPT_GLOSSARY) {
        m.set(e.term.toLowerCase(), e.term);
        for (const a of e.aliases) m.set(a.toLowerCase(), e.term);
    }
    return m;
})();

/** Resolve a (possibly deprecated) alias to the canonical term. Returns the input unchanged if unknown. */
export function resolveTerm(alias: string): string {
    if (!alias) return alias;
    return ALIAS_INDEX.get(alias.toLowerCase()) ?? alias;
}

/** Look up a glossary entry by canonical term (case-insensitive). */
export function lookupEntry(term: string): GlossaryEntry | undefined {
    const t = term.toLowerCase();
    return CONCEPT_GLOSSARY.find(
        (e) => e.term.toLowerCase() === t || e.aliases.some((a) => a.toLowerCase() === t),
    );
}

export interface GlossaryDrift {
    /** The deprecated alias found. */
    alias: string;
    /** Canonical term to use instead. */
    canonical: string;
    /** 1-based line number where the alias appeared (when scanning a file). */
    line?: number;
}

/**
 * Scan free text for deprecated aliases.
 * Returns a list of drift findings. Empty = clean.
 *
 * Note: this is a simple substring/word scan. For schema-field alignment use
 * `auditSchemaFields` which checks object key names directly.
 */
export function validateText(text: string): GlossaryDrift[] {
    const findings: GlossaryDrift[] = [];
    if (!text) return findings;
    const lower = text.toLowerCase();
    for (const entry of CONCEPT_GLOSSARY) {
        for (const alias of entry.aliases) {
            const a = alias.toLowerCase();
            // Avoid matching the canonical term inside its own definition
            if (entry.term.toLowerCase() === a) continue;
            if (lower.includes(a)) {
                findings.push({ alias, canonical: entry.term });
            }
        }
    }
    return findings;
}

/**
 * Audit an object's keys against the glossary. Returns aliases found among the
 * top-level keys. Used to keep schema field names canonical.
 */
export function auditSchemaFields(obj: Record<string, unknown>): GlossaryDrift[] {
    const findings: GlossaryDrift[] = [];
    for (const key of Object.keys(obj)) {
        const canonical = ALIAS_INDEX.get(key.toLowerCase());
        if (canonical && canonical !== key) {
            findings.push({ alias: key, canonical });
        }
    }
    return findings;
}

/** Stable version of the glossary for offline-flywheel audits & rollback. */
export const CONCEPT_GLOSSARY_VERSION = 1;