import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db.js";

// Proves the Layer 1 migrations are applied and that the generated client
// round-trips them — including the composite-key band scoping, which is the
// one invariant a reviewer cannot check by reading schema.prisma alone.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const bandName = (label: string) => `Test band ${label} ${suffix}`;

// A rejection only means something here if the database produced it. A
// PrismaClientValidationError would mean the client refused the shape before
// the query ever ran, which proves nothing about the constraints under test.
const expectRejectedByDatabase = async (query: Promise<unknown>) => {
  const error = await query.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).name).not.toBe("PrismaClientValidationError");
};

type Fixture = {
  bandId: string;
  pupitreId: string;
  conductorId: string;
  musicianId: string;
};

const createMember = (label: string, bandId: string) =>
  db.membership.create({
    data: {
      band: { connect: { id: bandId } },
      user: {
        create: {
          clerkUserId: `user_${label}_${suffix}`,
          name: label,
          email: `${label}@${suffix}.test`,
        },
      },
    },
  });

const setUpBand = async (label: string, pupitreName: string): Promise<Fixture> => {
  const band = await db.band.create({
    data: {
      name: bandName(label),
      decisionRuleTemplateType: "hierarchical",
      pupitres: { create: { name: pupitreName } },
      inviteCodes: { create: { code: `invite-${label}-${suffix}` } },
    },
    include: { pupitres: true, inviteCodes: true },
  });

  const pupitre = band.pupitres.at(0);
  if (!pupitre) {
    throw new Error("expected the nested pupitre create to have returned a row");
  }
  expect(band.inviteCodes).toHaveLength(1);

  const conductor = await createMember(`conductor-${label}`, band.id);
  const musician = await createMember(`musician-${label}`, band.id);

  return {
    bandId: band.id,
    pupitreId: pupitre.id,
    conductorId: conductor.id,
    musicianId: musician.id,
  };
};

let a: Fixture;
let b: Fixture;

describe("Layer 1 schema", () => {
  beforeAll(async () => {
    a = await setUpBand("a", "surdo");
    b = await setUpBand("b", "caixa");
  });

  afterAll(async () => {
    // Memberships, pupitres and instruments all cascade from these two.
    await db.band.deleteMany({ where: { name: { in: [bandName("a"), bandName("b")] } } });
    await db.user.deleteMany({ where: { email: { endsWith: `${suffix}.test` } } });
    await db.$disconnect();
  });

  it("round-trips a declared instrument and the member who validated it", async () => {
    const instrument = await db.memberInstrument.create({
      data: {
        tier: "debutant",
        validated: true,
        validatedAt: new Date(),
        membership: { connect: { id: a.musicianId } },
        pupitre: { connect: { id: a.pupitreId } },
        validatedBy: { connect: { id: a.conductorId } },
      },
      include: { pupitre: true, validatedBy: true },
    });

    expect(instrument.bandId).toBe(a.bandId);
    expect(instrument.tier).toBe("debutant");
    expect(instrument.pupitre.name).toBe("surdo");
    expect(instrument.validatedBy?.id).toBe(a.conductorId);
  });

  it("keeps a validated instrument, minus its validator, when the validator leaves", async () => {
    const leaver = await createMember("leaver-a", a.bandId);
    const instrument = await db.memberInstrument.create({
      data: {
        tier: "autonome",
        validated: true,
        membership: { connect: { id: a.conductorId } },
        pupitre: { connect: { id: a.pupitreId } },
        validatedBy: { connect: { id: leaver.id } },
      },
    });

    await db.membership.delete({ where: { id: leaver.id } });

    const kept = await db.memberInstrument.findUniqueOrThrow({ where: { id: instrument.id } });
    expect(kept.validated).toBe(true);
    expect(kept.validatedById).toBeNull();
    expect(kept.validatorBandId).toBeNull();
  });

  it("scopes a pupitre name to its own band", async () => {
    // Band a already has a "surdo"; a second one in the same band is a duplicate.
    await expectRejectedByDatabase(
      db.pupitre.create({ data: { bandId: a.bandId, name: "surdo" } }),
    );

    // The same name in another band is fine — pupitres are a per-band catalog.
    const elsewhere = await db.pupitre.create({ data: { bandId: b.bandId, name: "surdo" } });
    expect(elsewhere.bandId).toBe(b.bandId);
  });

  describe("band scoping is enforced by the database, not just by callers", () => {
    it("rejects an instrument pairing a membership with another band's pupitre", async () => {
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            membership: { connect: { id: a.musicianId } },
            pupitre: { connect: { id: b.pupitreId } },
          },
        }),
      );
    });

    it("rejects an instrument pairing a pupitre with another band's membership", async () => {
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            membership: { connect: { id: b.musicianId } },
            pupitre: { connect: { id: a.pupitreId } },
          },
        }),
      );
    });

    it("rejects a validator from another band", async () => {
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            validated: true,
            membership: { connect: { id: a.musicianId } },
            pupitre: { connect: { id: a.pupitreId } },
            validatedBy: { connect: { id: b.conductorId } },
          },
        }),
      );
    });
  });
});
