#!/usr/bin/env node
// Copyright (c) Wowok.
// SPDX-License-Identifier: Apache-2.0

/**
 * Skills Length & Glossary CI Audit
 *
 * Enforces Phase 2 Batch 5 governance rules:
 *   - SKILL.md files must stay within length thresholds (Progressive Disclosure)
 *   - Terminology must align with CONCEPT_GLOSSARY (no glossary drift)
 *
 * Thresholds (per user decision 2026-07-14):
 *   - > 400 lines: ERROR  — must split
 *   - > 300 lines: WARN   — consider splitting
 *   - > 250 lines: INFO   — observe
 *   - ≤ 250 lines: OK
 *
 * Usage:
 *   node scripts/check-skills-length.mjs              # audit only, exit 0 always
 *   node scripts/check-skills-length.mjs --enforce    # exit 1 if any ERROR
 *   node scripts/check-skills-length.mjs --json        # output JSON report
 *
 * Exit codes:
 *   0 — audit passed (or warnings only)
 *   1 — enforcement mode: at least one file exceeds 400 lines
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILLS_ROOT = join(__dirname, "..");

// Thresholds per user decision
const THRESHOLD_ERROR = 400; // must split
const THRESHOLD_WARN = 300; // consider splitting
const THRESHOLD_INFO = 250; // observe

// Parse CLI args
const args = process.argv.slice(2);
const enforce = args.includes("--enforce");
const jsonOutput = args.includes("--json");

/** Find all SKILL.md files under a directory. */
function findSkillFiles(root) {
    const results = [];
    if (!existsSync(root)) return results;
    const entries = readdirSync(root);
    for (const entry of entries) {
        const fullPath = join(root, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            // Skip tooling dirs and every client install-target copy
            // (.claude/.agents/.cursor/.codex/.trae/...) — those are generated.
            const SKIP = [
                "node_modules", ".git", "dist", "scripts", "src",
                ".claude", ".agents", ".cursor", ".codex", ".codebuddy",
                ".windsurf", ".qoder", ".roo", ".cline", ".kilo", ".github", ".trae",
            ];
            if (SKIP.includes(entry)) continue;
            results.push(...findSkillFiles(fullPath));
        } else if (entry === "SKILL.md") {
            results.push(fullPath);
        }
    }
    return results;
}

/** Count lines in a file. */
function countLines(filePath) {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").length;
}

