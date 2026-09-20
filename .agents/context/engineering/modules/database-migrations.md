---
title: Database migration doctrine
summary: Migrations are append-only and small — one logical change per migration, generated from the schema rather than hand-written, and validated against a real database before pushing
category: engineering
last_updated: 2026-09-20
related:
  - engineering/modules/data-model.md
  - engineering/overview/quality-gates.md
  - engineering/overview/infra-and-envs.md
---

# Database migration doctrine

How `packages/db/prisma/migrations` is allowed to change. [data-model.md](data-model.md) covers *what* is modeled; this covers the mechanics of getting a change into the database safely. These rules apply from the first real migration onward — there is no "it's early, nobody has data yet" exception, because the point of the discipline is that it never has to be switched on.

## Append-only. Always.

**Never edit, rename, reorder or delete a migration that has been pushed.** A migration directory is an immutable record of something that has already run somewhere. Changing one means every database that recorded it — a teammate's laptop, the shared dev branch, CI's clone, production — either fails its next `prisma migrate deploy` outright (the applied migration is no longer in the directory) or silently diverges (the checksum no longer matches what was applied).

To undo something a pushed migration did, **write a new migration that undoes it**. That is true even for a placeholder: BAT-38 removed the `HelloWorld` bootstrap model with a migration that drops the table, keeping `20260716145002_init` untouched, rather than deleting the init migration and starting over. Verified against a database holding only the original init: the new migrations apply on top with no reset.

The only edit a pushed migration ever legitimately receives is none. If a migration is wrong, the fix is forward.

**Where the line actually falls:** a migration becomes immutable once it has reached somewhere that records having applied it — `dev`, any deployed environment, or a colleague's database. On an unmerged feature branch that nothing has deployed, a migration is still a draft: regenerate or rewrite it freely while the shape is still under review, and rebase the branch rather than stacking a corrective migration onto a design nobody has run. Pushing a branch is not what freezes it; merging it, or anyone applying it, is.

## One logical change per migration

Prefer several small migrations over one large one, generated **incrementally**: change a coherent slice of `schema.prisma`, generate the migration for that slice, then move on to the next slice. Layer 1 landed as three migrations — drop the placeholder, then identity/bands/memberships/invite codes, then pupitres and member instruments — rather than one 150-line create.

A "logical change" is one thing a reviewer can hold in their head and one thing that can fail on its own: a table and its indexes, a column plus its backfill, a constraint. Not "everything this ticket touches". Resist the opposite extreme too — splitting a table away from the index that makes it usable buys nothing and produces a migration that is meaningless in isolation.

This matters most when something goes wrong in a deployed environment: `prisma migrate deploy` stops at the first failing migration and leaves the earlier ones applied. Small migrations mean the failure point is unambiguous and the recovery is a single forward fix.

## Generate migrations, don't hand-write them

Edit `schema.prisma`, then let Prisma produce the SQL:

- **Locally, with a database:** `yarn workspace @batuto/db migrate:dev`, which generates and applies in one step.
- **Without a database to migrate against** (a CI runner, a container, a review session): `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, pointed at an empty `SHADOW_DATABASE_URL`. This produces exactly what `migrate:dev` would, without touching a real database.

Then **read the generated SQL before committing it**. Generation is not review: Prisma will happily generate a column drop, a table rewrite, or a `NOT NULL` addition with no default that cannot succeed against existing rows.

Hand-written SQL is for the things Prisma has no syntax for — CHECK constraints, triggers, partial indexes, data backfills, and the odd SQL feature Prisma's emitter predates. This is Prisma's own prescribed path, not a hack around it: [Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations) says to generate with `prisma migrate dev --create-only`, edit, then apply (the `migrate diff --script` route above is its no-database equivalent). Edit the generated file rather than writing a whole migration by hand, and **comment why, in the migration itself**, because `prisma migrate diff` cannot see the difference: `check:schema` stays green whether the hand-written part is there or not, so nothing mechanical will tell you when a regeneration quietly drops it. Pair every such edit with a test that fails if it disappears.

`20260920071200_pupitres_and_member_instruments/migration.sql` is the worked example: Prisma emits a bare `ON DELETE SET NULL` for a composite foreign key whose band column is required, which would fail at runtime; the migration hand-writes Postgres 15+'s column-list form (`ON DELETE SET NULL ("validatedById")`) so only the nullable column is cleared.

## Write migrations that can run against real rows

An empty database is the easy case. Every migration has to survive a table that already has data in it:

- Adding a `NOT NULL` column needs a default, or a three-step sequence (add nullable → backfill → enforce).
- Renaming is a destructive drop-and-create unless expressed as add → backfill → drop, across separate migrations and usually separate deploys.
- A newly added `UNIQUE` constraint fails on existing duplicates. Know whether duplicates exist before adding it.

`check:migrations` in CI exists precisely for this: it deploys against an ephemeral clone of the *data-bearing* shared dev branch, not an empty database. A migration that passes `check:schema` and fails `check:migrations` is a migration that would have broken a real environment.

## Verify before pushing

Both database gates run in CI (see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md)), and both can be run locally first:

- **`check:schema`** — replays the whole migration directory into an empty shadow database and diffs the result against `schema.prisma`. Catches the classic mistake: editing the schema and forgetting the migration, or vice versa. Needs only an empty `SHADOW_DATABASE_URL`.
- **`check:migrations`** — `migrate deploy` against a real clone. Catches what an empty database cannot.

Beyond the gates, exercise anything the schema cannot state. Composite keys, CHECK constraints and cascade behaviour are only claims until a test tries to violate them — `apps/api/src/db.test.ts` does exactly that for Layer 1's band scoping, and a negative test there asserts that the *database* rejected the write, not that Prisma refused to build the query.

## Naming

`YYYYMMDDHHMMSS_snake_case_description`, which is what Prisma generates. Name it after the change, not the ticket: `drop_hello_world_placeholder`, not `bat_38_part_1`. The timestamp prefix is the ordering — never renumber it to "tidy up" a sequence.
