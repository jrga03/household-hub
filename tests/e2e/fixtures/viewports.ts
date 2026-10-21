export const VIEWPORTS = {
  compact: { width: 393, height: 851 },
  medium: { width: 768, height: 1024 },
  expanded: { width: 1024, height: 768 },
  large: { width: 1366, height: 768 },
  ultrawide: { width: 2560, height: 1440 },
} as const;

export const DARK_VIEWPORTS = {
  compact: VIEWPORTS.compact,
  large: VIEWPORTS.large,
} as const;
