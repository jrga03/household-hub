import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, X } from "lucide-react";
import { useServiceWorker } from "@/hooks/useServiceWorker";

/**
 * UpdatePrompt component displays a notification when a new version of the app is available
 *
 * Features:
 * - Fixed bottom position with responsive width
 * - Allows user to reload the app immediately or dismiss the prompt
 * - Uses shadcn/ui Alert component for consistent styling
 */
export function UpdatePrompt() {
  const { needRefresh, update, dismiss } = useServiceWorker();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:w-96">
      <Alert>
        <Download className="h-4 w-4" />
        <AlertTitle>Update Available</AlertTitle>
        <AlertDescription>
          A new version of Household Hub is ready. Reload to get the latest features and fixes.
        </AlertDescription>
        <div className="mt-4 flex gap-2">
          <Button onClick={update} size="sm" className="flex-1">
            Reload Now
          </Button>
          <Button onClick={dismiss} size="sm" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}
