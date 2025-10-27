/**
 * Budget Hooks
 *
 * Wrapper exports for budget CRUD operations from supabaseQueries.
 * This file exists to match chunk 016's modular hook structure while
 * maintaining the existing centralized implementation.
 *
 * For implementation details, see src/lib/supabaseQueries.ts
 */

export {
  useBudgets,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useCopyBudgets,
  type Budget,
  type BudgetGroup,
} from "@/lib/supabaseQueries";
