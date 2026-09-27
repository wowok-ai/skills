---
name: data-analysis
description: "Exact data processing and computation in the sandbox — CSV/JSON/TSV transformation, aggregation, statistics, format conversion, file generation. Uses the code_run sandbox with the jailed workspace API so numbers add up and outputs land as workspace files. Use when: user asks to compute/sum/average/convert/merge/transform data; analysis must be arithmetically exact; a result should be saved as a downloadable file."
metadata:
  version: "1.0.0"
  role: shared
  loading: on-demand
---

# Data Analysis

Compute exactly, show your work, persist outputs. The sandbox exists because LLM mental arithmetic drifts — route every multi-step calculation through `code_run`.

# When to use the sandbox

| Task | Path |
|---|---|
| Sum / average / group a column | `code_run` (never mental math) |
| CSV ↔ JSON ↔ TSV conversion | `code_run` + `workspace.write` |
| Filter, join, dedupe records | `code_run` |
| "What changed between these files" | `code_run` diff over `workspace.read` |
| A quick lookup in a small file you already have inline | direct answer is fine |

# Workflow

1. **Inspect first**: `workspace.read` (or `document_extract` for XLSX) a small sample — columns, delimiters, encodings — before writing transformation code.
2. **One script, one job**: read input(s) from `workspace`, transform, either `return` a compact result (aggregates, head of the output, counts) or `workspace.write` the full artifact (e.g. `reports/sales-2026-q3.csv`).
3. **Verify in the same script**: assert row counts, check totals, validate schemas — a script that proves its own output beats a plausible-looking number.
4. **Report**: the exact figures (from the script's return value), the method in one line, and the output file path if written.

# Guardrails

- `code_run` has NO network, NO require/fs/process — the jailed `workspace` API (read/readBase64/write/writeBase64/list/exists) is the only I/O. Files must be inside the workspace.
- Timeout is 5s by default (15s max) — stream-style processing for big inputs, not brute force.
- Large results: return aggregates + a head sample in the chat; write the full dataset to a file. Do not paste 10k rows into the conversation.
- WoWok data in the workspace (exports, wip JSON) is fair game — analyze it with the same rigor, but any ON-CHAIN action stays in the WoWok flows (amounts, recipients and confirmation gates are enforced there; never side-step them with a script).
