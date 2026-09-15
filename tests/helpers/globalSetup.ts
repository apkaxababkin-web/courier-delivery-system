/**
 * Vitest global setup: create the throwaway billing database before the suite and
 * drop it afterwards. Kept separate from the DB module so nothing connects to a
 * database while vite is still loading test files.
 */
import { provisionTestDatabase, destroyTestDatabase } from "./testDb";

export async function setup(): Promise<void> {
  await provisionTestDatabase();
}

export async function teardown(): Promise<void> {
  await destroyTestDatabase();
}