/** Extract YAML frontmatter and first heading for context. */
function extractMetadata(filePath) {
    const content = readFileSync(filePath, "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const nameMatch = frontmatterMatch?.[1].match(/^name:\s*(.+)$/m);
    return {
        name: nameMatch?.[1]?.trim() ?? basename(dirname(filePath)),
    };
}

/** Determine status from line count. */
function getStatus(lines) {
    if (lines > THRESHOLD_ERROR) return "ERROR";
    if (lines > THRESHOLD_WARN) return "WARN";
    if (lines > THRESHOLD_INFO) return "INFO";
    return "OK";
}

/**
 * Glossary drift check uses hardcoded deprecated-term patterns (no external file dependency).
 *
 * Two classes of checks:
 *   1. Deprecated/variant terms → canonical CONCEPT_GLOSSARY term.
 *   2. Terminology consistency — the R1–R10 labels are a FIXED MCP enum
 *      (`current_round`: R1=intent, R2=table, R3=tree, R4=rely, R5=binding,
 *      R6=review, R7=CREATE, R8=test, R9=bind, R10=verify — Guard-authoring
 *      dialogue rounds). Skills must not redefine them as local checklist
 *      steps; local steps are labelled "Step n". A file that prints the
 *      canonical anchor ("R1=intent") is treated as the definition and may
 *      reference the full R1–R10 range freely.
 */
function checkGlossaryDrift(filePath) {
    const content = readFileSync(filePath, "utf-8");
    const lower = content.toLowerCase();
    const drifts = [];

    // Known drift patterns — these are common deprecated/variant terms
    // that should use the canonical CONCEPT_GLOSSARY term instead
    const driftPatterns = [
        { pattern: /\boperator\s+address\b/g, canonical: "NamedOperator", hint: "use 'NamedOperator' instead of 'operator address'" },
        { pattern: /\bprogress\s+mark\b/g, canonical: "Progress", hint: "use 'Progress' (object) instead of 'progress mark'" },
        { pattern: /\bmaker\b(?!\s*-)/g, canonical: "NamedOperator", hint: "use 'NamedOperator' instead of deprecated 'maker'" },
        { pattern: /\btaker\b(?!\s*-)/g, canonical: "OrderHolder", hint: "use 'OrderHolder' instead of deprecated 'taker'" },
    ];

    for (const { pattern, canonical, hint } of driftPatterns) {
        const matches = lower.match(pattern);
        if (matches) {
            drifts.push({
                type: "glossary_drift",
                canonical,
                hint,
                count: matches.length,
            });
        }
    }

    // R1–R10 terminology consistency (case-sensitive — checked on raw content).
    const isCanonicalDefinition = /\bR1\s*=\s*intent\b/i.test(content);
    if (!isCanonicalDefinition) {
        const roundPatterns = [
            {
                pattern: /\|\s*\*{0,2}R(?:10|[1-9])\*{0,2}\s*\|/g,
                hint: "do not redefine R1–R10 as local checklist labels (R1=intent…R10=verify is the MCP current_round enum for Guard-authoring rounds); label local steps 'Step n'",
            },
            {
                pattern: /\bR1\s*[-–—]\s*R(?:10|[2-9])\b/g,
                hint: "'R1–Rn' denotes the MCP Guard-authoring rounds; name a local checklist range 'Steps 1-n' (or print the canonical 'R1=intent…R10=verify' anchor if the MCP rounds are meant)",
            },
        ];
        for (const { pattern, hint } of roundPatterns) {
            const matches = content.match(pattern);
            if (matches) {
                drifts.push({
                    type: "glossary_drift",
                    canonical: "R1–R10 (MCP current_round)",
                    hint,
                    count: matches.length,
                });
            }
        }
    }
    return drifts;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const skillFiles = findSkillFiles(SKILLS_ROOT);

const results = skillFiles.map((filePath) => {
    const lines = countLines(filePath);
    const status = getStatus(lines);
    const meta = extractMetadata(filePath);
    const drifts = checkGlossaryDrift(filePath);
    return {
        file: relative(SKILLS_ROOT, filePath).replace(/\\/g, "/"),
        name: meta.name,
        lines,
        status,
        glossaryDrifts: drifts,
    };
});

const errorCount = results.filter((r) => r.status === "ERROR").length;
const warnCount = results.filter((r) => r.status === "WARN").length;
const infoCount = results.filter((r) => r.status === "INFO").length;
const okCount = results.filter((r) => r.status === "OK").length;
const driftCount = results.reduce((sum, r) => sum + r.glossaryDrifts.length, 0);

// ─── Output ─────────────────────────────────────────────────────────────────

if (jsonOutput) {
    console.log(JSON.stringify({
        summary: {
            total: results.length,
            errors: errorCount,
            warnings: warnCount,
            info: infoCount,
            ok: okCount,
            glossaryDrifts: driftCount,
        },
        results,
    }, null, 2));
} else {
    console.log("═══════════════════════════════════════════════════");
    console.log("  WoWok Skills Length & Glossary CI Audit");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Thresholds: ERROR >${THRESHOLD_ERROR} | WARN >${THRESHOLD_WARN} | INFO >${THRESHOLD_INFO} | OK ≤${THRESHOLD_INFO}`);
    console.log(`  Skills root: ${relative(SKILLS_ROOT, SKILLS_ROOT) || "."}`);
    console.log("═══════════════════════════════════════════════════\n");

    // Sort by line count descending
    const sorted = [...results].sort((a, b) => b.lines - a.lines);
    for (const r of sorted) {
        const statusIcon = {
            ERROR: "🔴",
            WARN: "🟡",
            INFO: "🔵",
            OK: "🟢",
        }[r.status];
        const driftNote = r.glossaryDrifts.length > 0
            ? `  ⚠️  ${r.glossaryDrifts.length} glossary drift(s)`
            : "";
        console.log(`  ${statusIcon} ${r.status.padEnd(5)} ${String(r.lines).padStart(4)} lines  ${r.file}${driftNote}`);
        for (const d of r.glossaryDrifts) {
            console.log(`           └─ ${d.hint} (×${d.count})`);
        }
    }

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  Summary");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Total files:    ${results.length}`);
    console.log(`  🔴 ERROR (>400): ${errorCount}`);
    console.log(`  🟡 WARN  (>300): ${warnCount}`);
    console.log(`  🔵 INFO  (>250): ${infoCount}`);
    console.log(`  🟢 OK    (≤250): ${okCount}`);
    console.log(`  ⚠️  Glossary drifts: ${driftCount}`);
    console.log("═══════════════════════════════════════════════════\n");

    if (enforce && errorCount > 0) {
        console.error(`❌ ENFORCEMENT FAILURE: ${errorCount} file(s) exceed ${THRESHOLD_ERROR} lines.`);
        console.error("   Split required per Phase 2 Batch 5 Progressive Disclosure strategy.");
        process.exit(1);
    } else if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} file(s) exceed ${THRESHOLD_ERROR} lines. Run with --enforce to fail CI.`);
    } else {
        console.log(`✅ All Skills files within ${THRESHOLD_ERROR}-line limit.`);
    }
}

// Always exit 0 unless --enforce and there are errors
process.exit((enforce && errorCount > 0) ? 1 : 0);
