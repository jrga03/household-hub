import { createFileRoute } from "@tanstack/react-router";
import { useCategoriesGrouped } from "@/lib/supabaseQueries";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { CategoryFormDialog } from "@/components/CategoryFormDialog";

export const Route = createFileRoute("/categories")({
  component: Categories,
});

function Categories() {
  const { data: categories, isLoading } = useCategoriesGrouped();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Categories</h1>
          <Button
            onClick={() => {
              setEditingId(null);
              setDefaultParentId(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {categories && categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No categories yet. Create your first category!</p>
            <Button
              onClick={() => {
                setEditingId(null);
                setDefaultParentId(null);
                setIsFormOpen(true);
              }}
              className="mt-4"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Category
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {categories?.map((parent) => (
              <div
                key={parent.id}
                className="rounded-lg border p-6"
                style={{ borderLeftWidth: "4px", borderLeftColor: parent.color }}
              >
                {/* Parent category header */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{parent.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {parent.children.length} subcategories
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(parent.id);
                      setDefaultParentId(null);
                      setIsFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>

                {/* Child categories */}
                {parent.children.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {parent.children.map((child) => (
                      <div
                        key={child.id}
                        className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => {
                          setEditingId(child.id);
                          setDefaultParentId(null);
                          setIsFormOpen(true);
                        }}
                        style={{ borderLeftWidth: "3px", borderLeftColor: child.color }}
                      >
                        <span className="text-sm font-medium">{child.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add subcategory button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setEditingId(null);
                    setDefaultParentId(parent.id);
                    setIsFormOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Add subcategory
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Category Form Dialog */}
        <CategoryFormDialog
          open={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setEditingId(null);
            setDefaultParentId(null);
          }}
          editingId={editingId}
          defaultParentId={defaultParentId}
        />
      </main>
    </div>
  );
}
