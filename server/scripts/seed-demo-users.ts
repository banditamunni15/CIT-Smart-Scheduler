import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";

const demoUsers = [
  {
    name: "CIT Demo Admin",
    email: "admin@cit.demo",
    role: Role.ADMIN,
  },
  {
    name: "CIT Demo Admin 2",
    email: "admin2@cit.demo",
    role: Role.ADMIN,
  },
  {
    name: "CIT Demo Coordinator",
    email: "coordinator@cit.demo",
    role: Role.COORDINATOR,
    department: "CSE",
  },
  {
    name: "CIT Demo Faculty",
    email: "faculty@cit.demo",
    role: Role.FACULTY,
    department: "CSE",
  },
  {
    name: "CIT Demo Club Representative",
    email: "club@cit.demo",
    role: Role.CLUB,
    clubName: "Dramatics Society",
  },
] satisfies Array<{
  name: string;
  email: string;
  role: Role;
  department?: string;
  clubName?: string;
}>;

async function seedDemoUsers() {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Set DEMO_USER_PASSWORD to a password of at least 8 characters.",
    );
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (transaction) => {
    for (const demoUser of demoUsers) {
      const user = await transaction.user.upsert({
        where: { email: demoUser.email },
        create: {
          id: randomUUID(),
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          department: demoUser.department ?? null,
          clubName: demoUser.clubName ?? null,
          isActive: true,
        },
        update: {
          name: demoUser.name,
          role: demoUser.role,
          department: demoUser.department ?? null,
          facultyId: null,
          clubName: demoUser.clubName ?? null,
          isActive: true,
        },
      });

      const credentialAccount = await transaction.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
        select: { id: true },
      });

      if (credentialAccount) {
        await transaction.account.update({
          where: { id: credentialAccount.id },
          data: { accountId: user.email, password: passwordHash },
        });
      } else {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            accountId: user.email,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
          },
        });
      }
    }
  });

  console.info(`Seeded ${demoUsers.length} demo users.`);
}

seedDemoUsers()
  .catch((error: unknown) => {
    console.error("Failed to seed demo users:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
