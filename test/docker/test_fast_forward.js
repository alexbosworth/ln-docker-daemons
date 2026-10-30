const {deepEqual} = require('node:assert').strict;
const {fail} = require('node:assert').strict;
const test = require('node:test');

const fastForward = require('./fast_forward');

const longWait = 1000 * 10;
const realSetTimeout = globalThis.setTimeout;

const tests = [
  {
    description: 'A long wait passes at once',
    expected: 'waited',
    run: () => new Promise(resolve => setTimeout(resolve, longWait, 'waited')),
  },
  {
    description: 'A wait without a delay passes',
    expected: undefined,
    run: () => new Promise(resolve => setTimeout(resolve)),
  },
  {
    description: 'A cleared wait never passes',
    expected: 'kept',
    run: () => new Promise(resolve => {
      clearTimeout(setTimeout(resolve, 100, 'cleared'));

      return setTimeout(resolve, 200, 'kept');
    }),
  },
  {
    description: 'A wait that is cleared by an earlier one never passes',
    expected: 'kept',
    run: () => new Promise(resolve => {
      const cleared = setTimeout(resolve, 20, 'cleared');

      setTimeout(() => clearTimeout(cleared), 10);

      return setTimeout(resolve, 200, 'kept');
    }),
  },
  {
    description: 'A wait that is refreshed passes later',
    expected: 'early',
    run: () => new Promise(resolve => {
      const refreshed = setTimeout(resolve, 20, 'refreshed');

      setTimeout(() => refreshed.refresh(), 10);

      return setTimeout(resolve, 50, 'early');
    }),
  },
  {
    description: 'A wait can be referenced and unreferenced',
    expected: [true, true, true],
    run: () => new Promise(resolve => {
      const timer = setTimeout(() => {
        return resolve([
          timer.hasRef(),
          timer.ref() === timer,
          timer.unref() === timer,
        ]);
      },
      longWait);
    }),
  },
];

tests.forEach(({description, expected, run}) => {
  return test(description, async t => {
    return deepEqual(await fastForward({run, context: t}), expected);
  });
});

test('A real timer cleared while the clock is fake never fires', async t => {
  const timer = setTimeout(fail, 10, 'The cleared real timer fired');

  await fastForward({context: t, run: async () => clearTimeout(timer)});

  // Wait out the real timer, with the timer from before any faking
  return await new Promise(resolve => realSetTimeout(resolve, 50));
});
