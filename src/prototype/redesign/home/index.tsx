// PROTOTYPE (#194): home variants.
import type { Variant } from "../screens";
import { HomeA } from "./A";
import { HomeB } from "./B";
import { HomeC } from "./C";

export const HOME_VARIANTS: Variant[] = [
  { key: "A", name: "Quiet sections", Body: HomeA },
  { key: "B", name: "Card dashboard", Body: HomeB },
  { key: "C", name: "Attention feed", Body: HomeC },
];
