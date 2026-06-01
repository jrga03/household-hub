import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

interface UseSelectedItemOptions {
  paramKey: string;
}

/**
 * Track a single "selected item" via URL search params so selection
 * survives reloads, deep-links, and back/forward navigation.
 *
 * Used by master-detail layouts (Accounts split, Transactions triple).
 */
export function useSelectedItem({ paramKey }: UseSelectedItemOptions) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const selectedId = (search[paramKey] as string | undefined) ?? null;

  const select = useCallback(
    (id: string) => {
      navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, [paramKey]: id }),
        replace: false,
      });
    },
    [navigate, paramKey]
  );

  const clear = useCallback(() => {
    navigate({
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next[paramKey];
        return next;
      },
      replace: false,
    });
  }, [navigate, paramKey]);

  return { selectedId, select, clear };
}
