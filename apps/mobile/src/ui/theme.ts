export const colors = {
  background: "#F4F1F8",
  surface: "#FFFFFF",
  text: "#1F1A2E",
  textMuted: "#5F5873",
  accent: "#5B4BD6",
  onAccent: "#FFFFFF",
  border: "#8C84A0",
  danger: "#B00020",
  borderSubtle: "#D9D3E4",
  divider: "#EEE9F3",
  track: "#E7E2EF",
  personA: "#5B4BD6",
  personAText: "#4335B8",
  personATint: "#ECE9FD",
  personB: "#C2375E",
  personBText: "#A12D4E",
  personBTint: "#FCE6ED",
  warmTint: "#FFEBDD",
  onDark: "#C9C3DB",
} as const;

export const radii = { card: 24, field: 16, pill: 999 } as const;

export const shadows = {
  card: {
    boxShadow: "0 1px 2px rgba(31,26,46,0.04), 0 8px 24px rgba(31,26,46,0.06)",
  },
} as const;

/** Font families registered in index.ts from the bundled font files. */
export const fonts = {
  heading: "BricolageGrotesque_700Bold",
  body: "PlusJakartaSans_400Regular",
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;

export const fontSizes = { body: 16, title: 24, tab: 12 } as const;

/** Minimum touch target in points (NFR-UX-03). */
export const MIN_TOUCH_TARGET = 44;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

/** WCAG 2.1 contrast ratio of two "#RRGGBB" colors. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
