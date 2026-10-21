import { cn } from "@/lib/utils";
import type { SettingsSection } from "./SettingsView";

/** Links that jump to each section of the one-pane Settings page. */
export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  return (
    <nav aria-label="Settings sections" className="-mx-3 flex flex-wrap gap-x-2">
      {sections.map(({ id, title, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-body font-medium whitespace-nowrap text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {title}
        </a>
      ))}
    </nav>
  );
}
