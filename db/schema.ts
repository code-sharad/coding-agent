import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    githubId: text("github_id"),
    email: text("email").notNull(),
    name: text("name"),
    image: text("image"),
    role: text("role").default("user"),
    createdAt: timestamp("created_at", { withTimezone: false, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
