import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

describe("TooltipTrigger", () => {
  it("keeps a child button's slot, so the button keeps its touch-target floor", () => {
    render(
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" aria-label="Add and start another" />
        </TooltipTrigger>
        <TooltipContent>Add and start another</TooltipContent>
      </Tooltip>
    );

    expect(screen.getByRole("button")).toHaveAttribute("data-slot", "button");
  });
});
