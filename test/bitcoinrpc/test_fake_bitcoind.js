const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeBitcoind = require('./fake_bitcoind');
const rpc = require('./../../bitcoinrpc/rpc');

const chain = ['other'];
const credentials = {host: '127.0.0.1', pass: 'pass', user: 'user'};
const {pauseMs} = fakeBitcoind;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const tests = [
  {
    args: {cmd: 'getnetworkinfo', params: []},
    description: 'An unknown method is a JSON-RPC error',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'getnetworkinfo', code: -32601, message: 'Method not found'},
    ],
  },
  {
    args: {cmd: 'getblockhash', params: [2]},
    description: 'A block height above the tip is a JSON-RPC error',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'getblockhash', code: -8, message: 'Block height out of range'},
    ],
  },
  {
    args: {cmd: 'getblockchaininfo', params: []},
    auth: 'user:salt$hash',
    description: 'A request without the credentials for the auth is refused',
    error: [
      503,
      'FailedToParseRpcServiceResponse',
      {cmd: 'getblockchaininfo', status: 401},
    ],
  },
  {
    args: {cmd: 'getblockchaininfo', params: []},
    description: 'A fake killed while paused does not listen again',
    error: [503, 'ConnectionToBitcoindRpcServiceFailed'],
    generate: 'refuse',
  },
];

tests.forEach(({args, auth, description, error, generate}) => {
  return test(description, async t => {
    const bitcoind = await fakeBitcoind({auth, generate, addresses: chain});
    const request = {...args, ...credentials, port: bitcoind.port};

    t.after(bitcoind.kill);

    // Kill the fake during the pause that its first chain info call starts
    if (generate === 'refuse') {
      await rpc(request);

      bitcoind.kill();

      await wait(pauseMs * 2);
    }

    return await rejects(rpc(request), error);
  });
});
