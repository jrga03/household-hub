import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
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
  return (
    <Select name="groupId" defaultValue={defaultValue}>
      <SelectTrigger {...trigger} className="w-full">
        <SelectValue placeholder="Choose a group" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectItem key={group.id} value={group.id}>
            {groupLabel(group)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
