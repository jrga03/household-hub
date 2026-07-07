/**
 * Drafts Route - /drafts
 *
 * Review and manage imported draft transactions before promoting them
 * to real transactions. Wide containers get a table with inline editing;
 * narrow containers get a stacked card list with a bottom-Sheet editor
 * exposing the full field set (review R36). Supports bulk confirm/discard
 * in both presentations.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LoadingSpinner } from "@/components/LoadingScreen";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Check, CheckCheck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { db } from "@/lib/dexie/db";
import {
  getPendingDrafts,
  updateDraft,
  discardDraft,
  restoreDraft,
  restoreDrafts,
  confirmDrafts,
  resolveCategoryName,
} from "@/lib/import-drafts";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useContainerNarrow } from "@/hooks/useContainerWidth";
import { useAuthStore } from "@/stores/authStore";
import type { ImportDraft } from "@/types/pdf-import";

export const Route = createFileRoute("/drafts")({
  component: DraftsPage,
});

/**
 * Confirm / Edit / Discard icon actions for one draft.
 * Shared by the wide table rows and the narrow card list so aria-labels and
 * the Undo-discard toast flow stay identical in both presentations.
 */
function DraftActions({
  draft,
  isConfirming,
  onConfirm,
  onEdit,
  onDiscard,
}: {
  draft: ImportDraft;
  isConfirming: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={onConfirm}
        disabled={isConfirming}
        aria-label={`Confirm draft ${draft.description}`}
      >
        <Check className="h-3 w-3" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        aria-label={`Edit draft ${draft.description}`}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDiscard}
        aria-label={`Discard draft ${draft.description}`}
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}

