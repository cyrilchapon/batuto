---
title: Skills provenance — self-maintained vs. CLI-installed
summary: Entries under .agents/skills/ are either ours to edit freely, or installed by the `skills` CLI and completely off-limits — tell them apart via the CLI's lockfile before touching anything
category: meta
last_updated: 2026-07-15
related:
  - meta/conventions.md
  - product/screen-doc-convention.md
  - product/data-modeling-convention.md
---

# Skills provenance — self-maintained vs. CLI-installed

`.agents/skills/` contains two categories of entries that must never be treated the same way. Getting this distinction wrong (editing something you don't own) is the single most likely way to silently break this repo's tooling.

## Category 1 — self-maintained

Skills we wrote and own outright: currently `knowledge-update`, `knowledge-toc`, `knowledge-lint`. Ordinary rules apply — edit them directly, keep them light (imperative "how to do X" instructions, no domain knowledge duplicated), following the same spirit as `meta/conventions.md`.

## Category 2 — installed via the `skills` CLI

Some skills started as project-specific work here but were later published to public marketplaces and made **agnostic** (no built-in awareness of Batutô, Linear, or any project-specific convention). They are now installed into this repo via:

```bash
yarn dlx skills add <source>
```

(the [vercel-labs/skills](https://github.com/vercel-labs/skills) CLI). As of writing, this covers:

- `screen-drafting:draft-screen`
- `screen-drafting:draft-screen-markdown`
- `screen-drafting:draft-screen-excalidraw`
- `screen-drafting:render-excalidraw`
- `data-model-diagram:data-model-diagram`

### How to recognize a CLI-installed skill

The CLI records what it installed in a lockfile it maintains at the **monorepo root**: `skills-lock.json`. Any skill name listed under its `skills` key is CLI-managed, full stop, regardless of what its content looks like. Example shape:

```json
{
  "version": 1,
  "skills": {
    "draft-screen": {
      "source": "<marketplace-org>/<repo>",
      "sourceType": "github",
      "skillPath": "skills/draft-screen/SKILL.md",
      "computedHash": "…"
    }
  }
}
```

Before touching anything under `.agents/skills/<name>/`, check whether `<name>` is a key in `skills-lock.json` at the repo root — if it is, treat category 2 rules below as absolute.

The `computedHash` field is a hash of the installed skill's content — it's how the CLI (and, if ever needed, a manual check) detects whether a CLI-managed skill folder has drifted from what was actually installed, e.g. via an accidental hand-edit. If a skill folder's content and its `computedHash` disagree, that's a signal something touched it outside the CLI — restore it via the CLI rather than fixing the mismatch by hand.

### The rule: never touch a CLI-managed skill directory

- **Never hand-edit, move, rename, delete, or "clean up" files inside a CLI-managed skill folder.** It's regenerated/overwritten territory, exactly like `node_modules` — not a place for our own edits.
- **Never fork or duplicate a CLI-managed skill locally** to "add back" Batutô-specific behavior. That behavior was deliberately moved *out* of these skills when they were published as agnostic tools; pulling it back in locally would fight the CLI on every future update and silently diverge from the published version.
- **To update a CLI-managed skill, run the CLI's update command** (`yarn dlx skills update`, or equivalent — check the CLI's own docs for the exact invocation), never a manual edit.
- **If a CLI-managed skill is missing** from `.agents/skills/` despite being listed in the lockfile, restore it via the CLI (its `experimental_install`/restore command), don't recreate the folder by hand.

### Where Batutô-specific behavior actually lives instead

Since these skills are agnostic on purpose, all of the project-specific wiring they need — the Linear-based three-artifact convention, the reference example dataset, workspace UUIDs, the data-model source of truth — lives in `.agents/context/` and must be supplied explicitly whenever the skill is invoked:

- Screen-drafting skills → see `product/screen-doc-convention.md`.
- Data-model-diagram skill → see `product/data-modeling-convention.md`.

`knowledge-update` should treat any request to "improve" one of these skills' actual behavior as a signal to update the relevant `.agents/context/` wiring document instead — never the skill folder itself.
