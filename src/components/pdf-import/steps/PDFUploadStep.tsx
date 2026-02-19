/**
 * PDF Upload Step - Drag-and-drop file picker with password support
 */

import { useCallback, useRef } from "react";
import { Upload, Lock, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { usePDFImportStore } from "@/stores/pdfImportStore";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function PDFUploadStep() {
  const { file, setFile, password, setPassword, needsPassword, setStep } = usePDFImportStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error("File exceeds 50MB limit");
        return;
      }
      if (f.type !== "application/pdf" && !f.name.endsWith(".pdf")) {
        toast.error("Only PDF files are supported");
        return;
      }
      setFile(f);
    },
    [setFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload PDF Statement</CardTitle>
          <CardDescription>
            Upload your bank statement PDF. Password-protected files are supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />

            {file ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Drop PDF here or click to browse</p>
                <p className="text-sm text-muted-foreground">Max 50MB, PDF files only</p>
              </>
            )}
          </div>

          {/* Password input */}
          {needsPassword && (
            <div className="space-y-2">
              <Label htmlFor="pdf-password">
                <Lock className="mr-1 inline-block h-4 w-4" />
                PDF Password
              </Label>
              <Input
                id="pdf-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter PDF password"
              />
            </div>
          )}

          <Button className="w-full" disabled={!file} onClick={() => setStep("bank")}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
