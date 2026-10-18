import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isVisibility, type Visibility } from "@/lib/events/log";

/** Household or Personal, chosen once when an account, group or category is added. */
export function VisibilityField({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: Visibility;
  onChange: (visibility: Visibility) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-label">Who sees it</legend>
      <RadioGroup
        name="visibility"
        value={value}
        onValueChange={(next) => isVisibility(next) && onChange(next)}
      >
        <VisibilityOption idPrefix={idPrefix} value="household" label="Household">
          Every member sees it.
        </VisibilityOption>
        <VisibilityOption idPrefix={idPrefix} value="personal" label="Personal">
          Only you see it, and it stays yours if you leave the household.
        </VisibilityOption>
      </RadioGroup>
      <p className="text-body text-muted-foreground">Visibility can&apos;t be changed later.</p>
    </fieldset>
  );
}

function VisibilityOption({
  idPrefix,
  value,
  label,
  children,
}: {
  idPrefix: string;
  value: Visibility;
  label: string;
  children: string;
}) {
  const id = `${idPrefix}-visibility-${value}`;
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem id={id} value={value} aria-describedby={`${id}-hint`} className="mt-0.5" />
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-body text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}
