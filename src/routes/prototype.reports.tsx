/**
 * PROTOTYPE (#259): throwaway. Three Reports layouts on one route, switched by
 * `?variant=A|B|C`; `?data=demo|thin|real` picks made-up history, one month
 * of it, or this device's projections. Not for main: see #259 for the verdict.
 */

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useReportData } from "@/components/reports-prototype/data";
import { PrototypeSwitcher } from "@/components/reports-prototype/PrototypeSwitcher";
import {
  readReportsSearch,
  VARIANTS,
  type ReportsSearch,
  type VariantProps,
} from "@/components/reports-prototype/search";
import { VariantA } from "@/components/reports-prototype/VariantA";
import { VariantB } from "@/components/reports-prototype/VariantB";
import { VariantC } from "@/components/reports-prototype/VariantC";
import { readFinanceView, rememberFinanceView } from "@/lib/finances/view";
import type { FinanceView } from "@/lib/finances/overview";
import { localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/prototype/reports")({
  staticData: { title: "Reports (prototype)" },
  validateSearch: readReportsSearch,
  component: ReportsPrototype,
});

const VARIANT_COMPONENTS = { A: VariantA, B: VariantB, C: VariantC };

function ReportsPrototype() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const userId = useAuthStore((state) => state.user?.id) ?? "";
  const [view, setView] = useState<FinanceView>(readFinanceView);
  const currentMonth = useMemo(() => localMonth(new Date()), []);
  const data = useReportData(search.data, view, userId, currentMonth);

  const setSearch = (change: Partial<ReportsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
  const onViewChange = (next: FinanceView) => {
    rememberFinanceView(next);
    setView(next);
  };
  const Variant = VARIANT_COMPONENTS[search.variant];
  const props: VariantProps | null = data
    ? { data, view, onViewChange, search, setSearch, currentMonth }
    : null;

  return (
    <>
      {props && <Variant {...props} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={search.variant}
        onVariantChange={(variant) =>
          setSearch({ variant, open: undefined, cell: undefined, group: undefined })
        }
        source={search.data}
        onSourceChange={(source) => setSearch({ data: source })}
        state={{
          ...search,
          view,
          months: data?.months.length,
          monthsWithSpending: data?.monthsWithSpending,
          groups: data?.groups.length,
          lines: data?.lines.length,
        }}
      />
    </>
  );
}
