import type { ReactNode } from "react";
import type { LinkOptions } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { ListRow } from "@/components/app/ListRow";
import { Notice } from "@/components/app/Notice";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { JoinRequestRow } from "@/components/households/JoinRequestsCard";
import { useHousehold } from "@/hooks/useHousehold";
import { usePendingJoinRequests } from "@/hooks/useJoinRequests";
import { useReviewCounts } from "@/hooks/useReviewCount";
import { REVIEW_KINDS, totalReviewItems, type ReviewKind } from "@/lib/review/count";
import { countOf } from "@/lib/utils";

/** Everything waiting for a member, one section per kind; each hides when empty. */
export function ReviewView() {
  const counts = useReviewCounts();
  const joinRequestsUnread = useJoinRequestsUnread();
  if (!counts) return null;

  return (
    <div className="space-y-8">
      {totalReviewItems(counts) === 0 ? (
        <AllClear />
      ) : (
        REVIEW_KINDS.map((kind) => {
          const count = counts[kind];
          if (count === 0) return null;
          const Section = SECTIONS[kind];
          return <Section key={kind} count={count} />;
        })
      )}
      {joinRequestsUnread && <Notice>Join requests show when you&apos;re online.</Notice>}
    </div>
  );
}

/** True for the Owner while join requests can't be read: offline, or the server failed. */
function useJoinRequestsUnread() {
  const { isOwner } = useHousehold();
  const { data, isError, fetchStatus } = usePendingJoinRequests();
  return isOwner && data === undefined && (isError || fetchStatus === "paused");
}

const SECTIONS: Record<ReviewKind, (props: { count: number }) => ReactNode> = {
  uncategorized: UncategorizedSection,
  drafts: DraftsSection,
  joinRequests: JoinRequestsSection,
};

interface ReviewSectionProps {
  title: string;
  count: number;
  children: ReactNode;
}

/** One kind of item to review: its title and count, then its rows between hairlines. */
function ReviewSection({ title, count, children }: ReviewSectionProps) {
  return (
    <section aria-label={title} className="space-y-2">
      <SectionHeader
        title={title}
        action={<StatusBadge tone="neutral">{`${count} to review`}</StatusBadge>}
      />
      {children}
    </section>
  );
}

/** A section's one row: where to go to deal with its items. */
function ReviewLinkRow({
  label,
  detail,
  link,
}: {
  label: string;
  detail: string;
  link: LinkOptions;
}) {
  return (
    <div className="-mx-4 border-y">
      <ListRow link={link} label={label} detail={detail} />
    </div>
  );
}

function UncategorizedSection({ count }: { count: number }) {
  return (
    <ReviewSection title="Expenses without a category" count={count}>
      <ReviewLinkRow
        label="Categorize"
        detail={`${countOf(count, "expense has", "expenses have")} no category yet.`}
        link={{ to: "/transactions", search: { needsCategory: true } }}
      />
    </ReviewSection>
  );
}

function DraftsSection({ count }: { count: number }) {
  return (
    <ReviewSection title="Imported drafts" count={count}>
      <ReviewLinkRow
        label="Review drafts"
        detail={`${countOf(count, "draft waits", "drafts wait")} on this device.`}
        link={{ to: "/import" }}
      />
    </ReviewSection>
  );
}

function JoinRequestsSection({ count }: { count: number }) {
  const { household } = useHousehold();
  const { data: requests } = usePendingJoinRequests({ poll: true });
  if (!household || !requests) return null;

  return (
    <ReviewSection title="Join requests" count={count}>
      <p className="text-body text-muted-foreground">
        People who used your Household Code. Accepting makes them a Member.
      </p>
      <ul className="-mx-4 divide-y border-y px-1">
        {requests.map((request) => (
          <JoinRequestRow key={request.id} householdId={household.id} request={request} />
        ))}
      </ul>
    </ReviewSection>
  );
}

function AllClear() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <CircleCheck aria-hidden className="size-10 text-income" />
      <h2 className="text-heading">All clear</h2>
      <p className="text-body text-muted-foreground">Nothing needs a look right now.</p>
    </div>
  );
}
