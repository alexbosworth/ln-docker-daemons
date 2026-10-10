const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const method = require('./../../bitcoinrpc/generate_to_address');

const {hashAt} = fakeBitcoind;
const request = {address: 'address', pass: 'p', user: 'u'};

const tests = [
  {
    description: 'Requests made at the same time run one after the other',
    expected: [
      {status: 'fulfilled', value: [hashAt(2)]},
      {status: 'fulfilled', value: [hashAt(3)]},
    ],
  },
  {
    description: 'A lost request is not credited with blocks from another',
    expected: [
      {
        reason: [
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
        status: 'rejected',
      },
      {status: 'fulfilled', value: [hashAt(2)]},
    ],
    generate: 'lose',
  },
];

tests.forEach(({description, expected, generate}) => {
  return test(description, async t => {
    const {close, port} = await fakeBitcoind({generate, addresses: ['other']});

    t.after(close);

    // Make two requests to mine to the same address at the same time
    const requests = [request, request].map(n => method({port, ...n}));

    return deepEqual(await Promise.allSettled(requests), expected);
  });
});
