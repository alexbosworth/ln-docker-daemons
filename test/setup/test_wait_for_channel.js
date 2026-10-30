const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeLnd = require('./fake_lnd');
const method = require('./../../setup/wait_for_channel');

const {channel} = fakeLnd;
const immediately = (fn, ms, ...args) => setImmediate(fn, ...args);
const normal = {listed: [true], pending: [true], policies: [true]};
const repeat = (method, count) => [...Array(count)].map(() => method);
const tries = 10000;

// Wait for the channel to open, then describe the channel
const wait = async ({args, lnd}) => {
  const res = await method({
    lnd,
    id: channel.transaction_id,
    vout: channel.transaction_vout,
    ...args,
  });

  return {
    id: res.id,
    transaction_id: res.transaction_id,
    transaction_vout: res.transaction_vout,
  };
};

const tests = [
  {
    description: 'An open channel is returned',
    expected: ['listChannels', 'getChanInfo'],
  },
  {
    behavior: {listed: [false, true]},
    description: 'A channel is waited on until it is listed',
    expected: ['listChannels', 'listChannels', 'getChanInfo'],
  },
  {
    behavior: {listed: [null, true]},
    description: 'A channel is waited on through failures to list channels',
    expected: ['listChannels', 'listChannels', 'getChanInfo'],
  },
  {
    behavior: {policies: [false, true]},
    description: 'A channel is waited on until both policies are known',
    expected: ['listChannels', 'getChanInfo', 'getChanInfo'],
  },
  {
    behavior: {policies: [null, true]},
    description: 'A channel is waited on through failures to get the channel',
    expected: ['listChannels', 'getChanInfo', 'getChanInfo'],
  },
  {
    behavior: {listed: [false]},
    description: 'A channel that is never listed is an error',
    error: [503, 'FailedToFindChannelWithTransactionId'],
    expected: repeat('listChannels', tries),
  },
  {
    behavior: {policies: [false]},
    description: 'A channel that never has both policies is an error',
    error: [503, 'FailedToFindChannelWithFullPolicyDetails'],
    expected: ['listChannels', ...repeat('getChanInfo', tries)],
  },
  {
    args: {id: undefined},
    description: 'A funding transaction id is expected',
    error: [400, 'ExpectedTransactionIdToWaitForChannelOpen'],
    expected: [],
  },
  {
    args: {lnd: undefined},
    description: 'An LND API object is expected',
    error: [400, 'ExpectedAuthenticatedLndToWaitForChannelOpen'],
    expected: [],
  },
];

tests.forEach(({args, behavior, description, error, expected}) => {
  return test(description, async t => {
    const {lnd, requests} = fakeLnd({...normal, ...behavior});

    // Waits between retries pass at once
    t.mock.method(globalThis, 'setTimeout', immediately);

    const call = wait({args, lnd});

    if (!!error) {
      await rejects(call, err => {
        deepEqual(err, error);

        return true;
      });
    } else {
      deepEqual(await call, channel);
    }

    return deepEqual(requests.map(n => n.method), expected);
  });
});
