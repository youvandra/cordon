/**
 * Keep reading the chain, one read at a time.
 *
 * This is four lines and it has its own file because it was written once, in
 * the meter, with the reason beside it — and the attest endpoint, which runs
 * the same reducer over the same snapshot, kept `setInterval` and the bug.
 *
 * `setInterval` schedules on a clock rather than on the last read finishing.
 * A tick that waits out a rate limit outlives its interval, and the timer
 * starts a second one:
 *
 *  - both read from `ledger.toBlock + 1`, so the same range is folded in
 *    twice. `reduce` mutates the ledger in place, so `drawn6`, `refused6` and
 *    the draw and refusal counts double, and `ledger.refusals` grows a second
 *    row with an id it already holds;
 *  - both then write the snapshot, so two writers race one file;
 *  - and both ask the endpoint that has just asked for less of it.
 *
 * None of that fails loudly. It shows up as a ledger that disagrees with the
 * chain it was built from, on the surface that sells the answer.
 *
 * So: run, then schedule the next one from the end of this one. A read that
 * takes longer than the interval simply gets the next slot.
 */
export interface LoopOptions {
  /** Milliseconds between the end of one run and the start of the next. */
  intervalMs: number;
  /** What a failed run should say. It keeps the last good state either way. */
  onError?: (error: Error) => void;
  /** Injected by the test, which has no patience for real time. */
  setTimer?: (fn: () => void, ms: number) => { unref?: () => void } | number;
}

export interface Loop {
  /** Stop scheduling. A run already in flight finishes. */
  stop(): void;
}

export function everyAfter(run: () => Promise<void>, options: LoopOptions): Loop {
  const timer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  let stopped = false;

  const schedule = (): void => {
    if (stopped) return;
    const handle = timer(tick, options.intervalMs);
    /* An interval that is the only thing left holding the process open is a
       CLI that will not exit. The server's listener is what keeps this one
       alive, and it should be the only thing that does. */
    (handle as { unref?: () => void })?.unref?.();
  };

  const tick = (): void => {
    /* Checked here as well as in `schedule`, because a timer already set when
       `stop` was called still fires. A loop that runs one more read after it
       was stopped is a second reader of the snapshot the caller is shutting
       down around. */
    if (stopped) return;
    run()
      .catch((error: unknown) => options.onError?.(error as Error))
      .finally(schedule);
  };

  tick();
  return {
    stop() {
      stopped = true;
    },
  };
}
