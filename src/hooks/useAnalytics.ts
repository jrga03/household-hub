import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { startOfMonth, subYears, format, differenceInDays } from "date-fns";

// Types for analytics data
interface Transaction {
  id: string;
  date: string;
  type: "income" | "expense";
  amount_cents: number;
  category_id: string;
  account_id: string;
  description: string;
  categories?: { name: string };
}

interface MonthlyTrendData {
  month: string;
  income: number; // in cents
  expenses: number; // in cents
}

interface CategoryBreakdown {
  name: string;
  value: number; // in pesos (for Recharts)
}

interface BudgetVariance {
  category: string;
  budgetAmount: number; // in cents
  actualAmount: number; // in cents
  variance: number; // in cents (positive = under budget)
  percentUsed: number; // 0-100
}

interface YearOverYear {
  currentYear: {
    income: number; // in cents
    expenses: number; // in cents
  };
  previousYear: {
    income: number; // in cents
    expenses: number; // in cents
  };
  change: {
    income: number; // in cents
    expenses: number; // in cents
  };
  percentChange: {
    income: number; // percentage
    expenses: number; // percentage
  };
}

interface Insights {
  avgMonthlySpending: number; // in cents
  largestTransactions: Array<{
    description: string;
    amount: number; // in cents
    date: string;
  }>;
  topCategories: Array<{
    name: string;
    amount: number; // in cents
  }>;
}

interface AnalyticsData {
  monthlyTrend: MonthlyTrendData[];
  categoryBreakdown: CategoryBreakdown[];
  totalIncome: number; // in cents
  totalExpenses: number; // in cents
  budgetVariance: BudgetVariance[];
  yearOverYear: YearOverYear;
  insights: Insights;
}

interface AnalyticsFilters {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
}

/**
 * Analytics hook for financial insights
 *
 * @param startDate - Start date for analytics period
 * @param endDate - End date for analytics period
 * @param filters - Optional filters (accountId, categoryId, type)
 * @returns TanStack Query result with AnalyticsData
 *
 * CRITICAL: All queries exclude transfers using .is('transfer_group_id', null)
 * to prevent double-counting account movements as income/expenses.
 */
export function useAnalytics(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: [
      "analytics",
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      filters,
    ],
    queryFn: async (): Promise<AnalyticsData> => {
      // Base query with transfer exclusion
      let query = supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .lte("date", format(endDate, "yyyy-MM-dd"))
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers!

      // Apply filters
      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }
      if (filters?.categoryId) {
        query = query.eq("category_id", filters.categoryId);
      }
      if (filters?.type) {
        query = query.eq("type", filters.type);
      }

      const { data: transactionData, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // Fetch budget data for variance (raw data for all months in period)
      const { data: rawBudgets, error: budgetError } = await supabase
        .from("budgets")
        .select("category_id, amount_cents, categories(name)")
        .gte("month", format(startOfMonth(startDate), "yyyy-MM-dd"))
        .lte("month", format(startOfMonth(endDate), "yyyy-MM-dd"));

      if (budgetError) {
        console.warn("Failed to fetch budgets:", budgetError);
      }

      // Aggregate budgets by category (sum across all months in period)
      const budgetsByCategory: Record<string, { total: number; name: string }> = {};
      (rawBudgets || []).forEach((budget) => {
        const categoryData = budget.categories as { name: string } | { name: string }[] | null;
        const categoryName = Array.isArray(categoryData)
          ? categoryData[0]?.name
          : categoryData?.name || "Uncategorized";
        if (!budgetsByCategory[budget.category_id]) {
          budgetsByCategory[budget.category_id] = {
            total: 0,
            name: categoryName,
          };
        }
        budgetsByCategory[budget.category_id].total += budget.amount_cents;
      });

      // Convert back to array format for processBudgetVariance
      const budgetData = Object.entries(budgetsByCategory).map(([category_id, data]) => ({
        category_id,
        amount_cents: data.total,
        categories: { name: data.name },
      }));

      // Fetch previous year data for YoY comparison
      const prevYearStart = subYears(startDate, 1);
      const prevYearEnd = subYears(endDate, 1);

      let prevQuery = supabase
        .from("transactions")
        .select("type, amount_cents")
        .gte("date", format(prevYearStart, "yyyy-MM-dd"))
        .lte("date", format(prevYearEnd, "yyyy-MM-dd"))
        .is("transfer_group_id", null); // CRITICAL: Exclude transfers from YoY!

      // Apply same filters for fair comparison
      if (filters?.accountId) {
        prevQuery = prevQuery.eq("account_id", filters.accountId);
      }
      if (filters?.categoryId) {
        prevQuery = prevQuery.eq("category_id", filters.categoryId);
      }
      if (filters?.type) {
        prevQuery = prevQuery.eq("type", filters.type);
      }

      const { data: prevYearData, error: prevYearError } = await prevQuery;

      if (prevYearError) {
        console.warn("Failed to fetch previous year data:", prevYearError);
      }

      // Process all data
      const monthlyTrend = processMonthlyTrend(transactionData || []);
      const categoryBreakdown = processCategoryBreakdown(transactionData || []);
      const totalIncome = calculateTotal(transactionData || [], "income");
      const totalExpenses = calculateTotal(transactionData || [], "expense");
      const budgetVariance = processBudgetVariance(budgetData || [], transactionData || []);
      const yearOverYear = processYearOverYear(
        transactionData || [],
        (prevYearData as typeof transactionData) || []
      );
      const insights = processInsights(transactionData || [], startDate, endDate);

      return {
        monthlyTrend,
        categoryBreakdown,
        totalIncome,
        totalExpenses,
        budgetVariance,
        yearOverYear,
        insights,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Helper: Group transactions by month
 *
 * @param data - Transaction data array
 * @returns Array of monthly income/expense totals in cents
 */
function processMonthlyTrend(data: Transaction[]): MonthlyTrendData[] {
  const grouped: Record<string, { income: number; expenses: number }> = {};

  data.forEach((t) => {
    const date = new Date(t.date);
    const yearMonth = format(date, "yyyy-MM"); // e.g., "2025-01" for sorting

    if (!grouped[yearMonth]) {
      grouped[yearMonth] = { income: 0, expenses: 0 };
    }
    if (t.type === "income") {
      grouped[yearMonth].income += t.amount_cents;
    } else {
      grouped[yearMonth].expenses += t.amount_cents;
    }
  });

  // Sort by year-month key (string comparison works: "2024-12" < "2025-01")
  return Object.entries(grouped)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, amounts]) => ({
      month: format(new Date(key + "-01"), "MMM yyyy"), // Convert back to display format
      income: amounts.income,
      expenses: amounts.expenses,
    }));
}

