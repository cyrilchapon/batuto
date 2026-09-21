---
title: Data model implementation (packages/db)
summary: How the Linear data-model document is translated into Prisma — naming, uuid(7) ids, where constraints live, and what the schema deliberately does not enforce
category: engineering
last_updated: 2026-09-20
related:
  - engineering/overview/conventions.md
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

Nothing may pair a `Membership` in band A with a `Pupitre` — or a validator — in band B. That is enforced, not merely expected of callers. `Membership` and `Pupitre` each carry an `@@unique([id, bandId])`, and all three foreign keys out of `MemberInstrument` are composite, routing through a single denormalised `bandId` column on that table:

```prisma
membership  Membership  @relation("MemberInstrumentMember", fields: [membershipId, bandId], references: [id, bandId], onDelete: Cascade)
pupitre     Pupitre     @relation(fields: [pupitreId, bandId], references: [id, bandId], onDelete: Cascade)
validatedBy Membership? @relation("MemberInstrumentValidator", fields: [validatedById, bandId], references: [id, bandId], onDelete: SetNull)
```

The redundant column is the point, not a concession, and the reasoning generalises well beyond bands — it is written up as a standing principle in [conventions.md](../overview/conventions.md#scoping-keys-travel-through-relations--integrity-over-normalization). Expect to do the same in Layer 2, where `AvailabilityResponse` and `PupitreAssignment` each reference an event, a membership and a pupitre that must all agree on their band.

An optional composite foreign key behaves correctly without extra machinery: Postgres's default `MATCH SIMPLE` skips the check entirely when any of its columns is NULL, so `validatedById IS NULL` means "no validator", not a violation.

### The one thing Prisma can't emit

`prisma validate` warns that `SetNull` is questionable when a referenced field is required, and it is right: the SQL Prisma generates is a bare `ON DELETE SET NULL`, which would try to clear `bandId` too and fail against its `NOT NULL`. Postgres 15+ accepts a column list, so `20260920071200_pupitres_and_member_instruments/migration.sql` hand-writes:

```sql
ON DELETE SET NULL ("validatedById")
```

Only the validator is cleared when their membership is deleted; the instrument and its band survive. `check:schema` stays green — `migrate diff` does not distinguish the column list from a bare `SET NULL` — which cuts both ways: regenerating that migration would silently drop the column list and nothing mechanical would object. The "keeps a validated instrument, minus its validator" case in `apps/api/src/db.test.ts` is what actually catches it.

Hand-editing is not a workaround around Prisma so much as the path Prisma itself prescribes for anything its schema language cannot express (`prisma migrate dev --create-only`, then edit, then apply — see [Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)). This was checked rather than assumed, in September 2026 against Prisma 7.8:

- [#8264](https://github.com/prisma/prisma/issues/8264) (open since July 2021) — `SetNull` on a composite key nulls every column, including one that is required. Exactly this case.
- [#8403](https://github.com/prisma/prisma/issues/8403) (open since July 2021) — the same thing on the client side, for `disconnect`. See the gotcha below.
- [#16439](https://github.com/prisma/prisma/issues/16439) (closed, 4.7.0) — all that changed is that PostgreSQL now *warns* instead of refusing the schema. It lets you declare the intent; it does not emit the right SQL.
- [#3388](https://github.com/prisma/prisma/issues/3388) (open since December 2019) — CHECK constraints, same story, labelled "has-stopgap".

**No plugin fixes this, and it isn't for lack of looking.** Prisma's two extension points — client extensions and generators — act on queries and on generated artifacts; neither can touch the SQL Prisma Migrate emits, so a third-party package has nowhere to hook in. ZenStack, the main community layer over Prisma, inherits the limitation and prescribes the same hand-edit. Verified directly against Prisma 7.8: `@@check` is rejected (`Attribute not known`), and there is no per-column argument on `onDelete` (`No such argument`).

### Gotcha: clear a validator through the scalar, never `disconnect`

`validatedBy: { disconnect: true }` throws a null-constraint violation, because Prisma nulls every column of the composite relation — `bandId` included. That is [#8403](https://github.com/prisma/prisma/issues/8403), reproduced on this schema. The supported way to un-validate an instrument is the scalar:

```ts
db.memberInstrument.update({
  where: { id },
  data: { validated: false, validatedById: null, validatedAt: null },
});
```

`bandId` is left alone and the write succeeds. Worth knowing before [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api) implements validation withdrawal; `db.test.ts` locks the supported path in.

## What the schema deliberately does not enforce

- **Self-validation.** Nothing stops `MemberInstrument.validatedById` from equalling its own `membershipId` — the composite key constrains the validator to the same *band*, and no CHECK compares the two columns (verified against a live database). A member can therefore sign off their own declaration, which defeats the point of the field: it exists to record that someone with authority validated it (see [role-hierarchy.md](../../domain/role-hierarchy.md)). Whoever writes the [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api) handler has to check it there. Moving it into the database is one hand-written `CHECK`, and worth doing once one domain question is settled: in a band whose only conductor also plays, a blanket ban leaves that member's own instrument permanently unvalidatable.

- **Section leader has no role in the model at all.** `GroupRole` is `conductor | relay`, and that is correct: those are *group* roles, held across the band, whereas a section leader (*référent*) leads one pupitre and so is a pupitre-scoped role — a different shape that `GroupRole` has nowhere to put. Not modeled yet, and [BAT-45](https://linear.app/cyc-personal/issue/BAT-45/section-leader-selection-step-available-selected) already assumes it exists ("scoped to the sections the current member leads"). Tracked as [BAT-47](https://linear.app/cyc-personal/issue/BAT-47/data-model-role-de-pupitre-chef-de-pupitre-referent) in v0 CORE, blocking BAT-45.

## The bootstrap placeholder was removed forward, not erased

BAT-38 dropped `HelloWorld` with a migration that drops the table, leaving `20260716145002_init` exactly as it was. Rewriting history would have been tempting — no environment holds data worth keeping yet, and it would have left one clean initial migration — but it breaks every database that already recorded the deleted migration, and the discipline is worth more than the tidiness. See [database-migrations.md](database-migrations.md) for the rule and for what "append-only" costs and buys.

## Verifying a schema change

`check:schema` and `check:migrations` are the two gates, both run in CI against ephemeral Neon branches — see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md). Locally, `check:schema` only needs a `SHADOW_DATABASE_URL` pointing at a structurally empty database; it replays the whole migration directory into it and diffs the result against `schema.prisma`.

`apps/api/src/db.test.ts` complements those: a round trip through the real generated client (band → membership → member instrument → pupitre, plus both of `MemberInstrument`'s relations to `Membership`), followed by writes that *should* be refused — a membership paired with another band's pupitre, a pupitre paired with another band's membership, a foreign validator, and a duplicate pupitre name. It replaces the placeholder round trip the `hello` handler used to do, and it is the reason `apps/api` still depends on `@batuto/db` before the first real API procedures land.

Run it through turbo (`yarn turbo run test`), not `yarn workspace @batuto/api test`: `apps/api` imports `@batuto/db`'s built `dist/`, so a direct invocation happily tests a stale client against a freshly migrated database and reports failures that do not exist.
