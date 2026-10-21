export const testUsers = {
  primary: {
    email: "test@example.com",
    password: "TestPassword123!",
  },
  secondary: {
    email: "test2@example.com",
    password: "TestPassword456!",
  },
};

/** Belongs to no household, so every route sends them to create-or-join. */
export const householdlessUser = {
  email: "test-no-household@example.com",
  password: "TestPassword789!",
};
