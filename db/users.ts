import { db } from "./client";
import { eq } from "drizzle-orm";
import { users } from "./schema";
import { account } from "./drizzle/schema";
import { Account } from "better-auth";

export async function upsertUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  githubId?: string | null;
}) {
  const email = input.email.toLowerCase();
  const existingArr = await db.select().from(users).where(eq(users.email, email));
  const existing = existingArr[0];
  if (existing) {
    const updatedArr = await db
      .update(users)
      .set({
        name: input.name ?? existing.name,
        image: input.image ?? existing.image,
        githubId: input.githubId ?? existing.githubId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updatedArr[0];
  }
  const now = new Date();
  const insertedArr = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      name: input.name ?? null,
      image: input.image ?? null,
      githubId: input.githubId ?? null,
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return insertedArr[0];
}

export async function getGithubAccessToken(userId: string) {
  const accArr = await db.select().from(account).where(eq(account.userId, userId));
  return accArr[0]?.accessToken;
}