import { X, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useState } from "react";

export function InstallPrompt() {
  const { isInstallable, isInstalled, isIOS, promptInstall, dismissPrompt } = useInstallPrompt();
  const [isOpen, setIsOpen] = useState(false);

  // Don't show if already installed or not installable
  if (isInstalled || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    if (isIOS) {
      // Show instructions for iOS
      setIsOpen(true);
    } else {
      // Trigger native install prompt
      const success = await promptInstall();
      if (success) {
        setIsOpen(false);
      }
    }
  };

  return (
    <>
      {/* Floating install banner with app icon */}
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <img src="/icons/icon-192x192.png" alt="App icon" className="w-12 h-12 rounded-lg" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Install Household Hub
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Install our app for offline access and a better experience
              </p>
              <div className="mt-3 flex space-x-2">
                <Button
                  onClick={handleInstall}
                  size="sm"
                  className="shadow-sm"
                  aria-label="Install Household Hub"
                  data-testid="pwa-install-button"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Install
                </Button>
                <Button
                  onClick={dismissPrompt}
                  size="sm"
                  variant="outline"
                  aria-label="Dismiss install prompt"
                  data-testid="pwa-dismiss-button"
                >
                  Not now
                </Button>
              </div>
            </div>
            <button
              onClick={dismissPrompt}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close install prompt"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Instructions Dialog */}
      {isIOS && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install Household Hub</DialogTitle>
              <DialogDescription>
                Add Household Hub to your home screen for the best experience.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Share className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">1. Tap the Share button</p>
                  <p className="text-sm text-muted-foreground">
                    Located at the bottom of the Safari browser
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-medium">+</span>
                </div>
                <div>
                  <p className="font-medium">
                    2. Tap{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">Add to Home Screen</code>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Scroll down in the share menu to find this option
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-sm font-medium">✓</span>
                </div>
                <div>
                  <p className="font-medium">
                    3. Tap <code className="text-xs bg-muted px-1 py-0.5 rounded">Add</code>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The app icon will appear on your home screen
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={() => setIsOpen(false)} className="w-full">
              Got it
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
