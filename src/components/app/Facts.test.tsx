import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Fact, Facts } from "./Facts";

describe("Facts", () => {
  it("pairs each term with its value", () => {
    render(
      <Facts>
        <Fact term="Account">BPI</Fact>
        <Fact term="Status">Cleared</Fact>
      </Facts>
    );

    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Account",
      "Status",
    ]);
    expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "BPI",
      "Cleared",
    ]);
  });
});
