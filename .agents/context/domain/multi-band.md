---
title: Multi-band support
summary: Every core entity is band-scoped from the first migration, even though a single band uses the app at launch
category: domain
last_updated: 2026-07-15
related:
  - domain/role-hierarchy.md
  - domain/readiness-rules.md
---

# Multi-band support

Batutô's originating non-profit already runs more than one ensemble, and the app is built for any music group, of any genre, running any number of ensembles — not retrofitted for it later. This is Core, not an optional flag.

## What this means structurally

Every core entity carries a `band_id` from the very first migration, even though only one band (the originating Batucada group) actually uses the app at launch. Retrofitting band-scoping after the fact was identified early as the single most expensive mistake to make in this project — every subsequent modeling decision assumes it's already there.

Concretely, at the v0 data-model layer: `Membership` is the explicit `User` × `Band` pivot, and everything band-scoped (`GroupRole`, `MemberInstrument`, `Pupitre`) hangs off `Membership`, never directly off `User`. A `Pupitre` (section) is a per-band catalog, not a global enum — section names are band-specific (e.g. *surdo*, *caixa*, *repique* for a batucada), since different genres of band will have entirely different section vocabularies.

## What stays band-scoped vs. what's global

- Band-scoped: role hierarchy, readiness/decision-mode configuration, sections (*pupitres*), events, availability, membership itself.
- Global (cross-band): a single user (`User`/`Member`) can belong to multiple bands simultaneously, each with independent roles, sections, and tiers. A member's profile view is explicitly cross-band — see the "Profil" screen, which shows roles/sections/tiers per band, read-only, sourced from each band's own management screen.

## First real stress test

Multi-band is only lightly exercised at v0 (one band actually onboarded). The v1 milestone treats a second band onboarding as the first real chance to check whether this scoping holds up under a second real user base — worth testing deliberately even if no second band organically signs up during that window.
