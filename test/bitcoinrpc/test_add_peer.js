const {createServer} = require('node:http');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../bitcoinrpc/add_peer');

const credentials = {pass: 'pass', user: 'user'};
const socket = '172.17.0.2';
const {stringify} = JSON;

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
    description: 'A node is added',
    respond: reply(200, stringify({error: null, result: null})),
  },
  {
    description: 'Adding a node that is already added is not an error',
    respond: reply(500, stringify({
      error: {code: -23, message: 'Error: Node already added'},
      result: null,
    })),
  },
  {
    description: 'Other JSON-RPC errors are returned',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'addnode', code: -1, message: 'Unexpected'},
    ],
    respond: reply(500, stringify({
      error: {code: -1, message: 'Unexpected'},
      result: null,
    })),
  },
  {
    args: {pass: undefined},
    description: 'An RPC password is expected',
    error: [400, 'ExpectedRpcPasswordToAddChainPeer'],
  },
  {
    args: {port: undefined},
    description: 'An RPC port is expected',
    error: [400, 'ExpectedRpcPortNumberToAddChainPeer'],
  },
  {
    args: {socket: undefined},
    description: 'A socket to connect to is expected',
    error: [400, 'ExpectedSocketToAddChainPeer'],
  },
  {
    args: {user: undefined},
    description: 'An RPC username is expected',
    error: [400, 'ExpectedRpcUsernameToAddChainPeer'],
  },
];

tests.forEach(({args, description, error, respond}) => {
  return test(description, async t => {
    const {kill, port} = await startServer(respond);

    t.after(kill);

    const call = method({port, socket, ...credentials, ...args});

    if (!!error) {
      return await rejects(call, err => {
        deepEqual(err, error);

        return true;
      });
    }

    return deepEqual(await call, undefined);
  });
});
