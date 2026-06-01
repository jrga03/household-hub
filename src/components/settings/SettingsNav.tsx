import { cn } from "@/lib/utils";
import { Palette, Download, Database } from "lucide-react";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data-export", label: "Data Export", icon: Download },
  { id: "storage", label: "Storage", icon: Database },
] as const;

interface SettingsNavProps {
  activeId?: string;
}

export function SettingsNav({ activeId }: SettingsNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="
        flex gap-2 overflow-x-auto pb-2
        @[900px]:sticky @[900px]:top-4 @[900px]:self-start
        @[900px]:flex-col @[900px]:overflow-visible @[900px]:pb-0
      "
    >
      {SECTIONS.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
            "hover:bg-accent hover:text-accent-foreground",
            activeId === id ? "bg-accent text-accent-foreground" : "text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </a>
      ))}
    </nav>
  );
}
