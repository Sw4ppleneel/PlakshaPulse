import "server-only";
import { ZodError } from "zod";
import { AuthError } from "./dal";
import { RateLimitError } from "./rate-limit";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export class UserError extends Error {}

/**
 * Every server action is a public POST endpoint. This wrapper turns expected failures into
 * friendly messages and makes sure nothing internal (SQL, stack traces) reaches the client.
 */
export async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const out = await fn();
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof AuthError || e instanceof RateLimitError || e instanceof UserError) {
      return { ok: false, error: e.message };
    }
    if (e instanceof ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    }
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
