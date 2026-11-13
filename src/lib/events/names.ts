export const RECORD_NAME_MAX_LENGTH = 40;

export type RecordNoun = "group" | "category" | "payday";

type NameCheck = { name: string; problem: null } | { name: null; problem: string };

/** Validates a group, category or payday name from a form or from another device's event. */
export function checkRecordName(input: unknown, noun: RecordNoun): NameCheck {
  const name = typeof input === "string" ? input.trim() : "";
  if (name === "") return { name: null, problem: `A ${noun} needs a name.` };
  if (name.length > RECORD_NAME_MAX_LENGTH) {
    return {
      name: null,
      problem: `A ${noun} name can be at most ${RECORD_NAME_MAX_LENGTH} characters.`,
    };
  }
  return { name, problem: null };
}

/** The trimmed name, for a command; throws the problem otherwise. */
export function checkedName(input: string, noun: RecordNoun): string {
  const { name, problem } = checkRecordName(input, noun);
  if (problem !== null) throw new Error(problem);
  return name;
}
