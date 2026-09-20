---
title: Data model implementation (packages/db)
summary: How the Linear data-model document is translated into Prisma — naming, uuid(7) ids, where constraints live, and what the schema deliberately does not enforce
category: engineering
last_updated: 2026-09-20
related:
  - product/data-modeling-convention.md
  - domain/multi-band.md
  - domain/role-hierarchy.md
  - domain/readiness-rules.md
  - engineering/overview/quality-gates.md
  - engineering/overview/infra-and-envs.md
---

# Data model implementation (`packages/db`)

The canonical description of *what* is modeled lives in the Linear project document ["Data model — v0 CORE (Layer 1 + Layer 2)"](https://linear.app/cyc-personal/document/data-model-v0-core-layer-1-layer-2-9f90bb8097c7), and the process for evolving it is [data-modeling-convention.md](../../product/data-modeling-convention.md). This document covers only the other half: how that model is expressed in `packages/db/prisma/schema.prisma`, and which invariants the database does and does not enforce.

Layer 1 (`User`, `Band`, `Membership`, `GroupRole`, `Pupitre`, `MemberInstrument`, `InviteCode`) landed with [BAT-38](https://linear.app/cyc-personal/issue/BAT-38/data-model-layer-1-identity-bands-memberships-pupitres) as the repo's first real migration, replacing the `HelloWorld` placeholder and its `20260716145002_init` migration.

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

## What the schema deliberately does not enforce

Both of these are real holes, left open on purpose rather than by oversight:

- **Cross-band referential integrity.** Nothing at the database level stops a `MemberInstrument` from joining a `Membership` in band A to a `Pupitre` in band B, or from naming a validator who belongs to a different band. Enforcing it would mean denormalizing `bandId` onto the child tables and using composite foreign keys throughout. For now it is the API layer's job — and it is the kind of check the Band/membership API ([BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api)) has to get right.
- **Section leader has no `GroupRole` type.** The document's `GroupRole` enum is `conductor | relay` only, while [role-hierarchy.md](../../domain/role-hierarchy.md) describes a section leader (*référent*) as a real role — one that leads and validates within *one* pupitre. `GroupRole` as modeled hangs off `Membership` alone and has nowhere to put that pupitre reference, which is very likely why the document omits it. Raised on BAT-38 rather than designed unilaterally; resolving it means either a `pupitreId` on `GroupRole` or a separate model, and that is a data-model decision, not an implementation one.

## Migration history is rewritten, not appended, when a placeholder goes

BAT-38 deleted `20260716145002_init` instead of adding a migration that drops `HelloWorld`. That is safe precisely because no environment yet holds data worth keeping, and it leaves a single clean initial migration — but it has a consequence worth knowing: **any database that already recorded the deleted migration in `_prisma_migrations` will fail `prisma migrate deploy`**, because the applied migration no longer exists locally. A local dev database in that state needs `prisma migrate reset` once (see [infra-and-envs.md](../overview/infra-and-envs.md) for how local databases are provisioned).

This is a one-off licence tied to the bootstrap placeholder. Once real data exists anywhere, migration history is append-only.

## Verifying a schema change

`check:schema` and `check:migrations` are the two gates, both run in CI against ephemeral Neon branches — see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md). Locally, `check:schema` only needs a `SHADOW_DATABASE_URL` pointing at a structurally empty database; it replays the whole migration directory into it and diffs the result against `schema.prisma`.

`apps/api/src/db.test.ts` complements those: a round trip through the real generated client (band → membership → member instrument → pupitre, plus both of `MemberInstrument`'s relations to `Membership`) that fails if a migration and the client have drifted apart. It replaces the placeholder round trip the `hello` handler used to do, and it is the reason `apps/api` still depends on `@batuto/db` before the first real API procedures land.
