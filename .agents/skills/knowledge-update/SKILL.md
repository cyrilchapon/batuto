---
name: knowledge-update
description: Decide whether recent work should update .agents/context/, and make the edit. Use after finishing any significant piece of work — a new module, a resolved design question, a changed convention, a scope change — or whenever explicitly asked to "update the knowledge base."
---

# knowledge-update

Judgment-based. This skill decides *what* changed and *whether it's worth documenting* — unlike `knowledge-toc` and `knowledge-lint`, which are purely mechanical and make no editorial calls.

## When to run this

- Right after finishing a significant change: a new module, a resolved design question, a changed convention, a scope adjustment.
- Whenever asked to "update the knowledge base" or equivalent.
- Not after every commit — trivial changes (typo fixes, small refactors that don't change behavior or decisions) don't warrant a pass.

## Procedure

1. **Read `.agents/context/README.md`** to see what's already documented.
2. **Identify what changed** since the relevant documents were last written — compare against `last_updated` in frontmatter, and against the actual code/decision/conversation that just happened.
3. **Classify the change:**
   - New domain knowledge (a band-behavior rule, a lifecycle detail) → `domain/`.
   - A scope decision (in/out, parked-with-trigger) → `product/scope.md`.
   - A new stable technical fact (stack, layout, convention, infra) → `engineering/overview/`.
   - A new code area worth its own doc → `engineering/modules/`.
   - None of the above (session-only detail, already captured in a Linear issue, or genuinely too minor) → don't add anything. Not every change needs a document.
4. **Decide: new document, or edit an existing one?** Prefer editing an existing document if the change refines or resolves something already described there (e.g. moving an item from "Still open" to resolved). Only create a new file when the topic doesn't fit any existing document's scope — check `meta/conventions.md` for folder boundaries first.
5. **Write the change**, following `meta/frontmatter-schema.md` (bump `last_updated`) and `meta/conventions.md` (relative links, folder boundaries, document shape).
6. **Run `knowledge-toc`** to regenerate `README.md`, then **`knowledge-lint`** to check the result. Fix anything it flags before finishing.

## What not to do

- Don't duplicate content that already lives canonically in Linear or another `.agents/context` file — link to it instead (see `meta/conventions.md`, "Source of truth discipline").
- Don't silently drop "Still open" or "Maybe-later" sections when updating a document — resolve them explicitly (move the item to the resolved part of the doc with a note) or leave them as-is; don't just delete an open question because it's inconvenient.
- Don't skip `knowledge-toc`/`knowledge-lint` after an edit — an unindexed or broken-linked document is worse than no document.
- **Never treat "improve this skill's behavior" as an instruction to edit a CLI-managed skill folder under `.agents/skills/`** (see `meta/skills-provenance.md` for how to recognize one). If the request is really about Batutô-specific behavior, the fix belongs in the relevant `.agents/context/product/` wiring document (e.g. `screen-doc-convention.md`, `data-modeling-convention.md`), not in the skill itself.
