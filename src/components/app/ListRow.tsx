import { useLinkProps, type LinkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Where a row goes when activated: a URL (such as `?open=<id>`) or an action. */
export type RowTarget =
  { link: LinkOptions; onClick?: never } | { onClick: () => void; link?: never };

export type RowTargetProps = RowTarget & {
  /** The row whose detail is showing. */
  open?: boolean;
};

const stretchedTarget =
  "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset";

/**
 * The one target of a row. Its `::after` stretches over the nearest positioned
 * ancestor (the row), so a click anywhere on the row lands on it.
 */
export function RowTargetElement({
  link,
  onClick,
  open = false,
  className,
  children,
}: RowTargetProps & { className?: string; children: ReactNode }) {
  const classes = cn(stretchedTarget, className);
  if (link) {
    return (
      <RowLink link={link} open={open} className={classes}>
        {children}
      </RowLink>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={open ? "true" : undefined}
      className={classes}
    >
      {children}
    </button>
  );
}

function RowLink({
  link,
  open,
  className,
  children,
}: {
  link: LinkOptions;
  open: boolean;
  className: string;
  children: ReactNode;
}) {
  // The router marks a link to the current URL aria-current="page"; a row says "true" only when open.
  const linkProps = useLinkProps(link);
  return (
    <a {...linkProps} aria-current={open ? "true" : undefined} className={className}>
      {children}
    </a>
  );
}

/** Quick actions sit above the stretched target and show on hover or focus. Phone-width rows hide them. */
export function RowActions({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative z-10 hidden shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100 @[600px]:flex",
        className
      )}
    >
      {children}
    </div>
  );
}

type ListRowProps = RowTargetProps & {
  label: ReactNode;
  /** The muted second line: category, account, date. */
  detail?: ReactNode;
  /** Trailing slot on the label line, usually a `Money`. */
  amount?: ReactNode;
  /** Icons before the label, such as transfer or pending. */
  leading?: ReactNode;
  /** Mutes the label, as for a pending transaction. */
  muted?: boolean;
  actions?: ReactNode;
  className?: string;
};

/**
 * A list row that is one tap target. Its height depends only on its own
 * content, so it works as an item in a virtualized list.
 */
export function ListRow({
  label,
  detail,
  amount,
  leading,
  muted = false,
  actions,
  className,
  ...target
}: ListRowProps) {
  return (
    <div
      className={cn(
        "group/row relative flex items-center gap-2 px-4 py-2 transition-colors hover:bg-accent",
        target.open && "bg-accent",
        className
      )}
    >
      <RowTargetElement {...target} className="block min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          {leading}
          <span
            className={cn("min-w-0 flex-1 truncate font-medium", muted && "text-muted-foreground")}
          >
            {label}
          </span>
          {amount !== undefined && (
            <span className="shrink-0 whitespace-nowrap tabular-nums">{amount}</span>
          )}
        </span>
        {detail !== undefined && (
          <span className="block truncate text-muted-foreground">{detail}</span>
        )}
      </RowTargetElement>
      {actions !== undefined && <RowActions>{actions}</RowActions>}
    </div>
  );
}
