import { useId, useState, type ReactNode } from "react";
import { SectionHeader } from "@/components/app/SectionHeader";
import { cn } from "@/lib/utils";
import { useCollapsedGroupsStore } from "@/stores/collapsedGroupsStore";

/** The Ungrouped section's key in the collapsed groups. */
export const UNGROUPED = "ungrouped";

/**
 * A category group's section on Budget and Set budgets. Pressing its header
 * hides the rows and keeps `title` and `action` in view; the choice is shared
 * by both screens and remembered on this device.
 */
export function CollapsibleGroup({
  groupId,
  label,
  title,
  action,
  children,
}: {
  groupId: string;
  label: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const rowsId = useId();
  const collapsed = useCollapsedGroupsStore((state) => state.collapsedGroupIds.includes(groupId));
  const toggleGroup = useCollapsedGroupsStore((state) => state.toggleGroup);
  // Fade only rows the person opened, never on page load.
  const [fadeIn, setFadeIn] = useState(false);

  return (
    <section aria-label={label} className="space-y-2">
      <SectionHeader
        title={title}
        action={action}
        toggle={{
          expanded: !collapsed,
          controls: rowsId,
          onToggle: () => {
            setFadeIn(true);
            toggleGroup(groupId);
          },
        }}
      />
      <div
        id={rowsId}
        hidden={collapsed}
        className={cn("space-y-2", fadeIn && "animate-in fade-in duration-quick")}
      >
        {!collapsed && children}
      </div>
    </section>
  );
}
