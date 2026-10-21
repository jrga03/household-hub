import { useTheme } from "next-themes";
import { SegmentedControl } from "@/components/app/SegmentedControl";

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

type Theme = (typeof THEMES)[number]["value"];

const isTheme = (value: string | undefined): value is Theme =>
  THEMES.some((theme) => theme.value === value);

export function AppearanceChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      label="Theme"
      options={THEMES}
      value={isTheme(theme) ? theme : "system"}
      onChange={setTheme}
    />
  );
}
