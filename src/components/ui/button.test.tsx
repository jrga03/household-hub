import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";

describe("Button", () => {
  it("keeps its slot inside an asChild trigger, so it keeps its touch-target floor", () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" aria-label="About assigning money" />
        </PopoverTrigger>
      </Popover>
    );

    expect(screen.getByRole("button")).toHaveAttribute("data-slot", "button");
  });
});
