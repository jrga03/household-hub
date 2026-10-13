/**
 * Closes the editor of an item that's gone: removed or retired on another
 * device mid-edit. Dropping its id means restoring the item later doesn't
 * reopen the editor. `item` is undefined while it loads and null once it's gone.
 */
export function useCloseWhenGone(openId: unknown, item: unknown, close: () => void): void {
  if (openId !== null && item === null) close();
}
