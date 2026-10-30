const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeLnd = require('./fake_lnd');
const method = require('./../../setup/setup_channel');

const {channel} = fakeLnd;
const failure = [503, 'GenerateFailure'];
const immediately = (fn, ms, ...args) => setImmediate(fn, ...args);
const normal = {listed: [true], pending: [true], policies: [true]};
const {partner} = fakeLnd;
const requested = (requests, name) => requests.find(n => n.method === name);
const socket = '172.17.0.3:9735';
const to = {id: partner, socket};

// Make a generate function that records requests and fails when it should
const makeGenerate = failures => {
  const generated = [];

  const generate = async request => {
    const failing = failures[generated.length];

    generated.push(request);

    if (!!failing) {
      throw failing;
    }

    return;
  };

  return {generate, generated};
};

// What a channel set up after mining to connect, fund, open and confirm is
const makeExpected = overrides => ({
  channel,
  connected_to: {host: socket, pubkey: partner},
  funding: 1e6,
  generated: [{}, {count: 100}, {}, {count: 6}],
  partner,
  ...overrides,
});

// Set up a channel with a fake LND, then describe what was asked of LND
const setup = async ({args, failures}) => {
  const {generate, generated} = makeGenerate(failures);
  const {lnd, requests} = fakeLnd(normal);

  const res = await method({...args, generate, lnd});

  const connect = requested(requests, 'connectPeer').request;
  const open = requested(requests, 'openChannel').request;

  return {
    generated,
    channel: {
      id: res.id,
      transaction_id: res.transaction_id,
      transaction_vout: res.transaction_vout,
    },
    connected_to: connect.addr,
    funding: open.local_funding_amount,
    partner: open.node_pubkey.toString('hex'),
  };
};

const tests = [
  {
    args: {to},
    description: 'A channel is set up to a partner given by id',
    expected: makeExpected({}),
    failures: [],
  },
  {
    args: {capacity: 2e6, to: {public_key: partner, socket}},
    description: 'A channel is set up to a partner given by public key',
    expected: makeExpected({funding: 2e6}),
    failures: [],
  },
  {
    args: {to},
    description: 'Failures to mine before connecting and opening are retried',
    expected: makeExpected({
      generated: [{}, {}, {count: 100}, {}, {}, {count: 6}],
    }),
    failures: [failure, null, null, failure],
  },
];

// Failing steps, and what was asked of the generate function and LND first
const failing = [
  {
    description: 'A failure to fund the channel stops the setup',
    expected: {generated: [{}, {count: 100}], requests: ['connectPeer']},
    failures: [null, failure],
  },
  {
    description: 'A failure to confirm the channel stops the setup',
    expected: {
      generated: [{}, {count: 100}, {}, {count: 6}],
      requests: ['connectPeer', 'openChannel', 'pendingChannels'],
    },
    failures: [null, null, null, failure],
  },
];

tests.forEach(({args, description, expected, failures}) => {
  return test(description, async t => {
    // Waits between retries pass at once
    t.mock.method(globalThis, 'setTimeout', immediately);

    return deepEqual(await setup({args, failures}), expected);
  });
});

failing.forEach(({description, expected, failures}) => {
  return test(description, async t => {
    const {generate, generated} = makeGenerate(failures);
    const {lnd, requests} = fakeLnd(normal);

    // Waits between retries pass at once
    t.mock.method(globalThis, 'setTimeout', immediately);

    await rejects(method({generate, lnd, to}), err => {
      deepEqual(err, failure);

      return true;
    });

    const methods = requests.map(n => n.method);

    // Steps after the failing step never start
    return deepEqual({generated, requests: methods}, expected);
  });
});
