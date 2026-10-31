import { useState } from "react";
import { Combobox } from "@/components/app/Combobox";
import type { GroupRow } from "@/lib/categories/projection";

const groupLabel = (group: GroupRow) =>
  group.visibility === "personal" ? `${group.name} (Personal)` : group.name;

/** Picks a group in use; submitted as `groupId`. Inside a `Field`, spread its control props onto it. */
export function GroupSelect({
  groups,
  defaultValue,
  ...trigger
}: {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  groups: GroupRow[];
  defaultValue?: string;
}) {
  const [groupId, setGroupId] = useState(defaultValue ?? "");
  return (
    <Combobox
      {...trigger}
      name="groupId"
      className="w-full"
      placeholder="Choose a group"
      value={groupId}
      onValueChange={setGroupId}
      groups={[{ options: groups.map((group) => ({ value: group.id, label: groupLabel(group) })) }]}
    />
  );
}
