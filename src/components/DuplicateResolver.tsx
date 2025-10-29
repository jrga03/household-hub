/**
 * DuplicateResolver Component
 *
 * Displays detected duplicates with side-by-side comparison and resolution options.
 * Features:
 * - Visual comparison of existing vs import data
 * - Three action types: Skip | Keep Both | Replace
 * - Bulk actions for all duplicates
 * - Individual per-duplicate resolution
 *
 * @module components/DuplicateResolver
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatPHP } from "@/lib/currency";
import type { DuplicateMatch, DuplicateAction } from "@/lib/duplicate-detector";

interface DuplicateResolverProps {
  duplicates: DuplicateMatch[];
  onResolve: (actions: Map<number, DuplicateAction>) => void;
  onCancel: () => void;
}

export function DuplicateResolver({ duplicates, onResolve, onCancel }: DuplicateResolverProps) {
  const [actions, setActions] = useState<Map<number, DuplicateAction>>(
    new Map(duplicates.map((d) => [d.importIndex, "skip"]))
  );

  const handleActionChange = (index: number, action: DuplicateAction) => {
    setActions(new Map(actions.set(index, action)));
  };

  const handleBulkAction = (action: DuplicateAction) => {
    const newActions = new Map<number, DuplicateAction>();
    duplicates.forEach((d) => newActions.set(d.importIndex, action));
    setActions(newActions);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Resolve Duplicates ({duplicates.length} found)
        </h2>
        <p className="text-sm text-muted-foreground">
          These transactions match existing records. Choose an action for each.
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => handleBulkAction("skip")}>
          Skip All
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleBulkAction("keep-both")}>
          Keep All
        </Button>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {duplicates.map((match) => (
          <div key={match.importIndex} className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium mb-1">Existing Transaction</p>
                <p>{match.existingTransaction.description}</p>
                <p className="text-muted-foreground">
                  {match.existingTransaction.amount_cents != null &&
                    formatPHP(match.existingTransaction.amount_cents)}{" "}
                  • {match.existingTransaction.date}
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">Import Row #{match.importIndex + 1}</p>
                <p>{match.importRow.description}</p>
                <p className="text-muted-foreground">
                  {match.importRow.amount_cents != null && formatPHP(match.importRow.amount_cents)}{" "}
                  • {match.importRow.date}
                </p>
              </div>
            </div>

            <RadioGroup
              value={actions.get(match.importIndex)}
              onValueChange={(value) =>
                handleActionChange(match.importIndex, value as DuplicateAction)
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="skip" id={`skip-${match.importIndex}`} />
                <Label htmlFor={`skip-${match.importIndex}`}>Skip - Don't import this row</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keep-both" id={`keep-${match.importIndex}`} />
                <Label htmlFor={`keep-${match.importIndex}`}>
                  Keep Both - Import as new transaction
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id={`replace-${match.importIndex}`} />
                <Label htmlFor={`replace-${match.importIndex}`}>
                  Replace - Update existing with import data
                </Label>
              </div>
            </RadioGroup>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onResolve(actions)}>
          Continue with {duplicates.length} resolution(s)
        </Button>
      </div>
    </div>
  );
}
