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
      // Cast: this hook is route-agnostic, so we can't satisfy a specific
      // route's typed search reducer. Consumer routes validate the param.
      navigate({
        search: ((prev: Record<string, unknown>) => ({ ...prev, [paramKey]: id })) as never,
        replace: false,
      });
    },
    [navigate, paramKey]
  );

  const clear = useCallback(() => {
    navigate({
      search: ((prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next[paramKey];
        return next;
      }) as never,
      replace: false,
    });
  }, [navigate, paramKey]);

  return { selectedId, select, clear };
}
