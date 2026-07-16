---
name: knowledge-lint
description: Mechanically validate every document under .agents/context/ against the frontmatter schema and linking conventions. Makes no editorial judgment — pure checking. Safe to run any time, including on a schedule.
---

# knowledge-lint

Purely mechanical. This skill checks conformance to `meta/frontmatter-schema.md` and `meta/conventions.md`; it doesn't judge whether content is good, current, or complete — that's `knowledge-update`'s job.

## Checks to run, per document under `.agents/context/` (excluding `README.md`)

1. **Frontmatter present and valid YAML.** Flag if missing or malformed.
2. **Required fields present and non-empty**: `title`, `summary`, `category`, `last_updated`.
3. **`category` matches the document's actual parent folder** (`domain`, `product`, `engineering`, `meta`). A file under `engineering/overview/` or `engineering/modules/` should have `category: engineering`.
4. **`last_updated` is a valid ISO date (`YYYY-MM-DD`) and not in the future.**
5. **Every path in `related` (if present) resolves to an existing file**, relative to `.agents/context/`.
6. **Every in-body Markdown link is a relative path** (no absolute filesystem paths, no bare filenames without a directory component when referring to another context doc, no `/mnt/...` paths) **and resolves to an existing file** relative to the linking document's own location.
7. **Filenames are kebab-case**, no spaces, no uppercase.

## Procedure

1. Walk every `.md` file under `.agents/context/` except `README.md`.
2. Run checks 1–7 above on each.
3. Report every failure with the file path and the specific check that failed — don't just say "invalid," say which field or which link.
4. Do not auto-fix anything silently. Report findings; let the person or the calling skill (e.g. `knowledge-update`) decide the fix, since a broken link might mean the link is wrong or the target file was legitimately renamed/removed — either fix is a judgment call.

## What not to do

- Don't validate content quality, staleness beyond the date check, or whether a document *should* exist — that's out of scope for this skill.
- Don't modify files — this skill only reports.
