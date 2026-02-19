/**
 * Account Mapping Step - Select which account to assign imported transactions to
 */

import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePDFImportStore } from "@/stores/pdfImportStore";
import { db } from "@/lib/dexie/db";

export function AccountMapStep() {
  const { selectedAccountId, setSelectedAccountId, setStep } = usePDFImportStore();

  const accounts = useLiveQuery(() => db.accounts.filter((a) => a.is_active).sortBy("name"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Account</CardTitle>
        <CardDescription>Choose which account these transactions belong to.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!accounts ? (
          <p className="text-sm text-muted-foreground">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accounts found. Please create an account first.
          </p>
        ) : (
          <RadioGroup value={selectedAccountId || ""} onValueChange={setSelectedAccountId}>
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center space-x-3 rounded-lg border p-3">
                <RadioGroupItem value={account.id} id={`account-${account.id}`} />
                <Label
                  htmlFor={`account-${account.id}`}
                  className="flex flex-1 cursor-pointer items-center gap-2"
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: account.color }}
                  />
                  <span className="font-medium">{account.name}</span>
                  <span className="text-sm text-muted-foreground">({account.type})</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("preview")}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedAccountId}
            onClick={() => setStep("duplicates")}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
