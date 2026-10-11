import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import {
  callMembershipFunction,
  householdQueryOptions,
  MEMBERSHIP_STALE_MS,
  setMyHousehold,
} from "@/lib/households";
import { syncNow } from "@/lib/sync";

export interface HouseholdMember {
  userId: string;
  email: string;
  isOwner: boolean;
}

async function fetchMembers(): Promise<HouseholdMember[]> {
  const { data, error } = await supabase.rpc("list_household_members");
  if (error) throw error;
  return data.map((row) => ({ userId: row.user_id, email: row.email, isOwner: row.is_owner }));
}

export const householdMembersQueryOptions = (householdId: string) =>
  queryOptions({
    queryKey: ["household-members", householdId],
    queryFn: fetchMembers,
    staleTime: MEMBERSHIP_STALE_MS,
  });

async function refreshHousehold(userId: string, householdId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: householdQueryOptions(userId).queryKey }),
    queryClient.invalidateQueries({ queryKey: householdMembersQueryOptions(householdId).queryKey }),
  ]);
}

/**
 * Pushes this device's changes first, so the household keeps them. The next
 * sync then wipes the household's data from this device.
 */
export async function leaveHousehold(userId: string): Promise<void> {
  await syncNow();
  await callMembershipFunction(supabase.rpc("leave_household"), "Couldn't leave the household.");
  setMyHousehold(userId, null);
}

export async function removeMember(
  userId: string,
  householdId: string,
  memberUserId: string
): Promise<void> {
  await callMembershipFunction(
    supabase.rpc("remove_member", { member_user_id: memberUserId }),
    "Couldn't remove them."
  );
  await refreshHousehold(userId, householdId);
}

export async function handOverOwnership(
  userId: string,
  householdId: string,
  newOwnerUserId: string
): Promise<void> {
  await callMembershipFunction(
    supabase.rpc("hand_over_ownership", { new_owner_user_id: newOwnerUserId }),
    "Couldn't hand over ownership."
  );
  await refreshHousehold(userId, householdId);
}

export async function replaceHouseholdCode(userId: string, householdId: string): Promise<void> {
  await callMembershipFunction(
    supabase.rpc("replace_household_code"),
    "Couldn't replace the code."
  );
  await refreshHousehold(userId, householdId);
}
