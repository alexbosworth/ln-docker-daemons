const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../docker/kill_docker');

const stopped = ['stop', {t: 1}];

// Make a container that records how it gets stopped and removed
const makeContainer = ({remove, stop}) => {
  const calls = [];

  const container = {
    remove: cbk => {
      calls.push(['remove']);

      return cbk(remove);
    },
    stop: (options, cbk) => {
      calls.push(['stop', options]);

      return cbk(stop);
    },
  };

  return {calls, container};
};

const tests = [
  {
    description: 'A running container is stopped and removed',
    expected: [stopped, ['remove']],
  },
  {
    description: 'A container that already stopped is removed',
    expected: [stopped, ['remove']],
    stop: {reason: 'container already stopped'},
  },
  {
    description: 'A container that is already gone is not an error',
    expected: [stopped, ['remove']],
    remove: {statusCode: 404},
    stop: {statusCode: 404},
  },
  {
    description: 'A container that is already being removed is not an error',
    expected: [stopped, ['remove']],
    remove: {statusCode: 409},
  },
  {
    description: 'A failure to stop the container is returned',
    error: [503, 'UnexpectedErrorStoppingContainer'],
    expected: [stopped],
    stop: {statusCode: 500},
  },
  {
    description: 'A failure to remove the container is returned',
    error: [503, 'UnexpectedErrorRemovingContainer'],
    expected: [stopped, ['remove']],
    remove: {statusCode: 500},
  },
  {
    args: {container: undefined},
    description: 'A container is expected',
    error: [400, 'ExpectedContainerToKillContainer'],
    expected: [],
  },
];

tests.forEach(({args, description, error, expected, remove, stop}) => {
  return test(description, async () => {
    const {calls, container} = makeContainer({remove, stop});

    const call = method({container, ...args});

    if (!!error) {
      await rejects(call, error);
    } else {
      await call;
    }

    return deepEqual(calls, expected);
  });
});
