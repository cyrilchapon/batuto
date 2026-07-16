# AGENTS.md — Batutô

This file is the entry point for any coding agent working in this repo. It stays short on purpose — everything it points to is where the real content lives.

## Read this first, every session

Before doing any non-trivial work in this repo (implementing a feature, touching the data model, designing a screen, making an architectural decision), read:

**`.agents/context/README.md`**

That file is the table of contents for the whole knowledge base under `.agents/context/`. It lists every document with a one-line summary. Use it to decide what's relevant to the task at hand — don't guess from folder names alone, and don't open every document unconditionally either. A typical flow:

1. Open `.agents/context/README.md`.
2. Read the one-line summaries. Pick the documents that plausibly bear on the task.
3. Open only those. If a summary is ambiguous and the topic looks relevant, open it anyway — better to over-read a summary than to miss a constraint.
4. If the task touches domain rules (roles, readiness, event lifecycle), always check `.agents/context/domain/` even if the task looks purely technical — Batutô's whole premise is that this logic is not incidental.

Do not rely on memory of a previous session's reading of the TOC — the knowledge base changes over time (see below), and a stale mental model of it is worse than re-reading a short file.

## Language convention

- Linear issues and conversations with a human collaborator: French is fine.
- Everything else — this file, `.agents/context/**`, code, code comments, variable/entity names, technical documents (specs, Linear documents other than issues), diagrams: **English**.

## Keeping the knowledge base current

`.agents/context/` is not a write-once snapshot. It is expected to evolve alongside the codebase, and it will drift out of date if nobody tends to it. Three skills exist specifically for this:

- **`knowledge-update`** — judgment-based. Run this after finishing any significant piece of work (a new module, a resolved design question, a changed convention) to decide whether `.agents/context/` needs a new document or an update to an existing one. This is not mechanical — it requires deciding *what* changed and *whether it's worth documenting*.
- **`knowledge-toc`** — mechanical. Regenerates `.agents/context/README.md` from the frontmatter of every document under `.agents/context/`. Safe to run any time; makes no judgment calls.
- **`knowledge-lint`** — mechanical. Checks that every document has valid frontmatter and that all internal links are relative Markdown links that resolve. Safe to run any time.

**Convention:** run `knowledge-toc` then `knowledge-lint` after any change to `.agents/context/`, whether that change came from `knowledge-update` or from a manual edit. If a recurring/scheduled agent run is ever set up for this repo, `knowledge-toc` and `knowledge-lint` are the two safe candidates to automate — `knowledge-update` should stay a deliberate, human-triggered step since it makes editorial calls.

See `.agents/context/meta/conventions.md` and `.agents/context/meta/frontmatter-schema.md` for the rules these three skills enforce.

## Screen documentation

Every app screen is documented through three linked artifacts (a Linear issue, a Linear "Spec détaillée" document, and an Excalidraw wireframe attachment). Use the `screen-drafting:draft-screen`, `screen-drafting:draft-screen-markdown`, `screen-drafting:draft-screen-excalidraw`, and `screen-drafting:render-excalidraw` skills for this rather than an ad hoc approach — see `.agents/context/product/screen-doc-convention.md` for the full convention, including the reference example dataset and the Linear attachment procedure. Attaching anything to Linear requires the project/milestone UUIDs in `.agents/context/engineering/overview/linear-workspace.md` — never the slug.

Data modeling (entities, relationships, ER diagrams) uses `data-model-diagram:data-model-diagram` — see `.agents/context/product/data-modeling-convention.md` for what to feed it and where its output belongs.

**These five skills are agnostic on purpose.** They were originally written for this project, then published to public marketplaces and stripped of any Batutô/Linear-specific knowledge. All of that project-specific wiring now lives in the two `product/` documents linked above — supply it explicitly when invoking these skills, don't expect the skill to already know it.

## Skills: two categories, do not mix them up

`.agents/skills/` holds two kinds of entries — see `.agents/context/meta/skills-provenance.md` for the full rule, summarized here:

- **Self-maintained** (`knowledge-update`, `knowledge-toc`, `knowledge-lint`) — ours; edit directly when needed.
- **CLI-managed** (the five skills above) — installed via `yarn dlx skills add` and tracked in the CLI's lockfile (`skills-lock.json`). **Never hand-edit, move, or delete anything inside these folders.** If one is missing, restore it via the CLI, not by recreating it by hand. If asked to "improve" one of these skills' behavior for Batutô, the actual fix belongs in `.agents/context/product/`, never in the skill folder itself.

## Running the CLI-managed skills — one-time setup per environment

- **`screen-drafting:render-excalidraw`** needs Node dependencies installed once per machine/container (see the skill's own `SKILL.md` for the exact command — typically an `npm install` inside its installed folder). Installs `@excalidraw/utils` and `jsdom`.
- **`screen-drafting:draft-screen-excalidraw`** and **`data-model-diagram:data-model-diagram`** need only Python 3 / no extra install beyond what the CLI already sets up, per their own `SKILL.md`.
- If any of these fail for missing dependencies, run the setup step described in that skill's own `SKILL.md` — don't route around it by hand-writing equivalent logic.

## Standalone Claude Code sessions

Claude Code sessions do not carry over the conversational memory that a claude.ai chat has. That's the whole reason `.agents/context/` exists as a repo-local, self-sufficient knowledge base — treat it as the complete substitute for that memory, not a supplement to it. Concretely, in a Claude Code session:

- Read `AGENTS.md` (this file) and `.agents/context/README.md` at the start of any non-trivial task, exactly as instructed above — there is no other source of project context to fall back on.
- Linear access depends entirely on whether a Linear MCP connector is configured for that Claude Code session/project. If it isn't, say so rather than fabricating issue IDs, URLs, or Linear content — and note that `.agents/context/engineering/overview/linear-workspace.md` still gives the fixed IDs needed once a connector is available.
- Confirm the CLI-managed skills are actually present (check `skills-lock.json` against `.agents/skills/`) and their runtime dependencies (Node, Python) are available — don't assume a fresh container or CI runner already has them.

## Where things live

- `.agents/skills/` — imperative, "how to do X" instructions. A mix of self-maintained and CLI-managed entries — see "Skills: two categories" above before touching anything here.
- `.agents/context/` — declarative knowledge: domain rules, product scope, engineering conventions. Indexed by `.agents/context/README.md`.
