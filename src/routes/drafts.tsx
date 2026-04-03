/**
 * Drafts Route - /drafts
 *
 * Review and manage imported draft transactions before promoting them
 * to real transactions. Supports inline editing, bulk confirm, and discard.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Check, CheckCheck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { db } from "@/lib/dexie/db";
import { getPendingDrafts, updateDraft, discardDraft, confirmDrafts } from "@/lib/import-drafts";
import { formatPHP } from "@/lib/currency";
import { useAuthStore } from "@/stores/authStore";
import type { ImportDraft } from "@/types/pdf-import";

export const Route = createFileRoute("/drafts")({
  component: DraftsPage,
});

function DraftsPage() {
  const user = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ImportDraft>>({});
  const [isConfirming, setIsConfirming] = useState(false);

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

  const saveEdit = async () => {
    if (!editingId) return;
    await updateDraft(editingId, editValues);
    setEditingId(null);
    setEditValues({});
    toast.success("Draft updated");
  };

  const handleDiscard = async (id: string) => {
    await discardDraft(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success("Draft discarded");
  };

  const handleDiscardSelected = async () => {
    const count = selected.size;
    for (const id of selected) {
      await discardDraft(id);
    }
    setSelected(new Set());
    toast.success(`${count} draft${count !== 1 ? "s" : ""} discarded`);
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading drafts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background">
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

            {/* Drafts table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selected.size === drafts.length}
                        onCheckedChange={toggleSelectAll}
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

                    return (
                      <TableRow key={draft.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(draft.id)}
                            onCheckedChange={() => toggleSelect(draft.id)}
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
                              <Button size="sm" variant="ghost" onClick={saveEdit}>
                                <Check className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="whitespace-nowrap">{draft.date}</TableCell>
                            <TableCell className="max-w-48 truncate">{draft.description}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {formatPHP(draft.amount_cents)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={draft.type === "expense" ? "destructive" : "default"}>
                                {draft.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm">
                              {account?.name || "-"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              -
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
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleConfirm([draft.id])}
                                  disabled={isConfirming}
                                  title="Confirm"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(draft)}
                                  title="Edit"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDiscard(draft.id)}
                                  title="Discard"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
