export type TabId = "today" | "cycle" | "planner" | "head" | "settings";

export const TAB_IDS: readonly TabId[] = [
  "today",
  "cycle",
  "planner",
  "head",
  "settings",
];

export interface NavState {
  active: TabId;
  /** Depth of the stack per tab; 1 means only the root screen. */
  depth: Record<TabId, number>;
}

export type NavAction =
  { type: "select"; tab: TabId } | { type: "push" } | { type: "pop" };

export const initialNavState: NavState = {
  active: "today",
  depth: { today: 1, cycle: 1, planner: 1, head: 1, settings: 1 },
};

export function navReducer(state: NavState, action: NavAction): NavState {
  const tab = state.active;
  switch (action.type) {
    case "select":
      // Touching the active tab again returns to its root.
      return action.tab === tab
        ? { ...state, depth: { ...state.depth, [tab]: 1 } }
        : { ...state, active: action.tab };
    case "push":
      return {
        ...state,
        depth: { ...state.depth, [tab]: state.depth[tab] + 1 },
      };
    case "pop":
      return {
        ...state,
        depth: { ...state.depth, [tab]: Math.max(1, state.depth[tab] - 1) },
      };
  }
}
