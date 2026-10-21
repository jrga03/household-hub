import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

const signIn = vi.fn<(email: string, password: string) => Promise<void>>();
const signUp = vi.fn<(email: string, password: string) => Promise<void>>();

// authStore pulls the Supabase client (env-dependent); the forms only call its actions
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ signIn, signUp }),
}));

async function renderPage(page: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByLabelText("Email");
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  signIn.mockReset().mockResolvedValue(undefined);
  signUp.mockReset().mockResolvedValue(undefined);
});

describe("LoginForm", () => {
  it("signs in with the typed email and password", async () => {
    await renderPage(<LoginForm />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Log in to Household Hub" })
    ).toBeInTheDocument();

    type("Email", "ana@example.com");
    type("Password", "secret123");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await vi.waitFor(() => expect(signIn).toHaveBeenCalledWith("ana@example.com", "secret123"));
  });

  it("shows why the server refused a sign-in", async () => {
    signIn.mockRejectedValue(new Error("Invalid login credentials"));
    await renderPage(<LoginForm />);

    type("Email", "ana@example.com");
    type("Password", "wrong-one");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });

  it("asks for a missing password next to the field and focuses it", async () => {
    await renderPage(<LoginForm />);

    type("Email", "ana@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    const password = screen.getByLabelText("Password");
    await vi.waitFor(() => expect(password).toHaveAttribute("aria-invalid", "true"));
    expect(password).toHaveAccessibleDescription("Enter your password.");
    expect(password).toHaveFocus();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("SignupForm", () => {
  it("puts a password mismatch under Confirm password", async () => {
    await renderPage(<SignupForm />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Create an account" })
    ).toBeInTheDocument();

    type("Email", "ana@example.com");
    type("Password", "secret123");
    type("Confirm password", "secret124");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    const confirm = screen.getByLabelText("Confirm password");
    await vi.waitFor(() => expect(confirm).toHaveAttribute("aria-invalid", "true"));
    expect(confirm).toHaveAccessibleDescription("Passwords don’t match.");
    expect(confirm).toHaveFocus();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("asks to check email once the account is created", async () => {
    await renderPage(<SignupForm />);

    type("Email", "ana@example.com");
    type("Password", "secret123");
    type("Confirm password", "secret123");
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Check your email" })
    ).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith("ana@example.com", "secret123");
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login");
  });
});
