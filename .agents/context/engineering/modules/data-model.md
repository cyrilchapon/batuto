---
title: Data model implementation (packages/db)
summary: How the Linear data-model document is translated into Prisma — naming, uuid(7) ids, where constraints live, and what the schema deliberately does not enforce
category: engineering
last_updated: 2026-09-20
related:
  - product/data-modeling-convention.md
  - engineering/modules/database-migrations.md
  - domain/multi-band.md
  - domain/role-hierarchy.md
  - domain/readiness-rules.md
  - engineering/overview/quality-gates.md
  - engineering/overview/infra-and-envs.md
---

# Data model implementation (`packages/db`)

The canonical description of *what* is modeled lives in the Linear project document ["Data model — v0 CORE (Layer 1 + Layer 2)"](https://linear.app/cyc-personal/document/data-model-v0-core-layer-1-layer-2-9f90bb8097c7), and the process for evolving it is [data-modeling-convention.md](../../product/data-modeling-convention.md). This document covers only the other half: how that model is expressed in `packages/db/prisma/schema.prisma`, and which invariants the database does and does not enforce.

Layer 1 (`User`, `Band`, `Membership`, `GroupRole`, `Pupitre`, `MemberInstrument`, `InviteCode`) landed with [BAT-38](https://linear.app/cyc-personal/issue/BAT-38/data-model-layer-1-identity-bands-memberships-pupitres) as the repo's first real schema, across three migrations on top of the `HelloWorld` bootstrap placeholder. How migrations themselves are written and validated is [database-migrations.md](database-migrations.md).

## Schema conventions

These were settled while translating Layer 1 and apply to every subsequent layer:

- **Prisma-default naming, no `@map`/`@@map`.** PascalCase models, camelCase fields, and the resulting PascalCase/camelCase table and column names in Postgres. The Linear document's ER diagrams use `snake_case` — that is diagram notation, not a mapping instruction.
- **`String @id @default(uuid(7))` for every primary key.** The document specifies UUIDs; v7 is used over v4 for index locality, since every one of these tables is written in roughly chronological order.
- **`createdAt` / `updatedAt` on every model**, uniformly, including the effectively-immutable ones (`GroupRole`, `InviteCode`) — uniform beats per-model judgment here.
- **Enum values are copied verbatim from the document** (`hierarchical`, `non_autonome`, …) rather than re-cased to a Prisma house style, so the schema and the spec can be diffed by eye.
- **No `@default` on `Band.decisionRuleTemplateType`.** Picking one would hardcode one band's behavior as "the" behavior, which [readiness-rules.md](../../domain/readiness-rules.md) rules out explicitly. The value is chosen at band creation.
- **`onDelete: Cascade` down the band-scoped chain**, with one exception: `MemberInstrument.validatedBy` is `SetNull`, since losing the validator's membership must not delete the validated instrument.

## Constraints the ER diagram can't express

An ER diagram carries entities and relations; uniqueness and indexing are implementation decisions made here. Layer 1 adds:

- `User.clerkUserId` and `User.email` unique. Clerk owns identity and enforces both upstream (see [auth.md](auth.md)); the database constraint is there to catch a sync bug rather than to define the rule.
- One `Membership` per `(userId, bandId)`, one `Pupitre` per `(bandId, name)`, one `MemberInstrument` per `(membershipId, pupitreId)`.
- One `GroupRole` per `(membershipId, type)` — this bounds *duplication*, not cardinality. A band may still have zero, one, or several conductors, which [role-hierarchy.md](../../domain/role-hierarchy.md) requires.
- Indexes on the band-scoped foreign keys that get queried directly (`Membership.bandId`, `InviteCode.bandId`, `MemberInstrument.pupitreId` / `validatedById`).

## Band scoping is enforced by the database

Nothing may pair a `Membership` in band A with a `Pupitre` — or a validator — in band B. That is enforced, not merely expected of callers: every foreign key out of `MemberInstrument` is composite, pointing at `(id, bandId)` on `Membership` and `Pupitre` (each of which carries an `@@unique([id, bandId])` for that purpose).

Making that work with Prisma costs three band columns on `MemberInstrument` — `bandId`, `pupitreBandId`, `validatorBandId` — one per composite foreign key, because of two hard limits worth knowing before modelling Layer 2 the same way:

- **Prisma cannot write a relation scalar shared by two relations.** Point both the `membership` and `pupitre` relations at one `bandId` and the schema still validates, the client still typechecks, and every insert then fails at runtime with a null-constraint violation on that column — the query engine treats a shared scalar as unwritable, both through nested `connect` and through the unchecked all-scalars form. Each composite foreign key needs its own column.
- **Prisma cannot `SET NULL` a column a non-nullable relation also uses.** `validatedBy` has to be clearable when a validator's membership is deleted (losing the validator must not delete the validated instrument), which rules out reusing the required `bandId` for it.

What ties those columns back together is two CHECK constraints (`pupitreBandId = bandId`, and `validatorBandId` null-or-equal to `bandId`). Prisma has no syntax for CHECK constraints, so they are hand-written at the end of `20260920071200_pupitres_and_member_instruments/migration.sql`. `prisma migrate diff` neither generates nor notices them, so `check:schema` stays green with or without them — which is exactly why they need carrying forward by hand if that table is ever rebuilt, and why `apps/api/src/db.test.ts` tries to violate all of it.

## What the schema deliberately does not enforce

- **Section leader has no role in the model at all.** `GroupRole` is `conductor | relay`, and that is correct: those are *group* roles, held across the band, whereas a section leader (*référent*) leads one pupitre and so is a pupitre-scoped role — a different shape that `GroupRole` has nowhere to put. It is not modeled anywhere yet, and [BAT-45](https://linear.app/cyc-personal/issue/BAT-45/section-leader-selection-step-available-selected) already assumes it exists ("scoped to the sections the current member leads"). It belongs in v0 CORE; it is not in BAT-38's scope, and no other v0 ticket currently covers it.

## The bootstrap placeholder was removed forward, not erased

BAT-38 dropped `HelloWorld` with a migration that drops the table, leaving `20260716145002_init` exactly as it was. Rewriting history would have been tempting — no environment holds data worth keeping yet, and it would have left one clean initial migration — but it breaks every database that already recorded the deleted migration, and the discipline is worth more than the tidiness. See [database-migrations.md](database-migrations.md) for the rule and for what "append-only" costs and buys.

## Verifying a schema change

`check:schema` and `check:migrations` are the two gates, both run in CI against ephemeral Neon branches — see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md). Locally, `check:schema` only needs a `SHADOW_DATABASE_URL` pointing at a structurally empty database; it replays the whole migration directory into it and diffs the result against `schema.prisma`.

`apps/api/src/db.test.ts` complements those: a round trip through the real generated client (band → membership → member instrument → pupitre, plus both of `MemberInstrument`'s relations to `Membership`), followed by four writes that *should* be refused — a membership paired with another band's pupitre, a pupitre paired with another band's membership, a foreign validator, and a duplicate pupitre name. It replaces the placeholder round trip the `hello` handler used to do, and it is the reason `apps/api` still depends on `@batuto/db` before the first real API procedures land.

Run it through turbo (`yarn turbo run test`), not `yarn workspace @batuto/api test`: `apps/api` imports `@batuto/db`'s built `dist/`, so a direct invocation happily tests a stale client against a freshly migrated database and reports failures that do not exist.
