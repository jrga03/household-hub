import { CATEGORY_COLORS } from "@/types/categories";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          onClick={() => onChange(color.value)}
          className={cn(
            "w-8 h-8 rounded-full border-2 transition-all",
            value === color.value
              ? "border-primary ring-2 ring-primary ring-offset-2"
              : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: color.value }}
          title={color.label}
          aria-label={`Select ${color.label} color`}
        />
      ))}
    </div>
  );
}
