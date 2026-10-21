import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, House, Palette, UserPlus, Users, type LucideIcon } from "lucide-react";
import { ListRow } from "@/components/app/ListRow";
import { SectionHeader } from "@/components/app/SectionHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { HouseholdDetails } from "@/components/households/HouseholdSettings";
import { JoinRequestsList } from "@/components/households/JoinRequestsCard";
import { MembersList } from "@/components/households/MembersCard";
import { DetailPane, resolveOpenItem, useOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { useTwoPanes } from "@/components/layout/pane";
import type { Household } from "@/lib/households";
import { pendingJoinRequestsQueryOptions } from "@/lib/join-requests";
import { AppearanceChoice } from "./AppearanceChoice";
import { ExportButtons } from "./ExportCard";
import { SettingsNav } from "./SettingsNav";

export interface SettingsSection {
  id: string;
  title: string;
  icon: LucideIcon;
  /** The muted line under the section's row in the list. */
  summary: string;
  description?: string;
  badge?: ReactNode;
  content: ReactNode;
}

interface SettingsViewProps {
  household: Household;
  userId: string;
  isOwner: boolean;
}

/**
 * Settings' sections. With two panes, a list whose chosen section opens beside
 * it (`?open=<section>`); with one, a long page with links that jump to each.
 */
export function SettingsView({ household, userId, isOwner }: SettingsViewProps) {
  const sections = useSettingsSections({ household, userId, isOwner });
  return useTwoPanes() ? <SectionList sections={sections} /> : <SectionPage sections={sections} />;
}

function useSettingsSections({ household, userId, isOwner }: SettingsViewProps) {
  const { data: requests } = useQuery({
    ...pendingJoinRequestsQueryOptions(household.id, { poll: true }),
    enabled: isOwner,
  });
  const requestCount = requests?.length ?? 0;

  const sections: SettingsSection[] = [
    {
      id: "appearance",
      title: "Appearance",
      icon: Palette,
      summary: "Light, dark or system",
      description: "Choose how Household Hub looks to you.",
      content: <AppearanceChoice />,
    },
    {
      id: "household",
      title: "Household",
      icon: House,
      summary: household.name,
      content: <HouseholdDetails household={household} userId={userId} isOwner={isOwner} />,
    },
    {
      id: "members",
      title: "Members",
      icon: Users,
      summary: "Who shares this household",
      description: "Everyone in the household sees its Household accounts.",
      content: <MembersList householdId={household.id} userId={userId} isOwner={isOwner} />,
    },
  ];
  if (isOwner) {
    sections.push({
      id: "join-requests",
      title: "Join requests",
      icon: UserPlus,
      summary: "People asking to join",
      description: "People who used your Household Code. Accepting makes them a Member.",
      badge: requestCount > 0 && (
        <StatusBadge tone="neutral">{`${requestCount} waiting`}</StatusBadge>
      ),
      content: <JoinRequestsList householdId={household.id} />,
    });
  }
  sections.push({
    id: "export",
    title: "Export",
    icon: Download,
    summary: "Transactions or the event log",
    description: "Download what this device holds: Household records plus your own Personal ones.",
    content: <ExportButtons />,
  });
  return sections;
}

function SectionList({ sections }: { sections: SettingsSection[] }) {
  const { openId, open } = useOpenItem();
  const opened = resolveOpenItem(openId, (id) => sections.find((section) => section.id === id));

  return (
    <>
      <PageShell.List>
        <ul aria-label="Settings sections" className="-mx-4 divide-y border-y">
          {sections.map((section) => (
            <li key={section.id}>
              <ListRow
                onClick={() => open(section.id)}
                open={section.id === openId}
                leading={
                  <section.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                }
                label={section.title}
                trailing={section.badge || undefined}
                detail={section.summary}
              />
            </li>
          ))}
        </ul>
      </PageShell.List>
      <DetailPane title={opened?.title} description={opened?.description} item={opened}>
        {(section) => section.content}
      </DetailPane>
    </>
  );
}

function SectionPage({ sections }: { sections: SettingsSection[] }) {
  return (
    <PageShell.List className="space-y-8">
      <SettingsNav sections={sections} />
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-label={section.title}
          className="scroll-mt-[calc(var(--app-header)+1rem)] space-y-4"
        >
          <div className="space-y-1">
            <SectionHeader title={section.title} action={section.badge || undefined} />
            {section.description && (
              <p className="text-body text-muted-foreground">{section.description}</p>
            )}
          </div>
          {section.content}
        </section>
      ))}
    </PageShell.List>
  );
}
