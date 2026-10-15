const {createServer} = require('node:http');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../bitcoinrpc/get_blockchain_info');

const credentials = {pass: 'pass', user: 'user'};
const {stringify} = JSON;
const testTimeout = 1000 * 5;

// Make a JSON-RPC response handler
const reply = (code, body) => (req, res) => res.writeHead(code).end(body);

// Start a server that answers every request the same way
const startServer = respond => {
  return new Promise(resolve => {
    const server = createServer(respond);

    // Stop the server and any connections still open to it
    const kill = () => {
      server.closeAllConnections();

      return server.close();
    };

    return server.listen(0, '127.0.0.1', () => {
      return resolve({kill, port: server.address().port});
    });
  });
};

const tests = [
  {
    args: {},
    description: 'Blockchain info is returned',
    expected: {blocks: 1},
    respond: reply(200, stringify({error: null, result: {blocks: 1}})),
  },
  {
    args: {timeout: 50},
    description: 'A request that takes longer than the timeout is an error',
    error: [503, 'TimedOutWaitingForRpcResponse', {cmd: 'getblockchaininfo'}],
    respond: () => {},
  },
];

// The test time limit is well under the default RPC timeout, so a timeout
// that does not get passed through to the request fails the test
tests.forEach(({args, description, error, expected, respond}) => {
  return test(description, {timeout: testTimeout}, async t => {
    const {kill, port} = await startServer(respond);

    t.after(kill);

    const call = method({port, ...args, ...credentials});

    if (!!error) {
      return await rejects(call, err => {
        deepEqual(err, error);

        return true;
      });
    }

    return deepEqual(await call, expected);
  });
});
