import { queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import type { Tables } from "@/types/database.types";

export const CREATE_OR_JOIN_PATH = "/create-or-join";

export interface Household {
  id: string;
  name: string;
  code: string;
  ownerUserId: string;
}

type HouseholdRow = Pick<Tables<"households">, "id" | "name" | "code" | "owner_user_id">;

const toHousehold = (row: HouseholdRow): Household => ({
  id: row.id,
  name: row.name,
  code: row.code,
  ownerUserId: row.owner_user_id,
});

// A plain plpgsql `raise exception`: the membership functions write these messages for people.
const RAISED_BY_FUNCTION = "P0001";

export function membershipError(error: { code?: string; message: string }, fallback: string) {
  return new Error(error.code === RAISED_BY_FUNCTION ? error.message : fallback);
}

/** Every membership function needs a connection (ADR 0004); failures read as the function's own message. */
export async function callMembershipFunction(
  request: PromiseLike<{ error: { code?: string; message: string } | null }>,
  failureMessage: string
): Promise<void> {
  const { error } = await request;
  if (error) {
    throw membershipError(error, `${failureMessage} Check your connection and try again.`);
  }
}

async function fetchMyHousehold(): Promise<Household | null> {
  const { data, error } = await supabase
    .from("households")
    .select("id, name, code, owner_user_id")
    .maybeSingle();
  if (error) throw error;
  return data ? toHousehold(data) : null;
}

// The last membership seen online, so a member opening the app offline is
// not sent to create-or-join. Keyed by user so a shared device never shows
// one person another's household.
const LAST_KNOWN_KEY = "household-hub-last-household";

interface LastKnownHousehold {
  userId: string;
  household: Household | null;
}

function readLastKnown(userId: string): Household | null | undefined {
  try {
    const stored = localStorage.getItem(LAST_KNOWN_KEY);
    if (!stored) return undefined;
    const lastKnown = JSON.parse(stored) as LastKnownHousehold;
    return lastKnown.userId === userId ? lastKnown.household : undefined;
  } catch {
    return undefined;
  }
}

function writeLastKnown(lastKnown: LastKnownHousehold): void {
  try {
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(lastKnown));
  } catch {
    // Storage blocked: the gate still works online.
  }
}

export function forgetLastKnownHousehold(): void {
  try {
    localStorage.removeItem(LAST_KNOWN_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}

async function loadMyHousehold(userId: string): Promise<Household | null> {
  try {
    const household = await fetchMyHousehold();
    writeLastKnown({ userId, household });
    return household;
  } catch (error) {
    const lastKnown = readLastKnown(userId);
    if (lastKnown === undefined) throw error;
    return lastKnown;
  }
}

export const MEMBERSHIP_STALE_MS = 30_000;

export const householdQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["household", userId],
    queryFn: () => loadMyHousehold(userId),
    // The route gate awaits this; fall back to the last known membership at once.
    retry: false,
    // Another device can change who owns the household; refocusing picks it up.
    staleTime: MEMBERSHIP_STALE_MS,
  });

/** Needs a connection: households are server-authoritative. */
export async function createHousehold(userId: string, name: string): Promise<Household> {
  const { data, error } = await supabase.rpc("create_household", { household_name: name });
  if (error) {
    throw membershipError(
      error,
      "Couldn't create the household. Check your connection and try again."
    );
  }
  const household = toHousehold(data);
  setMyHousehold(userId, household);
  return household;
}

/** Records membership the server just confirmed, so the gate and the offline fallback agree with it. */
export function setMyHousehold(userId: string, household: Household | null): void {
  writeLastKnown({ userId, household });
  queryClient.setQueryData(householdQueryOptions(userId).queryKey, household);
}

/**
 * Membership changed on the server without this device doing it (removed,
 * or the Owner changed): re-read it and re-run the route gate, which sends
 * the person where they now belong.
 */
export async function reloadMembership(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["household"] });
  // Lazy, like authStore: a static import would cycle through the route tree.
  const { router } = await import("@/router");
  await router.invalidate();
}

export async function enforceHouseholdGate(pathname: string, userId: string): Promise<void> {
  // Unreachable with nothing known: create-or-join explains that it needs a connection.
  const household = await queryClient.fetchQuery(householdQueryOptions(userId)).catch(() => null);
  const onCreateOrJoin = pathname === CREATE_OR_JOIN_PATH;
  if (household && onCreateOrJoin) throw redirect({ to: "/" });
  if (!household && !onCreateOrJoin) throw redirect({ to: CREATE_OR_JOIN_PATH });
}
