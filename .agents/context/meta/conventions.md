---
title: Knowledge base conventions
summary: Structural rules for .agents/context — file naming, linking, and folder boundaries
category: meta
last_updated: 2026-07-15
---

# Knowledge base conventions

These rules exist so the knowledge base stays mechanically maintainable — so `knowledge-toc` and `knowledge-lint` can operate on it without special-casing.

## File naming

- `kebab-case.md`, always. No spaces, no uppercase, no dates in filenames (that's what `last_updated` in frontmatter is for).
- Name the file after what it documents, not after the ticket or conversation that produced it — `readiness-rules.md`, not `bat-1-notes.md`.

## Linking

- **Always relative Markdown links**, resolved from the linking file's own location: `[readiness rules](../domain/readiness-rules.md)`.
- Never absolute paths (`/home/claude/...`), never bare filenames without a path, never links into `/mnt/...` or other machine-specific locations.
- Link to Linear issues/documents by full URL when referencing external source material (e.g. a spike issue), not by ID alone — an ID means nothing out of context.
- `knowledge-lint` resolves every relative link and fails on anything that doesn't point to a real file.

## Folder boundaries

- **`domain/`** — how a music band actually operates, independent of Batutô as a product. Would still be true if we were describing the real-world process on paper. No mention of database tables, endpoints, or UI.
- **`product/`** — what Batutô, specifically, decides to do with that domain: scope (in/out), cross-cutting product conventions. Not "how the band works," but "what we chose to build or not build."
- **`engineering/overview/`** — stable, high-level technical knowledge: stack, repo layout, conventions, infra. The stuff you'd want to read once before touching the code, not before touching a specific corner of it.
- **`engineering/modules/`** — one document per code area or subsystem, populated as the codebase grows. Deliberately left unstructured internally (no forced subfolder taxonomy) until real content makes a natural grouping obvious.
- **`meta/`** — knowledge about `.agents/` itself, both `context/` and `skills/`. If you're describing a rule for how documents are structured/maintained, or how skills are sourced and governed (see `meta/skills-provenance.md`), it goes here, not in a README aside.

When in doubt about `domain/` vs `product/`: would this sentence be true for a band running everything by hand on WhatsApp and a spreadsheet? If yes, it's `domain/`. If it only makes sense in the context of what the app does or doesn't do, it's `product/`.

## Document shape

Every document should be readable stand-alone by an agent that hasn't read anything else — the frontmatter `summary` is the only thing assumed to have been seen beforehand. Prefer:

- A short intro paragraph stating what's settled, before diving into details.
- Explicit callouts for what's still open or deferred, rather than silently omitting it (see `domain/readiness-rules.md` for the pattern — "resolved" vs "still open" as distinct sections).
- Links to the originating Linear issue/spike for anything non-obvious, so an agent can trace a decision back to its reasoning rather than take the summary on faith.

## Source of truth discipline

Where a document would otherwise duplicate content that already lives canonically elsewhere (a Linear document, another `.agents/context` file), link to it instead of copying it. `engineering/overview/stack.md` is the reference example: it summarizes and points to the Linear "Tech stack" document rather than re-describing every tool.
