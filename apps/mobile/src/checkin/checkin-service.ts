import {
  ChoreValidationError,
  createCheckinAnswers,
  currentCheckinWindow,
  editCheckinAnswers,
  type CheckinAnswers,
  type CheckinWindow,
  type Clock,
  type HintCheckin,
  type IsoWeek,
} from "@parapka/domain";

import type { PairRepository } from "../pairing/pair-repository";
import type { AnswersRepository, StoredAnswers } from "./answers-repository";
import { toLocalDateTime } from "./local-time";
import type { ScheduleRepository } from "./schedule-repository";
import type { SealedRepository } from "./sealed-repository";

/** "locked" and "revealed" come with the exchange of the answers. */
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
  sealed: Pick<SealedRepository, "submit">;
}

/** Whether the partner has filled in the week; the exchange will tell. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the week is for the exchange
const isLocked = (_week: IsoWeek): boolean => false;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** The first answers of the week, or an edit of the saved ones. */
async function save(
  answers: AnswersRepository,
  week: IsoWeek,
  created: CheckinAnswers,
  submittedAt: number,
) {
  const stored = await answers.get(week);
  const next = stored
    ? editCheckinAnswers(
        { answers: stored.answers, partnerFilled: isLocked(week) },
        created,
      ).answers
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

export function createCheckinService(deps: Deps): CheckinService {
  const { clock, pairs, schedule, answers, sealed } = deps;
  const currentWindow = async () =>
    currentCheckinWindow(toLocalDateTime(clock.nowMs()), await schedule.get());
  const view = async (): Promise<CheckinView> => {
    const window = await currentWindow();
    const stored = await answers.get(window.week);
    const own = stored?.answers ?? null;
    return {
      window,
      paired: (await pairs.activePair()) !== null,
      own,
      status: own === null ? "open" : "filled",
      partner: null,
    };
  };
  return {
    current: view,
    submit: async (input) => {
      if ((await pairs.activePair()) === null) {
        throw new ChoreValidationError("there is no pair");
      }
      const { week } = await currentWindow();
      const created = createCheckinAnswers(input);
      const saved = await save(answers, week, created, clock.nowMs());
      await sealed.submit(week, plaintextOf(saved));
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
      const stops = [answers.subscribe(listener), schedule.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
