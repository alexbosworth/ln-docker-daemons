const {createServer} = require('node:http');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../bitcoinrpc/rpc');

const cmd = 'getblockchaininfo';
const credentials = {pass: 'pass', user: 'user'};
const host = '127.0.0.1';
const params = [];
const {stringify} = JSON;

// Make a JSON-RPC response handler
const reply = (code, body) => (req, res) => res.writeHead(code).end(body);

// Simplify the raw error in error details to whether it is an Error
const simplify = err => {
  const [code, message, details] = err;

  if (!details || !('err' in details)) {
    return err;
  }

  return [code, message, {...details, err: details.err instanceof Error}];
};

// Make a rejection validator comparing a simplified error to an expected one
const matching = want => err => {
  deepEqual(simplify(err), want);

  return true;
};

// Start a server, closing it right away when connections should be refused
const startServer = ({refuse, respond}) => {
  return new Promise(resolve => {
    const server = createServer(respond);

    // Close the server and any connections still open to it
    const close = () => {
      server.closeAllConnections();

      return server.close();
    };

    return server.listen(0, host, () => {
      const {port} = server.address();

      // Exit early when connections to the server should be refused
      if (!!refuse) {
        return server.close(() => resolve({close, port}));
      }

      return resolve({close, port});
    });
  });
};

const tests = [
  {
    args: {},
    description: 'A result is returned',
    expected: {blocks: 1},
    respond: reply(200, stringify({error: null, result: {blocks: 1}})),
  },
  {
    args: {},
    description: 'A JSON-RPC error body is returned as an error',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd, code: -28, message: 'Loading block index…'},
    ],
    respond: reply(500, stringify({
      error: {code: -28, message: 'Loading block index…'},
      result: null,
    })),
  },
  {
    args: {},
    description: 'An unparseable response is returned as an error',
    error: [503, 'FailedToParseRpcServiceResponse', {cmd, status: 401}],
    respond: reply(401, ''),
  },
  {
    args: {},
    description: 'A response that is not an object is returned as an error',
    error: [503, 'UnexpectedRpcServiceResponse', {cmd, status: 200}],
    respond: reply(200, 'null'),
  },
  {
    args: {},
    description: 'A failure status without an RPC error is an error',
    error: [503, 'UnexpectedRpcServiceResponse', {cmd, status: 503}],
    respond: reply(503, stringify({error: null, result: {blocks: 1}})),
  },
  {
    args: {},
    description: 'A refused connection is returned as an error',
    error: port => [
      503,
      'ConnectionToBitcoindRpcServiceFailed',
      {
        cmd,
        code: 'ECONNREFUSED',
        err: true,
        message: `connect ECONNREFUSED ${host}:${port}`,
      },
    ],
    refuse: true,
    respond: reply(200, ''),
  },
  {
    args: {},
    description: 'A socket closed mid-response is returned as an error',
    error: [
      503,
      'ConnectionToBitcoindRpcServiceLost',
      {cmd, code: 'UND_ERR_SOCKET', err: true, message: 'other side closed'},
    ],
    respond: (req, res) => {
      res.writeHead(200, {'Content-Length': 100});

      return res.write('{"result"', () => res.socket.destroy());
    },
  },
  {
    args: {timeout: 50},
    description: 'A stuck request times out',
    error: [503, 'TimedOutWaitingForRpcResponse', {cmd}],
    respond: () => {},
  },
  {
    args: {timeout: -1},
    description: 'A timeout must be a positive number',
    error: [400, 'ExpectedPositiveTimeoutToExecuteRpcCall'],
    respond: reply(200, ''),
  },
];

tests.forEach(({args, description, error, expected, refuse, respond}) => {
  return test(description, async t => {
    const {close, port} = await startServer({refuse, respond});

    t.after(close);

    const call = method({cmd, host, params, port, ...args, ...credentials});

    if (!!error) {
      const want = typeof error === 'function' ? error(port) : error;

      return await rejects(call, matching(want));
    }

    return deepEqual(await call, expected);
  });
});
