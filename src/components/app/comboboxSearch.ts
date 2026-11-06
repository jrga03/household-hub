import type { ComboboxGroup, ComboboxOption } from "./Combobox";

export interface SearchResult {
  option: ComboboxOption;
  group?: string;
  /** Positions of the letters to bold; none for a typo match. */
  labelBold: number[];
  groupBold: number[];
}

interface Match {
  /** Prefix 0, substring 1, letters in order 2, one typo 3. */
  tier: number;
  bold: number[];
}

// Letter by letter, so a match's positions are the text's own.
export const fold = (text: string) =>
  text
    .split("")
    .map((char) => char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().charAt(0) || char)
    .join("");

const range = (start: number, length: number) =>
  Array.from({ length }, (_, offset) => start + offset);

function lettersInOrder(text: string, query: string): number[] | null {
  const positions: number[] = [];
  let from = 0;
  for (const char of query.split("")) {
    const at = text.indexOf(char, from);
    if (at < 0) return null;
    positions.push(at);
    from = at + 1;
  }
  return positions;
}

/** One letter wrong, missing or extra, or two neighbours swapped. */
function withinOneEdit(a: string, b: string): boolean {
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  if (a.length === b.length) {
    const swapped = a[same] === b[same + 1] && a[same + 1] === b[same];
    return (
      a.slice(same + 1) === b.slice(same + 1) ||
      (swapped && a.slice(same + 2) === b.slice(same + 2))
    );
  }
  if (a.length === b.length + 1) return a.slice(same + 1) === b.slice(same);
  if (b.length === a.length + 1) return b.slice(same + 1) === a.slice(same);
  return false;
}

function match(text: string, query: string): Match | null {
  const folded = fold(text);
  const at = folded.indexOf(query);
  if (at >= 0) return { tier: at === 0 ? 0 : 1, bold: range(at, query.length) };
  const letters = lettersInOrder(folded, query);
  if (letters) return { tier: 2, bold: letters };
  // Against the label's start, so a typo counts while the member is still typing.
  const length = query.length;
  const typo =
    length >= 3 &&
    [length - 1, length, length + 1].some((end) => withinOneEdit(query, folded.slice(0, end)));
  return typo ? { tier: 3, bold: [] } : null;
}

/** Every option the query matches, by its label or its group's, best match first. */
export function searchOptions(groups: ComboboxGroup[], query: string): SearchResult[] {
  const search = fold(query.trim());
  const found = groups.flatMap((group) => {
    // A group name lists its options on a prefix or substring only, so "fd" can't pull in all of Food.
    const groupMatch = group.label ? match(group.label, search) : null;
    const byGroup = groupMatch && groupMatch.tier <= 1 ? groupMatch : null;
    return group.options.flatMap((option) => {
      const byLabel = match(option.label, search);
      const best = byGroup && (!byLabel || byGroup.tier < byLabel.tier) ? byGroup : byLabel;
      if (!best) return [];
      const result: SearchResult = {
        option,
        group: group.label,
        labelBold: best === byLabel ? best.bold : [],
        groupBold: best === byGroup ? best.bold : [],
      };
      return [{ result, tier: best.tier }];
    });
  });
  // The sort is stable, so equal matches keep their original order.
  return found
    .sort((a, b) => a.tier - b.tier || a.result.option.label.length - b.result.option.label.length)
    .map(({ result }) => result);
}
