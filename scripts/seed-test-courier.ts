/**
 * Seed script: creates a test courier with simple login/password
 * Run: pnpm tsx scripts/seed-test-courier.ts
 */
import "./load-env.js";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import { couriers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);

  const username = "courier1";
  const password = "1234";
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if already exists
  const existing = await db.select().from(couriers).where(eq(couriers.username, username)).limit(1);

  if (existing.length > 0) {
    console.log(`✅ Тестовый курьер уже существует:`);
    console.log(`   Логин:  ${username}`);
    console.log(`   Пароль: ${password}`);
    process.exit(0);
  }

  await db.insert(couriers).values({
    name: "Иван Тестов",
    username,
    passwordHash,
    phone: "+7 (999) 000-00-01",
    vehicleType: "scooter",
    isActive: true,
    totalDeliveries: 0,
  });

  console.log(`✅ Тестовый курьер создан:`);
  console.log(`   Логин:  ${username}`);
  console.log(`   Пароль: ${password}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Ошибка:", e);
  process.exit(1);
});
