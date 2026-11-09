export const colors = {
  background: "#FFFFFF",
  surface: "#F2F2F7",
  text: "#1C1C1E",
  textMuted: "#4A4A4F",
  accent: "#0B57D0",
  onAccent: "#FFFFFF",
  border: "#767680",
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
