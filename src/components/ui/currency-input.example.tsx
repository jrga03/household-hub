// Manual testing helper for CurrencyInput component
// This is NOT an automated test - rename to .example.tsx to avoid confusion
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CurrencyInput } from "./currency-input";
import { Button } from "./button";

const schema = z.object({
  amount: z.number().min(1, "Amount must be greater than 0").max(999999999, "Amount too large"),
});

type FormData = z.infer<typeof schema>;

export function CurrencyInputExample() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
    },
  });

  const onSubmit = (data: FormData) => {
    console.log("Amount in cents:", data.amount);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="amount" className="text-sm font-medium">
          Amount
        </label>
        <Controller
          name="amount"
          control={form.control}
          render={({ field, fieldState }) => (
            <CurrencyInput id="amount" {...field} error={fieldState.error?.message} />
          )}
        />
      </div>

      <Button type="submit">Submit</Button>

      <div className="text-sm text-muted-foreground">
        Current value: {form.watch("amount")} cents
      </div>
    </form>
  );
}
