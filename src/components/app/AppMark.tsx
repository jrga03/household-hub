import markSource from "@/assets/app-mark.svg?raw";
import { cn } from "@/lib/utils";

const MARK_PATH = /\sd="([^"]+)"/.exec(markSource)?.[1] ?? "";

const TILE_SIZE = {
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
  xl: "size-16",
} as const;

interface AppMarkProps {
  size?: keyof typeof TILE_SIZE;
  /** Set only when no text beside the mark names the app. */
  label?: string;
  className?: string;
}

/** The app's mark on its `primary` tile. */
export function AppMark({ size = "md", label, className }: AppMarkProps) {
  return (
    <div
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        TILE_SIZE[size],
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-[84%]">
        <path fillRule="evenodd" d={MARK_PATH} />
      </svg>
    </div>
  );
}
