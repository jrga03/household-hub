/**
 * Bank Selection Step - Choose which bank parser to use
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePDFImportStore } from "@/stores/pdfImportStore";
import { PARSER_REGISTRY } from "@/lib/pdf-parsers";

export function BankSelectStep() {
  const { selectedBankId, setSelectedBankId, setStep } = usePDFImportStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Bank</CardTitle>
        <CardDescription>Choose the bank that issued this statement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={selectedBankId || ""} onValueChange={setSelectedBankId}>
          {PARSER_REGISTRY.map((parser) => (
            <div key={parser.id} className="flex items-center space-x-3 rounded-lg border p-3">
              <RadioGroupItem value={parser.id} id={parser.id} />
              <Label htmlFor={parser.id} className="flex-1 cursor-pointer font-medium">
                {parser.label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {PARSER_REGISTRY.length === 0 && (
          <p className="text-sm text-muted-foreground">No bank parsers are available yet.</p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("upload")}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedBankId}
            onClick={() => setStep("extracting")}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
