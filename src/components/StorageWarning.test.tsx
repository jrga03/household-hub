import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useStorageQuota } from "@/hooks/useStorageQuota";
import { StorageWarning } from "./StorageWarning";

vi.mock("@/hooks/useStorageQuota", () => ({ useStorageQuota: vi.fn() }));

const MB = 1024 * 1024;
const useQuota = (percentage: number) =>
  vi.mocked(useStorageQuota).mockReturnValue({
    usage: percentage * MB,
    quota: 100 * MB,
    percentage,
    available: percentage < 95,
  });

describe("StorageWarning", () => {
  it("stays hidden below 80% of the storage quota", () => {
    useQuota(79);
    const { container } = render(<StorageWarning />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns how much storage is used from 80%", () => {
    useQuota(85);
    render(<StorageWarning />);

    const note = screen.getByRole("note", { name: "Storage is running low" });
    expect(note).toHaveTextContent("Using 85.0 MB of 100.0 MB (85%).");
  });

  it("asks to free space once storage is almost full, still as a warning", () => {
    useQuota(97);
    render(<StorageWarning />);

    const note = screen.getByRole("note", { name: "Storage is almost full" });
    expect(note).toHaveTextContent("Export your data or remove old records to free space.");
  });
});
