import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreateExternalDebtForm,
  EditExternalDebtForm,
  CreateInternalDebtForm,
} from "@/components/debts/forms";

export default function FormsDemo() {
  // Mock data for testing
  const mockDebt = {
    id: "1",
    name: "Car Loan",
    original_amount_cents: 100000,
    status: "active" as const,
    household_id: "h1",
    created_at: "2025-11-01",
    updated_at: "2025-11-01",
  };

  const mockUsers = [
    { id: "user-1", name: "Alice" },
    { id: "user-2", name: "Bob" },
    { id: "user-3", name: "Charlie" },
  ];

  const mockAccounts = [
    { id: "acc-1", name: "Cash" },
    { id: "acc-2", name: "Bank" },
    { id: "acc-3", name: "Savings" },
  ];

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-3xl font-bold mb-6">Debt Forms Demo (D8)</h1>

      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          This is a demo page for testing debt forms from chunk D8. Forms should validate inputs,
          show proper error messages, and handle currency formatting.
        </p>
      </div>

      <Tabs defaultValue="create-external">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create-external">Create External</TabsTrigger>
          <TabsTrigger value="edit-external">Edit External</TabsTrigger>
          <TabsTrigger value="create-internal">Create Internal</TabsTrigger>
        </TabsList>

        <TabsContent value="create-external" className="mt-6">
          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-xl font-semibold mb-4">Create External Debt</h2>
            <CreateExternalDebtForm
              householdId="h1"
              onSuccess={(id) => {
                console.log("Created debt with ID:", id);
                alert(`Success! Created debt with ID: ${id}`);
              }}
              onCancel={() => console.log("Cancelled")}
            />
          </div>
        </TabsContent>

        <TabsContent value="edit-external" className="mt-6">
          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-xl font-semibold mb-4">Edit External Debt</h2>
            <EditExternalDebtForm
              debt={mockDebt}
              onSuccess={() => {
                console.log("Updated debt");
                alert("Success! Debt updated");
              }}
              onCancel={() => console.log("Cancelled")}
              onArchive={() => {
                console.log("Archived debt");
                alert("Success! Debt archived");
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="create-internal" className="mt-6">
          <div className="border rounded-lg p-6 bg-white">
            <h2 className="text-xl font-semibold mb-4">Create Internal Debt (IOU)</h2>
            <CreateInternalDebtForm
              householdId="h1"
              users={mockUsers}
              accounts={mockAccounts}
              onSuccess={(id) => {
                console.log("Created internal debt with ID:", id);
                alert(`Success! Created internal debt with ID: ${id}`);
              }}
              onCancel={() => console.log("Cancelled")}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Testing Instructions:</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>Test empty field validation - submit with empty fields</li>
          <li>Test currency input - try various formats: "1500", "₱1,500.50"</li>
          <li>Test name length limits - enter very long names</li>
          <li>Test amount limits - try ₱0.50 (too low) and ₱1,000,000,000 (too high)</li>
          <li>For internal debts, verify From and To must be different</li>
          <li>Check loading states by clicking submit</li>
          <li>Verify keyboard navigation works (Tab through fields)</li>
        </ul>
      </div>
    </div>
  );
}
