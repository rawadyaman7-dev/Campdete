import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Edit this list before camp: team names, PINs, and marker colors.
const TEAMS = [
  { name: "Loup", pin: "7392", color: "#dc2626" }, // red and black
  { name: "Lynx", pin: "4816", color: "#f97316" }, // orange and black
  { name: "Milan", pin: "2957", color: "#16a34a" }, // green and black
  { name: "Beluga", pin: "6104", color: "#6b7280" }, // white/grey and black
  { name: "Espadon", pin: "8563", color: "#2563eb" }, // blue and white
  { name: "Grizzly", pin: "3729", color: "#7f1d1d" }, // maroon and white/beige
];

// Edit this list before camp: challenge titles, descriptions, points, and
// egg hiding coordinates (lat/lng). Upload hint photos afterward from the
// admin "Challenges" page.
//
// NOTE: this is a partial list (7 of the eventual ~50 challenges) using
// placeholder coordinates scattered around Qornayel, Lebanon just to get a
// live deployment testable. Real coordinates + hint photos + the rest of
// the challenges will replace this batch later (safe to re-run db:seed,
// or edit individual challenges from the admin Challenges page instead).
const CHALLENGES = [
  {
    title: "Di3aye la neo",
    description: "Di3aye la neo.",
    points: 30,
    eggLat: 33.7975,
    eggLng: 35.7638,
  },
  {
    title: "Soura maa 4 banet helwin (bonus eza aandoun ar2amoun)",
    description: "Soura maa 4 banet helwin (bonus eza aandoun ar2amoun).",
    points: 60,
    eggLat: 33.799,
    eggLng: 35.7655,
  },
  {
    title: "Selfie maa mat griffon",
    description: "Selfie maa mat griffon.",
    points: 60,
    eggLat: 33.7968,
    eggLng: 35.766,
  },
  {
    title: "Edit helwe lal patrouille",
    description: "Edit helwe lal patrouille.",
    points: 30,
    eggLat: 33.7985,
    eggLng: 35.7625,
  },
  {
    title: "Soura maa bashar (sahib el emplacement)",
    description: "Soura maa bashar (sahib el emplacement).",
    points: 60,
    eggLat: 33.7995,
    eggLng: 35.764,
  },
  {
    title: "Make your own food",
    description: "Make your own food.",
    points: 50,
    eggLat: 33.7972,
    eggLng: 35.765,
  },
  {
    title: "Dabbir 10 followers la account ltroupe (strangers)",
    description: "Dabbir 10 followers la account ltroupe (strangers).",
    points: 20,
    eggLat: 33.7988,
    eggLng: 35.767,
  },
];

async function main() {
  for (const team of TEAMS) {
    await prisma.team.upsert({
      where: { name: team.name },
      update: { pin: team.pin, color: team.color },
      create: team,
    });
  }
  console.log(`Seeded ${TEAMS.length} teams.`);

  // Remove any teams left over from a previous roster (e.g. renamed patrols).
  // This cascades away their submissions/egg claims too, so only do this
  // intentionally when teams are being replaced, not just renamed in place.
  const removed = await prisma.team.deleteMany({
    where: { name: { notIn: TEAMS.map((t) => t.name) } },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} team(s) no longer in the roster.`);
  }

  for (const challenge of CHALLENGES) {
    const existing = await prisma.challenge.findFirst({ where: { title: challenge.title } });
    if (existing) {
      await prisma.challenge.update({ where: { id: existing.id }, data: challenge });
    } else {
      await prisma.challenge.create({ data: challenge });
    }
  }
  console.log(`Seeded ${CHALLENGES.length} challenges.`);

  // Remove any challenges left over from a previous batch (e.g. the old
  // placeholder set). Same caveat as teams: only safe when challenges are
  // being replaced/superseded, not just renamed in place.
  const removedChallenges = await prisma.challenge.deleteMany({
    where: { title: { notIn: CHALLENGES.map((c) => c.title) } },
  });
  if (removedChallenges.count > 0) {
    console.log(`Removed ${removedChallenges.count} challenge(s) no longer in the list.`);
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, mapMode: "LIVE_TILES" },
  });
  console.log("Ensured default settings row exists.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
