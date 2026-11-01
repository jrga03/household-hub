import { useQuery } from "@tanstack/react-query";
import { householdMembersQueryOptions } from "@/lib/household-members";

/** Each member's email by user ID; empty offline until the members list has loaded. */
export function useMemberNames(householdId: string): Map<string, string> {
  const { data: members } = useQuery(householdMembersQueryOptions(householdId));
  return new Map(members?.map((member) => [member.userId, member.email]));
}
