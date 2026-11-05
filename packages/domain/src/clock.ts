/** Source of physical time, injected into domain and sync code (spec 7.2). */
export interface Clock {
  /** Current time in milliseconds since the Unix epoch. */
  nowMs(): number;
}
