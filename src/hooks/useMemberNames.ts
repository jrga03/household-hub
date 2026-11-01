import { useQuery } from "@tanstack/react-query";
import { householdMembersQueryOptions } from "@/lib/household-members";

/**
 * Names a member: "you" for `currentUserId`, else their email, else "a member"
 * (offline until the members list has loaded, or after they left).
 */
export function useMemberNames(
  householdId: string,
  currentUserId: string | undefined
): (userId: string) => string {
  const { data: members } = useQuery(householdMembersQueryOptions(householdId));
  const emails = new Map(members?.map((member) => [member.userId, member.email]));
  return (userId) => (userId === currentUserId ? "you" : (emails.get(userId) ?? "a member"));
}
