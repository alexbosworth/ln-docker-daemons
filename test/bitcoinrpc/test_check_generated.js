const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const method = require('./../../bitcoinrpc/check_generated');

const credentials = {pass: 'pass', user: 'user'};
const fault = [503, 'UnexpectedErrorFromRpcCommand', {code: -1, message: 'x'}];
const {hashAt} = fakeBitcoind;
const lost = [503, 'ConnectionToBitcoindRpcServiceLost', {code: 'ECONNRESET'}];
const settings = {address: 'address', err: lost, interval: 10, times: 3};

const tests = [
  {
    args: {count: 2, start: 1},
    chain: ['other', 'address', 'address'],
    description: 'Generated blocks are found',
    expected: [hashAt(2), hashAt(3)],
  },
  {
    args: {count: 1, start: 1},
    chain: ['other'],
    description: 'Missing blocks make the outcome unknown',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {
        cause: 'ConnectionToBitcoindRpcServiceLost',
        code: 'ECONNRESET',
        count: 1,
        height: 1,
        start: 1,
      },
    ],
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'peer'],
    description: 'Blocks paying elsewhere make the outcome unknown',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {
        cause: 'ConnectionToBitcoindRpcServiceLost',
        code: 'ECONNRESET',
        count: 1,
        height: 2,
        start: 1,
      },
    ],
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'address', 'address'],
    description: 'Extra blocks make the outcome unknown',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {
        cause: 'ConnectionToBitcoindRpcServiceLost',
        code: 'ECONNRESET',
        count: 1,
        height: 3,
        start: 1,
      },
    ],
  },
  {
    args: {count: 2, err: fault, is_finished: true, start: 1},
    chain: ['other'],
    description: 'A finished request without blocks returns its error',
    error: fault,
  },
  {
    args: {count: 2, err: fault, is_finished: true, start: 1},
    chain: ['other', 'address'],
    description: 'A finished request with some blocks reports them',
    error: [
      503,
      'GeneratedFewerBlocksThanRequested',
      {
        cause: 'UnexpectedErrorFromRpcCommand',
        code: -1,
        count: 2,
        hashes: [hashAt(2)],
        message: 'x',
      },
    ],
  },
  {
    args: {count: 1},
    chain: ['other'],
    description: 'A start height is expected',
    error: [400, 'ExpectedStartHeightToCheckGeneratedBlocks'],
  },
];

tests.forEach(({args, chain, description, error, expected}) => {
  return test(description, async t => {
    const {close, port} = await fakeBitcoind({addresses: chain});

    t.after(close);

    const call = method({port, ...credentials, ...settings, ...args});

    if (!!error) {
      return await rejects(call, error);
    }

    return deepEqual(await call, expected);
  });
});
