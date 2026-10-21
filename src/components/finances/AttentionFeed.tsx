import type { ReactNode } from "react";
import type { LinkOptions } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { ListRow } from "@/components/app/ListRow";
import { BUDGET_STATUS_STYLE } from "@/components/budgets/budgetStatusStyle";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge, type StatusTone } from "@/components/app/StatusBadge";
import type { AttentionItem } from "@/lib/finances/attention";
import type { ReviewKind } from "@/lib/review/count";
import { cn, countOf } from "@/lib/utils";

interface FeedRow {
  key: string;
  link: LinkOptions;
  icon: LucideIcon;
  iconClass: string;
  sentence: ReactNode;
  detail: ReactNode;
  badge: { tone: StatusTone; text: string };
}

const REVIEW_COPY: Record<
  ReviewKind,
  { sentence: (count: number) => string; detail: string; link: LinkOptions }
> = {
  uncategorized: {
    sentence: (count) => `${countOf(count, "expense needs", "expenses need")} a category`,
    detail: "Give each one a category on Review",
    link: { to: "/review" },
  },
  drafts: {
    sentence: (count) => countOf(count, "imported draft waits", "imported drafts wait"),
    detail: "Check and save them on Import",
    link: { to: "/import" },
  },
  joinRequests: {
    sentence: (count) => countOf(count, "join request waits", "join requests wait"),
    detail: "Approve or decline on Review",
    link: { to: "/review" },
  },
};

function feedRow(item: AttentionItem): FeedRow {
  switch (item.kind) {
    case "over":
      return {
        key: `over-${item.categoryId}`,
        link: { to: "/budget", search: { open: item.categoryId } },
        icon: CircleAlert,
        iconClass: BUDGET_STATUS_STYLE.over.color,
        sentence: (
          <>
            {item.name} is{" "}
            <span className="text-shortfall">
              <Money kind="balance" cents={item.over} /> over
            </span>
          </>
        ),
        detail: (
          <>
            Budget <Money kind="balance" cents={item.budget} /> · Spent{" "}
            <Money kind="balance" cents={item.spent} />
          </>
        ),
        badge: BUDGET_STATUS_STYLE.over.badge,
      };
    case "short":
      return {
        key: `short-${item.accountId}`,
        link: { to: "/accounts", search: { open: item.accountId } },
        icon: CircleAlert,
        iconClass: "text-shortfall",
        sentence: (
          <>
            {item.name} is at <Money kind="balance" cents={item.balance} />
          </>
        ),
        detail: "Move money in or check its transactions",
        badge: { tone: "shortfall", text: "Short" },
      };
    case "close":
      return {
        key: `close-${item.categoryId}`,
        link: { to: "/budget", search: { open: item.categoryId } },
        icon: Clock,
        iconClass: BUDGET_STATUS_STYLE.close.color,
        sentence: (
          <>
            {item.name} has <Money kind="balance" cents={item.left} /> left
          </>
        ),
        detail: (
          <>
            Budget <Money kind="balance" cents={item.budget} />
          </>
        ),
        badge: BUDGET_STATUS_STYLE.close.badge,
      };
    case "review": {
      const { sentence, detail, link } = REVIEW_COPY[item.review];
      return {
        key: `review-${item.review}`,
        link,
        icon: ClipboardCheck,
        iconClass: "text-muted-foreground",
        sentence: sentence(item.count),
        detail,
        badge: { tone: "neutral", text: "Review" },
      };
    }
  }
}

/** Needs attention: one plain sentence per problem, most urgent first, each linking to its fix. */
export function AttentionFeed({
  items,
  fineBudgets,
}: {
  items: AttentionItem[];
  fineBudgets: number;
}) {
  return (
    <section className="space-y-2">
      <SectionHeader title="Needs attention" />
      {items.length === 0 ? (
        <EmptyState>Nothing needs attention.</EmptyState>
      ) : (
        <ul aria-label="Needs attention" className="divide-y border-y">
          {items.map(feedRow).map((row) => (
            <AttentionRow key={row.key} row={row} />
          ))}
        </ul>
      )}
      {fineBudgets > 0 && (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <CircleCheck aria-hidden className="size-4 text-success" />
          {countOf(fineBudgets, "budget is", "budgets are")} fine.
        </p>
      )}
    </section>
  );
}

function AttentionRow({ row }: { row: FeedRow }) {
  const Icon = row.icon;
  return (
    <li>
      <ListRow
        link={row.link}
        className="px-0"
        leading={<Icon aria-hidden className={cn("size-5 shrink-0", row.iconClass)} />}
        label={row.sentence}
        detail={row.detail}
        amount={
          <span className="flex items-center gap-2">
            <StatusBadge tone={row.badge.tone} className="hidden @[600px]:inline-flex">
              {row.badge.text}
            </StatusBadge>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </span>
        }
      />
    </li>
  );
}
