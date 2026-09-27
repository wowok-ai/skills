---
name: file-analysis
description: "Analyze documents and files the user uploads or points to — chat attachments, workspace files, PDF/DOCX/XLSX/PPTX documents, source code trees. Workflow: locate (workspace_operation list/glob/search) → extract (document_extract) → analyze (summarize, answer questions, compare, audit) → report with file paths. Use when: user uploads an attachment and asks about it; user asks to read/summarize/compare/audit files; user asks what is inside a document."
metadata:
  version: "1.0.0"
  role: shared
  loading: on-demand
---

# File Analysis

Turn files into answers. Every claim in your report must trace to a file you actually read.

# Locate

1. **Chat attachments**: numbered `[1]`…`[12]` in the user's message. Text-like files are inlined after the prompt. Images on a vision model arrive as image parts. Binary documents (PDF/DOCX/XLSX…) list their stored workspace path (`chat-files/…`) — that path is your input to `document_extract`.
2. **Workspace files**: use `workspace_operation` `glob` for name patterns (`**/*.pdf`) and `search` for content (regex, `ignore_case`, context lines). NEVER list-then-read the whole tree — search first.
3. **Large files**: `read` with `offset`/`limit` (2000-line cap per call). Never guess what an unread section contains — read it or say you did not.

# Extract

- PDF / DOCX / XLSX / PPTX / ODT / ODS / HTML → `document_extract` with the workspace-relative path.
- Read the returned `warnings` literally: a scanned PDF (no text layer) or CID-encoded PDF says so — report the limitation instead of inventing content.
- Spreadsheets come back as one TSV block per sheet; keep the sheet name when reporting.

# Analyze

- Answer the user's actual question first, then add structure. Do not dump raw extracts.
- Compare files cell-by-cell via `code_run` when counts/diffs must be exact; never do multi-step arithmetic in your head.
- For code files: report entry points, data flow, and risks with file path + line references.
- For WoWok artifacts (wip / machine / guard JSON in the workspace): they pair with the role skills — analyze the file here, then hand the structured finding to the relevant WoWok flow (e.g. `read_skill_doc` wowok-auditor before publishing).

# Report

- Lead with the direct answer; support with quoted evidence and the source path.
- Cite as `path:line` for text files, `path#sheet` for spreadsheets, `path#page` when the extractor provides page markers.
- State coverage honestly: "analyzed 3 of 5 files (2 skipped: scanned PDFs)" beats a confident guess.
