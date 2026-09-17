import type { Config } from "drizzle-kit";
import { config } from "dotenv";

// Next.js loads .env.local automatically at runtime; drizzle-kit and tsx scripts don't, so
// load it explicitly here (mirrors the same line in src/db/seed.ts).
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see README.md > Deploying with Postgres.");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;
