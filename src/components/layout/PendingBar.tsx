/** A thin bar at the top of the content area while a page's code downloads. */
export function PendingBar() {
  return (
    <div role="status" className="h-0.5 overflow-hidden bg-primary/20">
      <div className="h-full w-1/3 animate-indeterminate bg-primary" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}

export const pendingOptions = {
  defaultPendingComponent: PendingBar,
  defaultPendingMs: 500,
  // The router's 500 ms minimum would hold a ready page back to keep a thin bar on screen.
  defaultPendingMinMs: 0,
};
