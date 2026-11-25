import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors } from "./theme";

type Shape = "circle" | "path" | "rect";
type Part = readonly [Shape, Record<string, number | string>];

const path = (d: string): Part => ["path", { d }];
const circle = (cx: number, cy: number, r: number): Part => [
  "circle",
  { cx, cy, r },
];
const rect = (
  x: number,
  y: number,
  size: [number, number],
  rx: number,
): Part => ["rect", { x, y, width: size[0], height: size[1], rx }];

const lock = "M8 11V8a4 4 0 0 1 8 0v3";
const check = "M5 12.5l4.5 4.5L19 7";
const sun =
  "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4";
const calendar = "M8 2v4M16 2v4M3 10h18M8.5 15l2 2 4-4";

/** Outline icons on a 24x24 grid, copied from docs/design/canvas. */
const icons = {
  today: [circle(12, 12, 4), path(sun)],
  cycle: [path("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")],
  planner: [rect(3, 4, [18, 17], 3), path(calendar)],
  head: [
    path("M7 17h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.2 8.1 4.5 4.5 0 0 0 7 17z"),
    path("M8 21h.01M11 20h.01"),
  ],
  settings: [
    path("M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"),
    circle(16, 6, 2),
    circle(10, 12, 2),
    circle(18, 18, 2),
  ],
  check: [path(check)],
  plus: [path("M12 5v14M5 12h14")],
  lock: [rect(5, 11, [14, 10], 2.5), path(lock)],
  pause: [path("M9 6v12M15 6v12")],
  heart: [
    path("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"),
  ],
  sparkle: [path("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z")],
  arrowRight: [path("M5 12h14M13 6l6 6-6 6")],
  chevronLeft: [path("M15 6l-6 6 6 6")],
  chevronRight: [path("M9 6l6 6-6 6")],
  clock: [circle(12, 12, 9), path("M12 7v5l3 2")],
  repeat: [
    path("M4 11a7 7 0 0 1 12-4.9L18 8"),
    path("M18 3v5h-5"),
    path("M20 13a7 7 0 0 1-12 4.9L6 16"),
    path("M6 21v-5h5"),
  ],
  handOff: [rect(5, 11, [14, 10], 2.5), path("M8 11V8a4 4 0 0 1 7.5-2")],
  info: [circle(12, 12, 9), path("M12 11v5M12 8h.01")],
  shield: [path("M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z")],
  link: [
    path("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"),
    path("M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
  ],
  copy: [
    rect(8, 8, [12, 12], 2.5),
    path("M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"),
  ],
  close: [path("M6 6l12 12M18 6L6 18")],
  swap: [path("M7 7h12l-3-3"), path("M17 17H5l3 3")],
  more: [circle(5, 12, 2), circle(12, 12, 2), circle(19, 12, 2)],
  archive: [
    rect(3, 4, [18, 5], 1.5),
    path("M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"),
  ],
  pen: [path("M4 20h4L19 9l-4-4L4 16z"), path("M13.5 6.5l4 4")],
  trendUp: [path("M4 17l6-6 4 4 6-7"), path("M15 8h5v5")],
  trendDown: [path("M4 7l6 6 4-4 6 7"), path("M15 16h5v-5")],
} as const satisfies Record<string, readonly Part[]>;

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const shapes = { circle: Circle, path: Path, rect: Rect };

/**
 * Decorative outline icon: hidden from screen readers, the label of the
 * control that holds it carries the meaning. "more" is drawn filled.
 */
export function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth = 1.9,
}: IconProps) {
  const filled = name === "more";
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      pointerEvents="none"
    >
      {icons[name].map(([shape, props], index) => {
        const Shape = shapes[shape];
        return <Shape key={index} {...props} />;
      })}
    </Svg>
  );
}
