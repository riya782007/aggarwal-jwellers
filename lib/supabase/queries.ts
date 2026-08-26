/** Server-only data access. Uses the service-role client (bypasses RLS for admin reads). */
import "server-only";
import { supabaseServer } from "./server";
import type { PricingFormula } from "../pricing";

/**
 * Sanitise a user search term before putting it in a PostgREST `.or(...ilike...)` filter.
 * Strips characters with meaning in the or() grammar (commas, parentheses, wildcards,
 * dots, asterisks) so a search string can never break or inject into the query.
 */
function escLike(s: string): string {
  return s.trim().replace(/[,()*%.]/g, " ").replace(/\s+/g, " ").trim();
}

export type DbCategory = { id: string; name: string; slug: string };
