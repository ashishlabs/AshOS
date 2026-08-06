export interface SrsState {
  /** Days until the next review. */
  interval: number;
  /** SuperMemo "E-Factor" — how quickly the interval grows for an easy card. Floors at 1.3. */
  easeFactor: number;
  /** Consecutive successful (quality >= 3) reviews. Resets to 0 on a failed review. */
  repetitions: number;
}

export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** Anki-style named grades mapped onto SM-2's 0-5 recall-quality scale. */
export const GRADE_TO_QUALITY: Record<ReviewGrade, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5
};

/**
 * The SuperMemo-2 (SM-2) spaced repetition algorithm — the standard
 * behind most flashcard apps (Anki's default algorithm is a variant of
 * this). `quality` is 0-5: below 3 means the card was forgotten and
 * resets its repetition streak back to a 1-day interval; 3 and above
 * advances the interval, growing faster the higher the ease factor
 * climbs. This function is pure and stateless — `LearningManager` is the
 * only caller, translating a `Flashcard`'s stored `{ interval,
 * easeFactor, repetitions }` in, and its returned `{ interval,
 * easeFactor, repetitions }` back out to `dueDate = now + interval days`.
 */
export function sm2(state: SrsState, quality: number): SrsState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { interval, repetitions } = state;
  let { easeFactor } = state;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }

  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  return { interval, easeFactor, repetitions };
}
