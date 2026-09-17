import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Create a free Postgres database (e.g. https://neon.tech), " +
      "copy its connection string into .env.local as DATABASE_URL, then run `npm run db:push && npm run db:seed`. " +
      "See README.md > Deploying with Postgres."
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __synphonyPg: ReturnType<typeof postgres> | undefined;
}

// Reuse the connection across hot-reloads in dev so we don't exhaust the pool.
const client = global.__synphonyPg ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") global.__synphonyPg = client;

export const db = drizzle(client, { schema });
export { client as sql };
