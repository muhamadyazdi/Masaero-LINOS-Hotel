import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabase, closeDatabase } from "../src/adapters/postgres.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "netlify", "database", "migrations");

async function main() {
  const sql = await getDatabase();
  if (!sql) {
    console.error("DATABASE_URL is not set. Schema file is available under netlify/database/migrations/.");
    console.error("Local/demo mode uses the in-memory store and does not require Postgres.");
    process.exitCode = 1;
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await sql`SELECT id FROM schema_migrations WHERE id = ${file}`;
    if (applied.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const ddl = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
    });
    console.log(`applied ${file}`);
  }
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabase();
  process.exitCode = 1;
});
