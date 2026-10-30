const pauseMs = 1;
const realClearTimeout = globalThis.clearTimeout;
const realSetTimeout = globalThis.setTimeout;
const stepMs = 100;

// Wait a moment of real time, with the timer from before any faking
const pause = () => new Promise(resolve => realSetTimeout(resolve, pauseMs));

/** Run a call with a fake clock that runs a hundred times faster than real

  {
    context: <Test Context Object>
    run: () => <Call Promise>
  }

  @returns via Promise
  <Call Result Object>
*/
module.exports = async ({context, run}) => {
  const clock = {now: 0, timers: new Set()};
  let isDone = false;

  // Fake timeouts for the rest of the test, so waiting retries never run
  context.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => {
    const timer = {
      fire: () => fn(...args),
      hasRef: () => true,
      ref: () => timer,
      refresh: () => {
        timer.at = clock.now + (ms || 0);

        clock.timers.add(timer);

        return timer;
      },
      unref: () => timer,
    };

    return timer.refresh();
  });

  context.mock.method(globalThis, 'clearTimeout', timer => {
    clock.timers.delete(timer);

    // A timeout from before the clock was faked is cleared for real
    return realClearTimeout(timer);
  });

  const call = run();

  // Note when the call is over, however it ends
  Promise.allSettled([call]).then(() => isDone = true);

  // Let requests in flight finish, then move the clock past the next wait
  while (!isDone) {
    await pause();

    clock.now += stepMs;

    const due = [...clock.timers].filter(n => n.at <= clock.now);

    // Fire due timeouts in order, unless an earlier one cleared or moved them
    due.sort((a, b) => a.at - b.at).forEach(timer => {
      const isDue = timer.at <= clock.now;

      return isDue && clock.timers.delete(timer) && timer.fire();
    });
  }

  return call;
};
