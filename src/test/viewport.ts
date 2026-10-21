import { vi } from "vitest";

const matchesWidth = (query: string, width: number) => {
  const min = /min-width:\s*(\d+)px/.exec(query)?.[1];
  const max = /max-width:\s*(\d+)px/.exec(query)?.[1];
  return (min === undefined || width >= Number(min)) && (max === undefined || width <= Number(max));
};

/** Answers width media queries as a window this wide would. Undo with `vi.restoreAllMocks()`. */
export function setViewportWidth(width: number) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: matchesWidth(query, width),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}
