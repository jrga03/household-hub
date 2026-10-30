import { createFileRoute, redirect } from "@tanstack/react-router";

// Plan was split in two; saved links and installed PWAs land on its money half.
export const Route = createFileRoute("/plan")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/assign-money", search, replace: true });
  },
});