/**
 * Helper: Group by category and return top 10
 *
 * @param data - Transaction data array
 * @returns Top 10 expense categories (values in pesos for Recharts)
 */
function processCategoryBreakdown(data: Transaction[]): CategoryBreakdown[] {
  const grouped: Record<string, number> = {};

  data
    .filter((t) => t.type === "expense") // Only expenses for category breakdown
    .forEach((t) => {
      const categoryName = t.categories?.name || "Uncategorized";
      grouped[categoryName] = (grouped[categoryName] || 0) + t.amount_cents;
    });

  return Object.entries(grouped)
    .map(([name, totalCents]) => ({
      name,
      value: totalCents / 100, // Convert to pesos for Recharts display
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10 categories
}

/**
 * Helper: Calculate total for income or expense
 *
 * @param data - Transaction data array
 * @param type - Transaction type to sum
 * @returns Total amount in cents
 */
function calculateTotal(data: Transaction[], type: "income" | "expense"): number {
  return data.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount_cents, 0);
}

/**
 * Helper: Calculate budget variance
 *
 * @param budgets - Budget data array
 * @param transactions - Transaction data array (already filtered, excludes transfers)
 * @returns Budget variance calculations per category
 *
 * Formula: variance = budget_target - actual_spending
 * Positive variance = under budget (good)
 * Negative variance = over budget (alert)
 */
function processBudgetVariance(
  budgets: Array<{ category_id: string; amount_cents: number; categories: { name: string } }>,
  transactions: Transaction[]
): BudgetVariance[] {
  // Group transactions by category (only expenses)
  const spendingByCategory: Record<string, number> = {};

  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      spendingByCategory[t.category_id] = (spendingByCategory[t.category_id] || 0) + t.amount_cents;
    });

  // Calculate variance for each budget
  return budgets.map((budget) => {
    const actualSpend = spendingByCategory[budget.category_id] || 0;
    const variance = budget.amount_cents - actualSpend; // Positive = under budget
    const percentUsed = budget.amount_cents > 0 ? (actualSpend / budget.amount_cents) * 100 : 0;

    return {
      category: budget.categories.name,
      budgetAmount: budget.amount_cents,
      actualAmount: actualSpend,
      variance,
      percentUsed: Math.min(percentUsed, 100), // Cap at 100% for display
    };
  });
}

/**
 * Helper: Calculate year-over-year comparison
 *
 * @param currentData - Current year transaction data
 * @param previousData - Previous year transaction data (same date range, 1 year back)
 * @returns YoY comparison with absolute and percentage changes
 */
function processYearOverYear(
  currentData: Transaction[],
  previousData: Transaction[]
): YearOverYear {
  const currentIncome = calculateTotal(currentData, "income");
  const currentExpenses = calculateTotal(currentData, "expense");
  const previousIncome = calculateTotal(previousData, "income");
  const previousExpenses = calculateTotal(previousData, "expense");

  const incomeChange = currentIncome - previousIncome;
  const expenseChange = currentExpenses - previousExpenses;

  return {
    currentYear: {
      income: currentIncome,
      expenses: currentExpenses,
    },
    previousYear: {
      income: previousIncome,
      expenses: previousExpenses,
    },
    change: {
      income: incomeChange,
      expenses: expenseChange,
    },
    percentChange: {
      income: previousIncome > 0 ? (incomeChange / previousIncome) * 100 : 0,
      expenses: previousExpenses > 0 ? (expenseChange / previousExpenses) * 100 : 0,
    },
  };
}

/**
 * Helper: Generate insights
 *
 * @param data - Transaction data array
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @returns Calculated insights (avg spending, top transactions, top categories)
 */
function processInsights(data: Transaction[], startDate: Date, endDate: Date): Insights {
  const expenses = data.filter((t) => t.type === "expense");

  // Calculate average monthly spending
  const monthCount = Math.max(1, Math.ceil(differenceInDays(endDate, startDate) / 30));
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount_cents, 0);
  const avgMonthlySpending = totalExpenses / monthCount;

  // Get largest transactions
  const largestTransactions = expenses
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 5)
    .map((t) => ({
      description: t.description,
      amount: t.amount_cents,
      date: t.date,
    }));

  // Get top categories
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((t) => {
    const name = t.categories?.name || "Uncategorized";
    categoryTotals[name] = (categoryTotals[name] || 0) + t.amount_cents;
  });

  const topCategories = Object.entries(categoryTotals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    avgMonthlySpending,
    largestTransactions,
    topCategories,
  };
}
