const {createServer} = require('node:http');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../bitcoinrpc/get_block_info');

const credentials = {pass: 'pass', user: 'user'};
const id = '00'.repeat(32);
const {parse} = JSON;
const {stringify} = JSON;

// Start a server that records requests and answers them all the same way
const startServer = reply => {
  return new Promise(resolve => {
    const requests = [];

    const server = createServer((req, res) => {
      const chunks = [];

      req.on('data', chunk => chunks.push(chunk));

      return req.on('end', () => {
        const {method, params} = parse(Buffer.concat(chunks).toString());

        requests.push({method, params});

        return res.writeHead(reply.code).end(stringify(reply.body));
      });
    });

    // Stop the server and any connections still open to it
    const kill = () => {
      server.closeAllConnections();

      return server.close();
    };

    return server.listen(0, '127.0.0.1', () => {
      return resolve({kill, requests, port: server.address().port});
    });
  });
};

const tests = [
  {
    args: {id},
    description: 'Block info is returned',
    expected: {
      block: {hash: id, tx: ['tx']},
      requests: [{method: 'getblock', params: [id, 1]}],
    },
    reply: {body: {error: null, result: {hash: id, tx: ['tx']}}, code: 200},
  },
  {
    args: {id},
    description: 'A JSON-RPC error is returned as an error',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'getblock', code: -5, message: 'Block not found'},
    ],
    reply: {
      body: {error: {code: -5, message: 'Block not found'}, result: null},
      code: 500,
    },
  },
  {
    args: {},
    description: 'A block id is expected',
    error: [400, 'ExpectedBlockIdToGetBlockInfo'],
  },
  {
    args: {id, pass: undefined},
    description: 'An RPC password is expected',
    error: [400, 'ExpectedRpcPasswordToGetBlockInfo'],
  },
  {
    args: {id, port: undefined},
    description: 'An RPC port is expected',
    error: [400, 'ExpectedRpcPortNumberToGetBlockInfo'],
  },
  {
    args: {id, user: undefined},
    description: 'An RPC username is expected',
    error: [400, 'ExpectedRpcUsernameToGetBlockInfo'],
  },
];

tests.forEach(({args, description, error, expected, reply}) => {
  return test(description, async t => {
    const server = await startServer(reply);

    t.after(server.kill);

    const call = method({port: server.port, ...credentials, ...args});

    if (!!error) {
      return await rejects(call, error);
    }

    deepEqual(await call, expected.block);

    return deepEqual(server.requests, expected.requests);
  });
});
