import { useCallback, useEffect, useRef } from "react";
import { advanceOnEnter } from "@/components/app/FormSheet";

/**
 * A form's `ref`: Enter advances on phones, and after a save leaves a field
 * to fix, focus moves to the first invalid one so its error is read out.
 */
export function useFocusFirstProblem(problems: object) {
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [problems]);
  return useCallback((element: HTMLFormElement | null) => {
    form.current = element;
    return advanceOnEnter(element);
  }, []);
}
