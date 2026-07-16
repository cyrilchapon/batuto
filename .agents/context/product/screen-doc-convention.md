---
title: Screen documentation convention
summary: Every screen is documented as a linked trio — Linear issue, native "Spec détaillée" document, and Excalidraw wireframe — via dedicated, now-agnostic skills
category: product
last_updated: 2026-07-15
related:
  - meta/skills-provenance.md
  - engineering/overview/linear-workspace.md
---

# Screen documentation convention

Every screen in Batutô rests on three systematically linked artifacts, not one. This convention exists so a screen's design is legible to both a human and a coding agent without re-deriving intent from a wireframe alone.

## The three artifacts

1. **A Linear issue** (project "Batutô App", correct milestone). Its description already contains the essentials: objective, entities, actions, relations to other screens.
2. **A native Linear document titled "Spec détaillée"**, attached to the issue — structured Markdown, written to be read by an agent, not only a human. Sections: Objectif, Entités et champs impliqués (succinct — enough to extrapolate a data model later, not a full schema), États et cycle de vie, Actions, Relations avec les autres écrans, Points ouverts / à trancher, Note de fidélité.
3. **An attachment titled "Mise en situation (Excalidraw)"** — a precise, contextualized wireframe (realistic content, never lorem ipsum), representing by default the screen's most complete/complex case. Neutral, not visually fixed palette; semantic tones only for state (success/warning/danger/info).

**Always use a native Linear document for the spec** — never a raw `.md` attachment — since it's far easier to browse directly inside Linear.

## Fidelity level — read carefully

These wireframes and descriptions are deliberately low-fidelity. They fix structure, content, and relations — never colors, sizes, or margins. Anything that reads like a color in a description (e.g. "danger," "highlight") is a semantic state, never a fixed design value. The goal is to ground a first data model and the agents that will build the actual components — not to serve as a visual spec.

## Reference example dataset — reuse across screens

To keep wireframes consistent with each other (same people, same band, same event recurring across screens rather than a new invented cast each time), reuse this dataset when populating a wireframe with realistic content:

- Band: **Batucada Lyon Nord**
- Members: **Cyril Chapon** (section leader on Surdo, autonomous on Repique) · **Manon Leroux** (conductor, autonomous on Repique) · **Théo Blanc** (beginner on Surdo) · **Léa Faure** (non-autonomous on Repique) · **Sofia Dumas** (relay)
- Event: **Défilé de la Fête des Lumières** (gig, status: Collecting)
- Second band (for multi-band screens): **Samba do Coração**

## Attachment upload procedure

To attach the Excalidraw wireframe to its Linear issue, prefer the modern flow over the deprecated base64 fallback:

1. `Linear:prepare_attachment_upload` (issue, filename, contentType, size) — returns a signed upload URL.
2. PUT the raw file bytes directly to that URL within 60 seconds (e.g. `curl --data-binary @file`). This requires `storage.googleapis.com` to be reachable from the current environment.
3. `Linear:create_attachment_from_upload` to finalize and link it to the issue.

The deprecated base64 method (`Linear:create_attachment`) works but is slow and produces a large text blob per file — use only as a last resort if `storage.googleapis.com` isn't reachable.

## Approaches already tried and rejected

Documented so they aren't retried:

1. **PNG export** — rejected: loses structure (no DOM/CSS, no selectable text), too fixed for a principle-stage artifact.
2. **Excalidraw wireframe made of abstract, labeled zones** (e.g. rectangles labeled "Zone: header", "Zone: section composition") — rejected: too textual, doesn't give real spatial intuition, doesn't read as an actual situated screen.
3. **Current convention** (see above): a situated Excalidraw scene with realistic example content and semantic-only colors, paired with a separate Markdown doc for precision.

## Which skills to use

These skills are installed via the `skills` CLI and are **agnostic** — published as generic tools with no built-in knowledge of Linear, Batutô, or this convention (see `meta/skills-provenance.md`). Everything above and below on this page — the artifact trio, the fidelity level, the reference dataset, the attachment procedure — is exactly the context that must be supplied explicitly when invoking them; the skills themselves won't infer any of it.

- **`screen-drafting:draft-screen-markdown`** — generates/updates the spec Markdown, following the template above.
- **`screen-drafting:draft-screen-excalidraw`** — generates/updates the wireframe(s), via a Python library (`excalidraw_builder.py`) providing reusable UI primitives (buttons, badges, lists, bottom nav, etc.) rather than hand-written JSON.
- **`screen-drafting:render-excalidraw`** — renders an `.excalidraw` file to a standalone, static `.svg` (real Excalidraw engine, server-side, zero CDN dependency at render time).
- **`screen-drafting:draft-screen`** — orchestrates all three to produce the full package for a screen (.md + .excalidraw(s) + .svg(s)) in one pass.

Whenever a screen is being created, regenerated, or updated, use these skills rather than an ad hoc approach.

## How screens currently relate (v0)

The five v0 screens and their relations are documented in the Linear project document ["Écrans v0 — vue d'ensemble et relations"](https://linear.app/cyc-personal/document/ecrans-v0-vue-densemble-et-relations-ae2e93694ad1) — treat that document as the canonical, evolving source for screen relationships; this file only documents the *convention* for producing screens, not the current state of any specific one.
