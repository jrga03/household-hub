import { createContext, use, useTransition, type ComponentProps, type FormEvent } from "react";

const PendingContext = createContext(false);

/** Whether the surrounding `ActionForm` is still running its action. */
export function useActionFormPending() {
  return use(PendingContext);
}

/**
 * A form that runs a `useActionState` dispatcher without React's automatic
 * reset, so a failed save keeps what the person entered. The reset would also
 * send each Radix Select back to its first value through `onValueChange`.
 */
export function ActionForm({
  action,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
}) {
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };

  return (
    <PendingContext value={pending}>
      <form {...props} onSubmit={submit} />
    </PendingContext>
  );
}
