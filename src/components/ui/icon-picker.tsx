import { CATEGORY_ICONS } from "@/types/categories";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {CATEGORY_ICONS.map((iconName) => {
        // Convert kebab-case to PascalCase for Lucide icon import
        // Example: "shopping-cart" → "ShoppingCart"
        const pascalCaseName = iconName
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join("") as keyof typeof LucideIcons;

        const IconComponent = LucideIcons[pascalCaseName] as React.ComponentType<{
          className?: string;
        }>;

        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onChange(iconName)}
            className={cn(
              "p-3 rounded-md border-2 transition-all hover:bg-accent",
              value === iconName ? "border-primary bg-accent" : "border-transparent"
            )}
            title={iconName}
            aria-label={`Select ${iconName} icon`}
          >
            {IconComponent && <IconComponent className="h-5 w-5" />}
          </button>
        );
      })}
    </div>
  );
}
