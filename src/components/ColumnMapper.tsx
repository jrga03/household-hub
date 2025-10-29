/**
 * ColumnMapper Component
 *
 * Allows users to map CSV columns to transaction fields.
 * Features:
 * - Auto-detection with confidence scores
 * - Manual override via dropdowns
 * - Live preview of mapped data
 * - Required field validation
 *
 * @module components/ColumnMapper
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnMapping } from "@/lib/csv-importer";

interface ColumnMapperProps {
  headers: string[];
  sampleRows: string[][];
  initialMapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

const FIELDS = [
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "date", label: "Date", required: true },
  { key: "account", label: "Account", required: false },
  { key: "category", label: "Category", required: false },
  { key: "type", label: "Type", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "status", label: "Status", required: false },
  { key: "created_at", label: "Created At", required: false }, // Round-Trip Guarantee
  { key: "created_by", label: "Created By", required: false }, // Round-Trip Guarantee
] as const;

export function ColumnMapper({
  headers,
  sampleRows,
  initialMapping,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  const handleFieldChange = (field: keyof ColumnMapping, columnIndex: string) => {
    setMapping({
      ...mapping,
      [field]: columnIndex === "none" ? null : parseInt(columnIndex),
    });
  };

  const isValid = mapping.description !== null && mapping.amount !== null && mapping.date !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Map Columns</h2>
        <p className="text-sm text-muted-foreground">
          Match your CSV columns to transaction fields. Required fields are marked with *.
        </p>
      </div>

      <div className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="grid grid-cols-[200px_1fr] gap-4 items-center">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            <Select
              value={mapping[field.key]?.toString() || "none"}
              onValueChange={(value) => handleFieldChange(field.key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not mapped</SelectItem>
                {headers.map((header, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {header} (Column {index + 1})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Preview</h3>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {FIELDS.filter((f) => mapping[f.key] !== null).map((field) => (
                  <th key={field.key} className="px-3 py-2 text-left font-medium">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-b">
                  {FIELDS.filter((f) => mapping[f.key] !== null).map((field) => (
                    <td key={field.key} className="px-3 py-2">
                      {mapping[field.key] !== null ? row[mapping[field.key]!] : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Showing first 3 rows as preview</p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(mapping)} disabled={!isValid}>
          Continue
        </Button>
      </div>
    </div>
  );
}
