export const VIEWPORTS = {
  phone: { width: 393, height: 851 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  ultrawide: { width: 2560, height: 1440 },
} as const;

export const DARK_VIEWPORTS = {
  phone: VIEWPORTS.phone,
  laptop: VIEWPORTS.laptop,
} as const;
