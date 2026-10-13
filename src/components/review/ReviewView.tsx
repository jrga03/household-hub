import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinRequestRow } from "@/components/households/JoinRequestsCard";
import { useHousehold } from "@/hooks/useHousehold";
import { usePendingJoinRequests, useReviewCounts } from "@/hooks/useReviewCount";
import { REVIEW_KINDS, totalReviewItems, type ReviewKind } from "@/lib/review/count";

const NEW_REQUEST_POLL_MS = 30_000;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Everything waiting for a member, one section per kind; each hides when empty. */
export function ReviewView() {
  const counts = useReviewCounts();
  const joinRequestsUnread = useJoinRequestsUnread();
  if (!counts) return null;

  return (
    <div className="space-y-4">
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
      {joinRequestsUnread && (
        <p className="text-center text-sm text-muted-foreground">
          Join requests show when you&apos;re online.
        </p>
      )}
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
  kind: ReviewKind;
  title: string;
  description: string;
  children: ReactNode;
}

function ReviewSection({ kind, title, description, children }: ReviewSectionProps) {
  const titleId = `review-${kind}-title`;
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="flex items-center gap-2">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function UncategorizedSection({ count }: { count: number }) {
  return (
    <ReviewSection
      kind="uncategorized"
      title="Expenses without a category"
      description={`${plural(count, "expense has", "expenses have")} no category yet.`}
    >
      <Button asChild variant="outline" size="sm">
        <Link to="/transactions" search={{ needsCategory: true }}>
          Categorize
        </Link>
      </Button>
    </ReviewSection>
  );
}

function DraftsSection({ count }: { count: number }) {
  return (
    <ReviewSection
      kind="drafts"
      title="Imported drafts"
      description={`${plural(count, "draft waits", "drafts wait")} on this device.`}
    >
      <Button asChild variant="outline" size="sm">
        <Link to="/import">Review drafts</Link>
      </Button>
    </ReviewSection>
  );
}

function JoinRequestsSection() {
  const { household } = useHousehold();
  const { data: requests } = usePendingJoinRequests({ refetchInterval: NEW_REQUEST_POLL_MS });
  if (!household || !requests) return null;

  return (
    <ReviewSection
      kind="joinRequests"
      title="Join requests"
      description="People who used your Household Code. Accepting makes them a Member."
    >
      <ul className="divide-y rounded-md border">
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
      <h2 className="text-lg font-semibold">All clear</h2>
      <p className="text-sm text-muted-foreground">Nothing needs a look right now.</p>
    </div>
  );
}
