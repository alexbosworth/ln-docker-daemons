const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../docker/kill_dockers');

// Make dockers that record being killed and fail when they should
const makeDockers = failures => {
  const killed = [];

  const dockers = failures.map((failure, i) => ({
    kill: ({}, cbk) => {
      killed.push(i);

      return cbk(failure);
    },
  }));

  return {dockers, killed};
};

const tests = [
  {
    description: 'Every docker is killed',
    expected: [0, 1],
    failures: [null, null],
  },
  {
    description: 'A failure to kill a docker is returned',
    error: [503, 'UnexpectedErrorStoppingContainer'],
    expected: [0, 1],
    failures: [null, [503, 'UnexpectedErrorStoppingContainer']],
  },
  {
    args: {dockers: undefined},
    description: 'An array of dockers is expected',
    error: [400, 'ExpectedArrayOfDockersToKill'],
    expected: [],
    failures: [],
  },
];

tests.forEach(({args, description, error, expected, failures}) => {
  return test(description, async () => {
    const {dockers, killed} = makeDockers(failures);

    const call = method({dockers, ...args});

    if (!!error) {
      await rejects(call, error);
    } else {
      await call;
    }

    return deepEqual(killed, expected);
  });
});
