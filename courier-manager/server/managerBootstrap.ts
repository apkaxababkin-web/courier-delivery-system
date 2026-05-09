import postgres from "postgres";

function looksLikeBcrypt(value: unknown): value is string {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

export async function ensureManagerAuthReady(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("[ManagerBootstrap] DATABASE_URL is not configured; skipping");
    return;
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    console.log("[ManagerBootstrap] Checking manager auth schema...");

    await sql`
      CREATE TABLE IF NOT EXISTS managers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(320),
        "isActive" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT now(),
        "updatedAt" TIMESTAMP DEFAULT now()
      )
    `;

    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS password VARCHAR(255)`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS "passwordHash" VARCHAR(255)`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS name VARCHAR(255)`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS email VARCHAR(320)`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS phone VARCHAR(32)`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS role VARCHAR(64) DEFAULT 'manager'`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT now()`;
    await sql`ALTER TABLE managers ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT now()`;

    await sql`UPDATE managers SET name = COALESCE(NULLIF(name, ''), username, 'Менеджер') WHERE name IS NULL OR name = ''`;
    await sql`UPDATE managers SET role = COALESCE(NULLIF(role, ''), 'manager') WHERE role IS NULL OR role = ''`;
    await sql`UPDATE managers SET phone = COALESCE(phone, '') WHERE phone IS NULL`;
    await sql`UPDATE managers SET "isActive" = true WHERE "isActive" IS NULL`;

    const rows = await sql<Array<{ id: number; password: string | null; passwordHash: string | null }>>`
      SELECT id, password, "passwordHash" as "passwordHash" FROM managers
    `;

    for (const row of rows) {
      const hash = looksLikeBcrypt(row.passwordHash) ? row.passwordHash : looksLikeBcrypt(row.password) ? row.password : null;
      if (hash) {
        await sql`UPDATE managers SET password = ${hash}, "passwordHash" = ${hash}, "updatedAt" = now() WHERE id = ${row.id}`;
      }
    }

    console.log("[ManagerBootstrap] Manager auth schema is ready");
  } finally {
    await sql.end({ timeout: 5 });
  }
}
