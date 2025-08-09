// import Database from "better-sqlite3";
// import { drizzle } from "drizzle-orm/better-sqlite3";
// import * as schema from "./schema";
// import { betterAuth } from "better-auth";
// import { Pool } from "pg";

// const dbPath = process.env.DATABASE_URL

// const sqlite = new Database(dbPath);
// // export const db = drizzle(sqlite, { schema });
// export const auth = betterAuth({
//   database: new Pool({
//     connectionString: dbPath,
//   }),
// });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

// Build a Neon SQL client from DATABASE_URL
const connectionString = process.env.DATABASE_URL!;
const sql = neon(connectionString);

export const db = drizzle(sql);


