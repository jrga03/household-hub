import { useState } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCloseWhenGone } from "./useCloseWhenGone";

function useEditor({ items }: { items: string[] | undefined }) {
  const [openId, setOpenId] = useState<string | null>("market");
  const open = items?.find((id) => id === openId);
  useCloseWhenGone(openId, items && (open ?? null), () => setOpenId(null));
  return openId;
}

describe("useCloseWhenGone", () => {
  it("keeps the editor open while the items load and while its item is there", () => {
    const { result, rerender } = renderHook(useEditor, {
      initialProps: { items: undefined as string[] | undefined },
    });
    expect(result.current).toBe("market");

    rerender({ items: ["market", "bakery"] });
    expect(result.current).toBe("market");
  });

  it("closes once the item is gone, and a restore doesn't reopen it", () => {
    const { result, rerender } = renderHook(useEditor, {
      initialProps: { items: ["market"] as string[] | undefined },
    });

    rerender({ items: ["bakery"] });
    expect(result.current).toBeNull();

    rerender({ items: ["market", "bakery"] });
    expect(result.current).toBeNull();
  });
});
