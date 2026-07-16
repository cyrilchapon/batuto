---
name: knowledge-toc
description: Mechanically regenerate .agents/context/README.md from the frontmatter of every document under .agents/context/. Makes no editorial judgment — pure regeneration. Safe to run any time, including on a schedule.
---

# knowledge-toc

Purely mechanical. This skill never decides what content should exist — it only reflects, in `README.md`, whatever frontmatter already exists across `.agents/context/`. See `knowledge-update` for the judgment-based counterpart.

## Procedure

1. Walk every `.md` file under `.agents/context/` except `README.md` itself.
2. For each file, read its frontmatter (`title` is not used directly in the TOC — use `summary` and the file's relative path; `category` determines which section of the TOC it belongs under).
3. If a file is missing required frontmatter or it fails to parse, **stop and report it** rather than guessing a summary or silently skipping the file — that's a `knowledge-lint` failure, fix the frontmatter first (or run `knowledge-lint` first as a pre-check).
4. Group files by `category` (`domain`, `product`, `engineering`, `meta`), mirroring the folder structure. Within `engineering`, keep the `overview/` vs `modules/` split visible as separate subsections, same as the existing README.
5. Render each group as a Markdown table: `| Document | Summary |`, where "Document" is a relative Markdown link (`[filename.md](relative/path.md)`) and "Summary" is the frontmatter `summary` field verbatim.
6. If a category folder currently has no documents (e.g. `engineering/modules/` today), keep its heading with a short note rather than omitting the section entirely — this signals the folder exists and is meant to be populated, not forgotten.
7. Replace the body of `.agents/context/README.md` with the regenerated content, preserving the top intro paragraph (the instruction to read this before opening other documents, and the note that this file is generated).

## What not to do

- Don't hand-craft summaries different from what's in each file's frontmatter — if a summary reads badly in the TOC, fix it at the source (the document's frontmatter), then re-run this skill, rather than patching the TOC directly.
- Don't reorder or rename category sections without a corresponding update to `meta/conventions.md` — the TOC structure should mirror the documented folder boundaries, not drift from them independently.
