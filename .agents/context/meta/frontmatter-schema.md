---
title: Frontmatter schema
summary: Required and optional frontmatter fields for every document under .agents/context/
category: meta
last_updated: 2026-07-15
---

# Frontmatter schema

Every Markdown document under `.agents/context/` (except `README.md` itself) starts with a YAML frontmatter block. This is what `knowledge-toc` reads to regenerate the table of contents without opening the full body of each file, and what `knowledge-lint` validates.

## Required fields

```yaml
---
title: Human-readable title
summary: One sentence, plain language, no jargon. This is what shows up in the TOC.
category: domain | product | engineering | meta
last_updated: YYYY-MM-DD
---
```

- **title** — short, no punctuation beyond what's natural. Matches the document's H1.
- **summary** — a single sentence. This is the only thing a reader sees before deciding whether to open the file, so it must stand alone without the rest of the document. Avoid restating the title; say what the document actually claims or decides.
- **category** — one of the four top-level folders the document lives under. Must match the actual folder (`knowledge-lint` checks this).
- **last_updated** — ISO date, updated whenever the body changes materially. Not bumped for typo fixes.

## Optional fields

```yaml
related:
  - domain/readiness-rules.md
  - engineering/overview/monorepo-layout.md
```

- **related** — relative paths (from `.agents/context/`) to other documents this one assumes, extends, or is commonly read alongside. Used to surface connections the TOC's flat list can't show. Not a substitute for actual in-body links — see `conventions.md`.

## Example

```yaml
---
title: Readiness rules
summary: The three decision-mode templates (hierarchical, consensual, threshold) and the band → band+type → event config cascade
category: domain
last_updated: 2026-07-15
related:
  - domain/event-lifecycle.md
---
```

## What `knowledge-lint` checks

- Frontmatter block is present and parses as valid YAML.
- All four required fields are present and non-empty.
- `category` matches the document's actual parent folder.
- `last_updated` is a valid ISO date, not in the future.
- Any path listed in `related` actually exists.
