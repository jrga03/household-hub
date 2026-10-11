import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Our own errors carry a message written for people; anything else gets the fallback. */
export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** "1 change" or "3 changes". */
export const countChanges = (count: number) => (count === 1 ? "1 change" : `${count} changes`);
