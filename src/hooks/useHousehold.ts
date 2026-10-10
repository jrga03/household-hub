import { useQuery } from "@tanstack/react-query";
import { householdQueryOptions } from "@/lib/households";
import { useAuthStore } from "@/stores/authStore";

/** The signed-in person's household; the route gate has already loaded it. */
export function useHousehold() {
  const userId = useAuthStore((state) => state.user?.id);
  const { data: household } = useQuery({
    ...householdQueryOptions(userId ?? ""),
    enabled: userId !== undefined,
  });
  return { household: household ?? null, isOwner: household?.ownerUserId === userId };
}
