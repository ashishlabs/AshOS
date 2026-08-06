import { describe, expect, it } from "vitest";
import { GRADE_TO_QUALITY, sm2 } from "./srs";

describe("sm2", () => {
  const initial = { interval: 0, easeFactor: 2.5, repetitions: 0 };

  it("sets interval to 1 day on the first successful review", () => {
    const result = sm2(initial, 5);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it("sets interval to 6 days on the second successful review", () => {
    const afterFirst = sm2(initial, 5);
    const afterSecond = sm2(afterFirst, 5);
    expect(afterSecond.interval).toBe(6);
    expect(afterSecond.repetitions).toBe(2);
  });

  it("multiplies interval by the ease factor from the third successful review onward", () => {
    const afterFirst = sm2(initial, 5);
    const afterSecond = sm2(afterFirst, 5);
    const afterThird = sm2(afterSecond, 5);
    expect(afterThird.interval).toBe(Math.round(afterSecond.interval * afterSecond.easeFactor));
    expect(afterThird.repetitions).toBe(3);
  });

  it("increases the ease factor for a perfect recall (quality 5)", () => {
    const result = sm2(initial, 5);
    expect(result.easeFactor).toBeCloseTo(2.6, 5);
  });

  it("decreases the ease factor for a bare-minimum-passing recall (quality 3)", () => {
    const result = sm2(initial, 3);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it("resets repetitions and interval to 1 day on a failed review (quality < 3)", () => {
    const afterFirst = sm2(initial, 5);
    const afterSecond = sm2(afterFirst, 5);
    const afterThird = sm2(afterSecond, 5);
    const failed = sm2(afterThird, 0);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
  });

  it("floors the ease factor at 1.3 even after repeated failures", () => {
    let state = initial;
    for (let i = 0; i < 20; i++) state = sm2(state, 0);
    expect(state.easeFactor).toBe(1.3);
  });

  it("clamps out-of-range quality values into 0-5", () => {
    const tooHigh = sm2(initial, 10);
    const tooLow = sm2(initial, -5);
    expect(tooHigh).toEqual(sm2(initial, 5));
    expect(tooLow).toEqual(sm2(initial, 0));
  });

  it("rounds fractional quality values", () => {
    expect(sm2(initial, 4.6)).toEqual(sm2(initial, 5));
  });

  it("is a pure function — repeated calls with the same input produce the same output", () => {
    expect(sm2(initial, 4)).toEqual(sm2(initial, 4));
  });

  it("GRADE_TO_QUALITY maps Anki-style grades onto the 0-5 scale", () => {
    expect(GRADE_TO_QUALITY.again).toBe(0);
    expect(GRADE_TO_QUALITY.hard).toBe(3);
    expect(GRADE_TO_QUALITY.good).toBe(4);
    expect(GRADE_TO_QUALITY.easy).toBe(5);
  });
});
