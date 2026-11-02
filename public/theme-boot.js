/* global document, localStorage, matchMedia */
// Applies the saved theme before first paint, so the start-up screen matches the iOS splash.
// next-themes (App.tsx, same storage key) takes over once the app mounts.
try {
  const theme = localStorage.getItem("household-hub-theme");
  const isDark =
    theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
} catch {
  // Storage blocked: keep the light theme.
}
