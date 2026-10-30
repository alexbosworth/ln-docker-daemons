const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const interceptRpc = require('./intercept_rpc');
const method = require('./../../bitcoinrpc/check_generated');

const {answer} = interceptRpc;
const credentials = {pass: 'pass', user: 'user'};
const fault = [503, 'UnexpectedErrorFromRpcCommand', {code: -1, message: 'x'}];
const {hashAt} = fakeBitcoind;
const {lose} = interceptRpc;
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
    args: {count: 1, start: 1},
    chain: ['other'],
    description: 'A failure to get the chain height makes the outcome unknown',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {
        cause: 'ConnectionToBitcoindRpcServiceLost',
        code: 'ECONNRESET',
        count: 1,
        height: undefined,
        start: 1,
      },
    ],
    intercept: {method: 'getblockchaininfo', reply: lose},
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'address'],
    description: 'A failure to get a block hash makes the outcome unknown',
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
    intercept: {method: 'getblockhash', reply: lose},
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'address'],
    description: 'A failure to get a block makes the outcome unknown',
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
    intercept: {method: 'getblock', reply: lose},
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'address'],
    description: 'A block without transactions makes the outcome unknown',
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
    intercept: {method: 'getblock', reply: answer({result: {}})},
  },
  {
    args: {count: 1, start: 1},
    chain: ['other', 'address'],
    description: 'An output without a script makes the outcome unknown',
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
    intercept: {
      method: 'getblock',
      reply: answer({result: {tx: [{vout: [{}]}]}}),
    },
  },
  {
    args: {count: 1, err: [503, 'Failure'], start: 1},
    chain: ['other'],
    description: 'An error without details can make the outcome unknown',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {cause: 'Failure', code: undefined, count: 1, height: 1, start: 1},
    ],
  },
  {
    args: {count: 2, err: [503, 'Failure'], is_finished: true, start: 1},
    chain: ['other', 'address'],
    description: 'Blocks are reported for an error without details',
    error: [
      503,
      'GeneratedFewerBlocksThanRequested',
      {
        cause: 'Failure',
        code: undefined,
        count: 2,
        hashes: [hashAt(2)],
        message: undefined,
      },
    ],
  },
  {
    args: {address: undefined, count: 1, start: 1},
    chain: ['other'],
    description: 'An address is expected',
    error: [400, 'ExpectedAddressToCheckGeneratedBlocks'],
  },
  {
    args: {start: 1},
    chain: ['other'],
    description: 'A count is expected',
    error: [400, 'ExpectedCountToCheckGeneratedBlocks'],
  },
  {
    args: {count: 1, err: undefined, start: 1},
    chain: ['other'],
    description: 'A generate error is expected',
    error: [400, 'ExpectedGenerateErrorToCheckGeneratedBlocks'],
  },
  {
    args: {count: 1},
    chain: ['other'],
    description: 'A start height is expected',
    error: [400, 'ExpectedStartHeightToCheckGeneratedBlocks'],
  },
];

tests.forEach(({args, chain, description, error, expected, intercept}) => {
  return test(description, async t => {
    const {kill, port} = await fakeBitcoind({addresses: chain});

    t.after(kill);

    // Answer requests for one method without sending them to bitcoind
    if (!!intercept) {
      t.mock.method(globalThis, 'fetch', interceptRpc(intercept));
    }

    const call = method({port, ...credentials, ...settings, ...args});

    if (!!error) {
      return await rejects(call, error);
    }

    return deepEqual(await call, expected);
  });
});
