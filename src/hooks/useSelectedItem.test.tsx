import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSelectedItem } from "./useSelectedItem";

const mockNavigate = vi.fn();
let mockSearch: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch,
}));

describe("useSelectedItem", () => {
  beforeEach(() => {
    mockSearch = {};
    mockNavigate.mockClear();
  });

  it("returns null when no selection in URL", () => {
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    expect(result.current.selectedId).toBeNull();
  });

  it("returns selected id from URL", () => {
    mockSearch = { selected: "abc-123" };
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    expect(result.current.selectedId).toBe("abc-123");
  });

  it("calls navigate with new selection when select() called", () => {
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    act(() => result.current.select("xyz-999"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.any(Function),
      })
    );
  });

  it("clears selection when clear() called", () => {
    mockSearch = { selected: "abc-123" };
    const { result } = renderHook(() => useSelectedItem({ paramKey: "selected" }));
    act(() => result.current.clear());
    expect(mockNavigate).toHaveBeenCalled();
  });
});
