import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getDeviceId, clearDeviceId, hasDeviceId } from "@/lib/dexie/deviceManager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/test-device")({
  component: TestDevice,
});

function TestDevice() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceExists, setDeviceExists] = useState(false);

  const loadDeviceInfo = async () => {
    const id = await getDeviceId();
    setDeviceId(id);
    setDeviceExists(hasDeviceId());
  };

  const clearDevice = async () => {
    await clearDeviceId();
    setDeviceId(null);
    setDeviceExists(false);
  };

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  return (
    <div className="container mx-auto max-w-2xl py-12 space-y-6">
      <h1 className="text-3xl font-bold">Device ID Test</h1>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Device Information</h2>

        {deviceId ? (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium">Device ID:</span>
              <code className="text-xs bg-gray-100 p-1 rounded break-all">{deviceId}</code>

              <span className="font-medium">Has Device ID:</span>
              <span>{deviceExists ? "Yes" : "No"}</span>

              <span className="font-medium">Format:</span>
              <span>{deviceId.includes("-") ? "UUID v4" : "FingerprintJS Hash"}</span>
            </div>
          </div>
        ) : (
          <p>Loading...</p>
        )}

        <div className="flex gap-2 mt-4">
          <Button onClick={loadDeviceInfo}>Refresh</Button>
          <Button onClick={clearDevice} variant="destructive">
            Clear Device ID
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-2">Test Instructions</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Note your Device ID</li>
          <li>Refresh the page - Device ID should stay the same</li>
          <li>
            Open DevTools and clear IndexedDB - Device ID should still persist (localStorage backup)
          </li>
          <li>Clear localStorage too - Device ID should regenerate from fingerprint</li>
          <li>Click "Clear Device ID" - New device ID generated</li>
        </ol>
      </Card>
    </div>
  );
}
