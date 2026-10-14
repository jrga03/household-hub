import { describe, expect, it } from "vitest";
import { useActionState, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";
import { ActionForm } from "./action-form";

function FruitForm({ save }: { save: (formData: FormData) => Promise<string | null> }) {
  const [fruit, setFruit] = useState("apple");
  const [error, saveAction] = useActionState(
    (_previous: string | null, formData: FormData) => save(formData),
    null
  );
  return (
    <ActionForm action={saveAction} aria-label="Fruit order">
      <label htmlFor="fruit">Fruit</label>
      <Select name="fruit" value={fruit} onValueChange={setFruit}>
        <SelectTrigger id="fruit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
      <label htmlFor="count">Count</label>
      <Input id="count" name="count" defaultValue="1" />
      <p>Chosen: {fruit}</p>
      <FormError>{error}</FormError>
      <SubmitButton pendingText="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}

async function chooseBanana() {
  fireEvent.keyDown(screen.getByLabelText("Fruit"), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: "Banana" }), { key: "Enter" });
}

describe("ActionForm", () => {
  it("keeps every field, and the parent's state, after a failed save", async () => {
    const submitted: FormData[] = [];
    render(
      <FruitForm
        save={(formData) => {
          submitted.push(formData);
          return Promise.resolve("Not enough fruit.");
        }}
      />
    );

    await chooseBanana();
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not enough fruit.");
    expect(screen.getByLabelText("Fruit")).toHaveTextContent("Banana");
    expect(screen.getByText("Chosen: banana")).toBeInTheDocument();
    expect(screen.getByLabelText("Count")).toHaveValue("7");
    expect(submitted[0]?.get("fruit")).toBe("banana");
    expect(submitted[0]?.get("count")).toBe("7");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Save" });
    expect(submitted).toHaveLength(2);
    expect(submitted[1]?.get("fruit")).toBe("banana");
  });

  it("shows the submit button as pending until the action settles", async () => {
    let settle: (error: string | null) => void = () => {};
    render(
      <FruitForm
        save={() =>
          new Promise((resolve) => {
            settle = resolve;
          })
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    settle(null);
    expect(await screen.findByRole("button", { name: "Save" })).toBeEnabled();
  });
});
