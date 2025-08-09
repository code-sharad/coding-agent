import { db } from "./client";
import { eq } from "drizzle-orm";
import { users } from "./schema";

export async function upsertUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  githubId?: string | null;
}) {
  const email = input.email.toLowerCase();
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    const updated = db
      .update(users)
      .set({
        name: input.name ?? existing.name,
        image: input.image ?? existing.image,
        githubId: input.githubId ?? existing.githubId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning()
      .get();
    return updated;
  }
  const inserted = db
    .insert(users)
    .values({
      email,
      name: input.name ?? null,
      image: input.image ?? null,
      githubId: input.githubId ?? null,
    })
    .returning()
    .get();
  return inserted;
}
