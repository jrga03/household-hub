export const testAccounts = [
  {
    name: "Cash",
    type: "cash",
    initial_balance: 1000000, // ₱10,000.00 in cents
  },
  {
    name: "Checking",
    type: "bank",
    initial_balance: 5000000, // ₱50,000.00 in cents
  },
];

export const testCategories = [
  {
    name: "Food",
    type: "expense",
    subcategories: ["Groceries", "Dining Out"],
  },
  {
    name: "Income",
    type: "income",
    subcategories: ["Salary", "Freelance"],
  },
];

export const testTransactions = [
  {
    description: "Grocery Shopping",
    amount_cents: 150050, // ₱1,500.50
    type: "expense",
    date: "2025-01-15",
    category: "Food > Groceries",
    account: "Cash",
  },
  {
    description: "Monthly Salary",
    amount_cents: 5000000, // ₱50,000.00
    type: "income",
    date: "2025-01-01",
    category: "Income > Salary",
    account: "Checking",
  },
];
