const {createServer} = require('node:http');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const method = require('./../../bitcoinrpc/generate_to_address');

const chain = ['other'];
const {hashAt} = fakeBitcoind;
const isGenerate = n => n === 'generatetoaddress';
const request = {address: 'address', pass: 'p', user: 'u'};
const startDelayMs = 150;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Find a port that is not being listened on
const freePort = () => {
  return new Promise(resolve => {
    const server = createServer();

    return server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();

      return server.close(() => resolve(port));
    });
  });
};

const tests = [
  {
    description: 'Blocks are generated',
    expected: {addresses: ['other', 'address'], hashes: [hashAt(2)]},
  },
  {
    description: 'Blocks generated before the connection is lost are found',
    expected: {addresses: ['other', 'address'], hashes: [hashAt(2)]},
    generate: 'mine_lose',
  },
  {
    description: 'A lost connection without blocks is not retried',
    error: [
      503,
      'UnknownIfBlocksWereGenerated',
      {
        cause: 'ConnectionToBitcoindRpcServiceLost',
        code: 'UND_ERR_SOCKET',
        count: 1,
        height: 1,
        start: 1,
      },
    ],
    expected: {addresses: ['other']},
    generate: 'lose',
  },
  {
    description: 'Blocks generated before a garbled response are found',
    expected: {addresses: ['other', 'address'], hashes: [hashAt(2)]},
    generate: 'mine_garble',
  },
  {
    description: 'A rejected request without new blocks is passed back',
    error: [
      503,
      'FailedToParseRpcServiceResponse',
      {cmd: 'generatetoaddress', status: 401},
    ],
    expected: {addresses: ['other']},
    generate: 'unauthorized',
  },
  {
    count: 2,
    description: 'Blocks generated before a JSON-RPC error are reported',
    error: [
      503,
      'GeneratedFewerBlocksThanRequested',
      {
        cause: 'UnexpectedErrorFromRpcCommand',
        code: -32603,
        count: 2,
        hashes: [hashAt(2)],
        message: 'ProcessNewBlock, block not accepted',
      },
    ],
    expected: {addresses: ['other', 'address']},
    generate: 'mine_error',
  },
  {
    description: 'A JSON-RPC error is not retried',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'generatetoaddress', code: -5, message: 'Invalid address'},
    ],
    expected: {addresses: ['other']},
    generate: 'error',
  },
  {
    delay: startDelayMs,
    description: 'A chain info request that never reached bitcoind is retried',
    expected: {addresses: ['other', 'address'], hashes: [hashAt(2)]},
  },
  {
    description: 'A generate request that never reached bitcoind is retried',
    expected: {addresses: ['other', 'address'], hashes: [hashAt(2)]},
    generate: 'refuse',
  },
];

tests.forEach(args => {
  return test(args.description, async t => {
    const port = await freePort();

    // Start bitcoind after any delay to have the first requests refused
    const starting = wait(args.delay).then(() => {
      return fakeBitcoind({port, addresses: chain, generate: args.generate});
    });

    const call = method({port, ...request, count: args.count});
    const bitcoind = await starting;

    t.after(bitcoind.close);

    if (!!args.error) {
      await rejects(call, args.error);
    } else {
      deepEqual(await call, args.expected.hashes);
    }

    // The generate command must only ever reach bitcoind once
    deepEqual(bitcoind.calls.filter(isGenerate).length, 1);
    deepEqual(bitcoind.addresses, args.expected.addresses);
    deepEqual(!!bitcoind.is_paused, args.generate === 'refuse');
  });
});
