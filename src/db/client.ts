import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "synphony.db");

declare global {
  // eslint-disable-next-line no-var
  var __synphonySqlite: Database.Database | undefined;
}

const sqlite = global.__synphonySqlite ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") global.__synphonySqlite = sqlite;

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
