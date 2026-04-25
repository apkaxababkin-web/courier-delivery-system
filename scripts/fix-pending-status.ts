import { getDb } from "../server/db";
import { tasks } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

async function fixPendingStatus() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    process.exit(1);
  }

  try {
    console.log("Updating pending tasks to assigned...");
    const result = await db
      .update(tasks)
      .set({ status: "assigned" })
      .where(sql`status = 'pending'`);
    
    console.log("✅ Successfully updated pending tasks to assigned");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating tasks:", error);
    process.exit(1);
  }
}

fixPendingStatus();