function DraftsPage() {
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ImportDraft>>({});
  const [isConfirming, setIsConfirming] = useState(false);

  // Below 768px of PAGE width (the table's md: column-hiding threshold) the
  // table is replaced by a stacked card list, and editing moves to a bottom
  // Sheet with the full field set — the table's inline Account/Category
  // selects live in hidden md:table-cell cells and are unreachable on phones
  // (review R36). Measured on the page region, not the viewport, so the
  // layout reacts to the space the route actually gets (review UI-05).
  const [regionRef, isNarrow] = useContainerNarrow(768);

  const drafts = useLiveQuery(() => getPendingDrafts());
  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).sortBy("name"));
  const categories = useLiveQuery(() => db.categories.filter((c) => c.is_active).sortBy("name"));

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (!drafts) return;
    if (selected.size === drafts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(drafts.map((d) => d.id)));
    }
  };

  const startEditing = (draft: ImportDraft) => {
    setEditingId(draft.id);
    setEditValues({
      date: draft.date,
      description: draft.description,
      amount_cents: draft.amount_cents,
      type: draft.type,
      account_id: draft.account_id,
      category_id: draft.category_id,
    });
  };

  // Single save path for BOTH the table's inline edit and the narrow bottom
  // Sheet: same editValues state, same updateDraft call (review R36).
  const saveEdit = async () => {
    if (!editingId) return;
    await updateDraft(editingId, editValues);
    setEditingId(null);
    setEditValues({});
    toast.success("Draft updated");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const handleDiscard = async (id: string) => {
    await discardDraft(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Discard is a soft status flip, so Undo just restores the draft to
    // "pending" and decrements the session's discarded counter (review R2).
    toast.success("Draft discarded", {
      action: {
        label: "Undo",
        onClick: () => void restoreDraft(id),
      },
    });
  };

  const handleDiscardSelected = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await discardDraft(id);
    }
    setSelected(new Set());
    toast.success(`${ids.length} draft${ids.length !== 1 ? "s" : ""} discarded`, {
      action: {
        label: "Undo",
        onClick: () => void restoreDrafts(ids),
      },
    });
  };

  const handleConfirm = async (ids: string[]) => {
    if (!user?.id) return;
    setIsConfirming(true);
    try {
      const result = await confirmDrafts(ids, user.id);
      if (result.success) {
        toast.success(
          `${result.confirmed} transaction${result.confirmed !== 1 ? "s" : ""} created`
        );
        setSelected(new Set());
      } else {
        toast.error(result.error || "Failed to confirm drafts");
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmSelected = () => handleConfirm(Array.from(selected));
  const handleConfirmAll = () => {
    if (!drafts) return;
    handleConfirm(drafts.map((d) => d.id));
  };

  if (!drafts) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <LoadingSpinner size="large" className="text-primary" label="Loading drafts" />
          {/* Visible text hidden from screen readers so the spinner's status
              announcement isn't duplicated (review R41) */}
          <p className="mt-4 text-sm text-muted-foreground" aria-hidden="true">
            Loading drafts...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={regionRef} className="bg-background">
      {/* Page Header */}
      <div className="border-b">
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileText className="h-5 w-5" />
            Import Drafts
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and confirm imported transactions before they become real.
          </p>
        </div>
      </div>

      <main className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
        {drafts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-medium">No Pending Drafts</h3>
              <p className="text-sm text-muted-foreground">
                Import a PDF statement to create draft transactions for review.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Bulk actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {drafts.length} Draft{drafts.length !== 1 ? "s" : ""} Pending
                </CardTitle>
                <CardDescription>
                  {selected.size > 0
                    ? `${selected.size} selected`
                    : "Select drafts or use bulk actions"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleConfirmAll} disabled={isConfirming}>
                    <CheckCheck className="mr-1 h-4 w-4" />
                    Confirm All
                  </Button>
                  {selected.size > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleConfirmSelected}
                        disabled={isConfirming}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Confirm Selected ({selected.size})
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleDiscardSelected}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Discard Selected
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {isNarrow ? (
              /* Stacked card list: the table's Account/Category cells are
                 md:-hidden, so narrow containers get cards instead (R36). */
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Checkbox
                    id="drafts-select-all"
                    checked={selected.size === drafts.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all drafts"
                  />
                  <Label
                    htmlFor="drafts-select-all"
                    className="text-sm font-normal text-muted-foreground"
                  >
                    Select all
                  </Label>
                </div>

                {drafts.map((draft) => {
                  const account = accounts?.find((a) => a.id === draft.account_id);
                  const categoryName = resolveCategoryName(draft.category_id, categories);

                  return (
                    <Card key={draft.id} className="gap-0 py-4">
                      <CardContent className="flex items-start gap-3 px-4">
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(draft.id)}
                          onCheckedChange={() => toggleSelect(draft.id)}
                          aria-label={`Select draft ${draft.description}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium">
                              {draft.description}
                            </p>
                            <span
                              className={cn(
                                "whitespace-nowrap text-sm font-medium",
                                draft.type === "income" ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {draft.type === "income" ? "+" : "-"}
                              {formatPHP(draft.amount_cents)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{draft.date}</span>
                            <span aria-hidden="true">·</span>
                            <span>{account?.name || "No account"}</span>
                            <span aria-hidden="true">·</span>
                            {categoryName ? (
                              <span>{categoryName}</span>
                            ) : (
                              <span className="italic">Uncategorized</span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Badge variant="outline" className="capitalize">
                              {draft.draft_status}
                            </Badge>
                            <DraftActions
                              draft={draft}
                              isConfirming={isConfirming}
                              onConfirm={() => handleConfirm([draft.id])}
                              onEdit={() => startEditing(draft)}
                              onDiscard={() => handleDiscard(draft.id)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* Drafts table */
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selected.size === drafts.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all drafts"
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden md:table-cell">Account</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="hidden lg:table-cell w-20">Confidence</TableHead>
                      <TableHead className="hidden lg:table-cell">Source</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((draft) => {
                      const isEditing = editingId === draft.id;
                      const account = accounts?.find((a) => a.id === draft.account_id);
                      const categoryName = resolveCategoryName(draft.category_id, categories);

                      return (
                        <TableRow key={draft.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(draft.id)}
                              onCheckedChange={() => toggleSelect(draft.id)}
                              aria-label={`Select draft ${draft.description}`}
                            />
                          </TableCell>

                          {isEditing ? (
                            <>
                              <TableCell>
                                <Input
                                  className="h-8 w-28"
                                  value={editValues.date || ""}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, date: e.target.value }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  className="h-8"
                                  value={editValues.description || ""}
                                  onChange={(e) =>
                                    setEditValues((v) => ({ ...v, description: e.target.value }))
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  className="h-8 w-28 text-right"
                                  type="number"
                                  value={(editValues.amount_cents || 0) / 100}
                                  onChange={(e) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      amount_cents: Math.round(Number(e.target.value) * 100),
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={editValues.type || "expense"}
                                  onValueChange={(val) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      type: val as "income" | "expense",
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="expense">Expense</SelectItem>
                                    <SelectItem value="income">Income</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Select
                                  value={editValues.account_id || ""}
                                  onValueChange={(val) =>
                                    setEditValues((v) => ({ ...v, account_id: val }))
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {accounts?.map((a) => (
                                      <SelectItem key={a.id} value={a.id}>
                                        {a.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Select
                                  value={editValues.category_id || "none"}
                                  onValueChange={(val) =>
                                    setEditValues((v) => ({
                                      ...v,
                                      category_id: val === "none" ? undefined : val,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="None" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {categories?.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell" />
                              <TableCell className="hidden lg:table-cell" />
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={saveEdit}
                                  aria-label="Save draft changes"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="whitespace-nowrap">{draft.date}</TableCell>
                              <TableCell className="max-w-48 truncate">
                                {draft.description}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {formatPHP(draft.amount_cents)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={draft.type === "expense" ? "destructive" : "default"}
                                >
                                  {draft.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">
                                {account?.name || "-"}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm">
                                {categoryName ?? (
                                  <span className="text-muted-foreground">Uncategorized</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {draft.parsed_confidence >= 0.9 ? (
                                  <Badge variant="outline" className="text-green-600">
                                    High
                                  </Badge>
                                ) : draft.parsed_confidence >= 0.7 ? (
                                  <Badge variant="outline">
                                    {Math.round(draft.parsed_confidence * 100)}%
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-yellow-600">
                                    Low
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell max-w-24 truncate text-xs text-muted-foreground">
                                {draft.source_file_name}
                              </TableCell>
                              <TableCell>
                                <DraftActions
                                  draft={draft}
                                  isConfirming={isConfirming}
                                  onConfirm={() => handleConfirm([draft.id])}
                                  onEdit={() => startEditing(draft)}
                                  onDiscard={() => handleDiscard(draft.id)}
                                />
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </main>

      {/* Narrow edit: bottom Sheet with the FULL field set — the table's
          inline subset hides Account/Category below md (review R36). Shares
          editValues/saveEdit with the table's inline edit path. */}
      <Sheet
        open={isNarrow && editingId !== null}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Edit Draft</SheetTitle>
            <SheetDescription>
              Correct the imported details before confirming this draft.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-description">Description</Label>
              <Input
                id="draft-edit-description"
                value={editValues.description || ""}
                onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-amount">Amount</Label>
              <CurrencyInput
                id="draft-edit-amount"
                value={editValues.amount_cents ?? 0}
                onChange={(cents) => setEditValues((v) => ({ ...v, amount_cents: cents }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-date">Date</Label>
              <Input
                id="draft-edit-date"
                type="date"
                value={editValues.date || ""}
                onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-type">Type</Label>
              <Select
                value={editValues.type || "expense"}
                onValueChange={(val) =>
                  setEditValues((v) => ({ ...v, type: val as "income" | "expense" }))
                }
              >
                <SelectTrigger id="draft-edit-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-account">Account</Label>
              <Select
                value={editValues.account_id || ""}
                onValueChange={(val) => setEditValues((v) => ({ ...v, account_id: val }))}
              >
                <SelectTrigger id="draft-edit-account" className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-edit-category">Category</Label>
              <Select
                value={editValues.category_id || "none"}
                onValueChange={(val) =>
                  setEditValues((v) => ({
                    ...v,
                    category_id: val === "none" ? undefined : val,
                  }))
                }
              >
                <SelectTrigger id="draft-edit-category" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sticky footer inside the Sheet's scroll container
                (TransactionFormDialog mobile pattern, review R5). */}
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background px-4 pt-4 pb-[calc(1rem+var(--safe-area-bottom))]">
              <Button type="button" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEdit()}>
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
