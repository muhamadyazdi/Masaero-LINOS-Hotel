import postgres from "postgres";

let sql = null;

export async function getDatabase() {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || "";
  if (!url) return null;
  if (!sql) {
    sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      prepare: false
    });
  }
  return sql;
}

export async function closeDatabase() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
