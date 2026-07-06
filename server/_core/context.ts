import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  const apiIdentityAlreadyVerified = Boolean(opts.res.locals.manager || opts.res.locals.courier);

  if (!apiIdentityAlreadyVerified) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // OAuth authentication is optional for procedures with their own token checks.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
