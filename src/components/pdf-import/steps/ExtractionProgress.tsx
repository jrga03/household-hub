/**
 * Extraction Progress Step - Shows PDF processing progress with cancel option
 */

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ExtractionProgressProps {
  progress: { current: number; total: number } | null;
  onCancel: () => void;
}

export function ExtractionProgress({ progress, onCancel }: ExtractionProgressProps) {
  const percent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Extracting Text
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percent} />
        <p className="text-center text-sm text-muted-foreground">
          {progress ? `Page ${progress.current} of ${progress.total}` : "Initializing..."}
        </p>
        <Button variant="outline" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </CardContent>
    </Card>
  );
}
