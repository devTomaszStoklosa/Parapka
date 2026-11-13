import {
  ChoreValidationError,
  createCheckinAnswers,
  editCheckinAnswers,
  type CheckinAnswers,
  type CheckinWindow,
  type Clock,
  type HintCheckin,
  type IsoWeek,
} from "@parapka/domain";

import type { PairRepository } from "../pairing/pair-repository";
import type { AnswersRepository, StoredAnswers } from "./answers-repository";
import type { ScheduleRepository } from "./schedule-repository";
import type { Reveal } from "./reveal";
import type { SealedRepository } from "./sealed-repository";
import { currentWindowOf, type WindowEnd } from "./window-sweep";

export type CheckinStatus = "open" | "filled" | "locked" | "revealed";

export interface CheckinView {
  window: CheckinWindow;
  paired: boolean;
  own: CheckinAnswers | null;
  status: CheckinStatus;
  partner: CheckinAnswers | null;
}

export interface CheckinInput {
  mood: number;
  energy: number;
  closeness: number;
  need?: string;
}

export interface CheckinService {
  current(): Promise<CheckinView>;
  /** Saves or edits the own answers of the current window. */
  submit(input: CheckinInput): Promise<void>;
  /** The own answers of the latest weeks, the newest first. */
  history(limit: number): Promise<StoredAnswers[]>;
  /** The input of the hint engine: the own answers of the current week. */
  hintCheckin(): Promise<HintCheckin | null>;
  subscribe(listener: () => void): () => void;
}

interface Deps {
  clock: Clock;
  pairs: Pick<PairRepository, "activePair">;
  schedule: Pick<ScheduleRepository, "get" | "subscribe">;
  answers: AnswersRepository;
  sealed: Pick<SealedRepository, "submit" | "partnerFilled" | "subscribe">;
  reveal: Pick<Reveal, "settle" | "get" | "subscribe">;
  windowEnd: Pick<WindowEnd, "sweep">;
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** The first answers of the week, or an edit of the saved ones. */
async function save(
  answers: AnswersRepository,
  { week, answers: created, submittedAt }: StoredAnswers,
  partnerFilled: boolean,
) {
  const stored = await answers.get(week);
  const next = stored
    ? editCheckinAnswers({ answers: stored.answers, partnerFilled }, created)
        .answers
    : created;
  await answers.put({ week, answers: next, submittedAt });
  return next;
}

/** The plaintext of a seal: the answers as JSON in UTF-8. */
const plaintextOf = ({ mood, energy, closeness, need }: CheckinAnswers) =>
  new TextEncoder().encode(
    JSON.stringify({
      mood,
      energy,
      closeness,
      ...(need === undefined ? {} : { need }),
    }),
  );

/**
 * What the view shows once the own answers are saved; before, it must not
 * depend on the partner (ZP-2).
 */
async function statusOf(
  { sealed, reveal }: Pick<Deps, "sealed" | "reveal">,
  week: IsoWeek,
): Promise<Pick<CheckinView, "status" | "partner">> {
  const partner = await reveal.get(week);
  if (partner !== null) return { status: "revealed", partner };
  const locked = await sealed.partnerFilled(week);
  return { status: locked ? "locked" : "filled", partner: null };
}

export function createCheckinService(deps: Deps): CheckinService {
  const { clock, pairs, schedule, answers, sealed, reveal, windowEnd } = deps;
  const currentWindow = () => currentWindowOf(clock, schedule);
  const view = async (): Promise<CheckinView> => {
    await windowEnd.sweep();
    const window = await currentWindow();
    const stored = await answers.get(window.week);
    const own = stored?.answers ?? null;
    const paired = (await pairs.activePair()) !== null;
    if (own === null) {
      return { window, paired, own, status: "open", partner: null };
    }
    return { window, paired, own, ...(await statusOf(deps, window.week)) };
  };
  return {
    current: view,
    submit: async (input) => {
      if ((await pairs.activePair()) === null) {
        throw new ChoreValidationError("there is no pair");
      }
      const { week } = await currentWindow();
      const created = createCheckinAnswers(input);
      const locked = await sealed.partnerFilled(week);
      const entry = { week, answers: created, submittedAt: clock.nowMs() };
      const saved = await save(answers, entry, locked);
      await sealed.submit(week, plaintextOf(saved));
      await reveal.settle();
    },
    history: async (limit) => (await answers.list()).slice(0, limit),
    hintCheckin: async () => {
      const { own, window } = await view();
      if (own === null) return null;
      const { year, month, day } = window.start;
      return {
        date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
        answers: own,
      };
    },
    subscribe: (listener) => {
      const stops = [answers, schedule, sealed, reveal].map((source) =>
        source.subscribe(listener),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
