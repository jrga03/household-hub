import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "title", "heading", "body", "label", "caption", "figure", "control"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Our own errors carry a message written for people; anything else gets the fallback. */
export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** "1 change" or "3 changes". */
export const countChanges = (count: number) => (count === 1 ? "1 change" : `${count} changes`);

/** "1 transaction", "1,250 transactions". */
export const countOf = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count.toLocaleString("en-PH")} ${many}`;
