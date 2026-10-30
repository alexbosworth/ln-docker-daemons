const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const interceptRpc = require('./intercept_rpc');
const method = require('./../../bitcoinrpc/mine_blocks');

const {answer} = interceptRpc;
const {hashAt} = fakeBitcoind;
const {refuse} = interceptRpc;
const request = {address: 'address', count: 1, pass: 'p', user: 'u'};

const tests = [
  {
    calls: ['getblockchaininfo', 'generatetoaddress'],
    description: 'Blocks are mined',
    expected: [hashAt(2)],
  },
  {
    calls: [],
    description: 'A chain info error is returned without mining',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'getblockchaininfo', code: -28, message: 'Loading block index…'},
    ],
    intercept: {
      method: 'getblockchaininfo',
      reply: answer({error: {code: -28, message: 'Loading block index…'}}),
    },
  },
  {
    calls: ['getblockchaininfo'],
    description: 'A generate request that never reaches bitcoind is returned',
    error: [503, 'ConnectionToBitcoindRpcServiceFailed'],
    intercept: {method: 'generatetoaddress', reply: refuse},
  },
  {
    calls: ['getblockchaininfo', 'getblockchaininfo'],
    description: 'A request with a response is checked once by default',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'generatetoaddress', code: -5, message: 'Invalid address'},
    ],
    intercept: {
      method: 'generatetoaddress',
      reply: answer({error: {code: -5, message: 'Invalid address'}}),
    },
  },
  {
    args: {address: undefined},
    calls: [],
    description: 'An address is expected',
    error: [400, 'ExpectedAddressToMineBlocks'],
  },
  {
    args: {count: undefined},
    calls: [],
    description: 'A count of blocks is expected',
    error: [400, 'ExpectedCountOfBlocksToMine'],
  },
  {
    args: {pass: undefined},
    calls: [],
    description: 'An RPC password is expected',
    error: [400, 'ExpectedRpcPasswordToMineBlocks'],
  },
  {
    args: {port: undefined},
    calls: [],
    description: 'An RPC port is expected',
    error: [400, 'ExpectedRpcPortNumberToMineBlocks'],
  },
  {
    args: {user: undefined},
    calls: [],
    description: 'An RPC username is expected',
    error: [400, 'ExpectedRpcUsernameToMineBlocks'],
  },
];

tests.forEach(({args, calls, description, error, expected, intercept}) => {
  return test(description, async t => {
    const bitcoind = await fakeBitcoind({addresses: ['other']});

    t.after(bitcoind.kill);

    // Answer requests for one method without sending them to bitcoind
    if (!!intercept) {
      t.mock.method(globalThis, 'fetch', interceptRpc(intercept));
    }

    const call = method({port: bitcoind.port, ...request, ...args});

    if (!!error) {
      await rejects(call, error);
    } else {
      deepEqual(await call, expected);
    }

    // Only the requests that were not intercepted reach bitcoind
    return deepEqual(bitcoind.calls, calls);
  });
});
