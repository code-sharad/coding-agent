import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

// Resolve baseURL for Better Auth
const baseURL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

// Neon requires SSL; most DATABASE_URLs already include sslmode=require.
// If not present, pg Pool can be given ssl: { rejectUnauthorized: false }
const connectionString = process.env.DATABASE_URL!;

export const auth = betterAuth({
  appName: "Coding Agent",
  baseURL,
  secret:process.env.BETTER_AUTH_SECRET,
  database: new Pool({
    connectionString,
    // Uncomment if your Neon connection string lacks sslmode:
    // ssl: { rejectUnauthorized: false },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      // Request comprehensive repo access for private repos and PR creation
      scope: ["read:user", "user:email", "repo", "workflow"],
    },
  },
  plugins: [nextCookies()],
});
