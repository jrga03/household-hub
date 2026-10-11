import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupRow } from "@/lib/categories/projection";

const groupLabel = (group: GroupRow) =>
  group.visibility === "personal" ? `${group.name} (Personal)` : group.name;

/** Picks a group in use; submitted as `groupId`. */
export function GroupSelect({
  id,
  groups,
  defaultValue,
}: {
  id: string;
  groups: GroupRow[];
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Group</Label>
      <Select name="groupId" defaultValue={defaultValue}>
        <SelectTrigger id={id} className="w-full">
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
    </div>
  );
}
