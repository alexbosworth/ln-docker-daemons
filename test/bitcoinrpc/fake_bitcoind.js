const {createServer} = require('node:http');

const hashAt = height => height.toString(16).padStart(64, '0');
const localhost = '127.0.0.1';
const {parse} = JSON;
const pauseMs = 150;
const {stringify} = JSON;

/** Start a fake bitcoind JSON-RPC server with a chain of blocks

  {
    addresses: [<Coinbase Address of Block at Height Index + 1 String>]
    [generate]: <First Generate Call Behavior String>
    [port]: <Listen Port Number>
  }

  Generate behaviors are:
  error: return a JSON-RPC error
  lose: drop the connection without mining
  mine_error: mine all but the last block, then return a JSON-RPC error
  mine_garble: mine, then return an unparseable response
  mine_lose: mine, then drop the connection
  refuse: refuse connections for a moment after the first chain info call
  unauthorized: return an empty 401 response

  @returns via Promise
  {
    addresses: [<Coinbase Address String>]
    calls: [<Called Method String>]
    [is_paused]: <Stopped Listening After First Chain Info Call Bool>
    close: <Close Server Function> () => {}
    port: <Listen Port Number>
  }
*/
module.exports = args => {
  const addresses = [...args.addresses];
  const calls = [];
  const started = {addresses, calls};

  // Mine blocks onto the chain and return their hashes
  const mine = ([count, address]) => [...Array(count)].map(() => {
    addresses.push(address);

    return hashAt(addresses.length);
  });

  // Make the result or error for a method
  const execute = ({method, params}) => {
    switch (method) {
    case 'getblock':
      const height = parseInt(params[0], 16);
      const vout = [{scriptPubKey: {address: addresses[height - 1]}}];

      return {result: {hash: params[0], tx: [{vout}]}};

    case 'getblockchaininfo':
      return {result: {blocks: addresses.length}};

    case 'getblockhash':
      if (params[0] > addresses.length) {
        return {error: {code: -8, message: 'Block height out of range'}};
      }

      return {result: hashAt(params[0])};

    case 'generatetoaddress':
      return {result: mine(params)};

    default:
      return {error: {code: -32601, message: 'Method not found'}};
    }
  };

  const server = createServer((req, res) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));

    return req.on('end', () => {
      const {method, params} = parse(Buffer.concat(chunks).toString());

      calls.push(method);

      const isFirstGenerate = method === 'generatetoaddress' &&
        calls.filter(n => n === 'generatetoaddress').length === 1;

      const isFirstInfo = method === 'getblockchaininfo' &&
        calls.filter(n => n === 'getblockchaininfo').length === 1;

      // Stop listening and close this connection so the next call is refused
      if (isFirstInfo && args.generate === 'refuse') {
        started.is_paused = true;

        server.close(() => {
          return setTimeout(() => {
            // Stay closed when the server was closed while paused
            if (!!started.is_closed) {
              return;
            }

            return server.listen(started.port, localhost);
          },
          pauseMs);
        });

        res.setHeader('Connection', 'close');
      }

      // Fail the first generate call in the requested way
      if (isFirstGenerate && args.generate === 'error') {
        const error = {code: -5, message: 'Invalid address'};

        return res.writeHead(500).end(stringify({error, result: null}));
      }

      if (isFirstGenerate && args.generate === 'lose') {
        return res.socket.destroy();
      }

      if (isFirstGenerate && args.generate === 'mine_error') {
        const error = {
          code: -32603,
          message: 'ProcessNewBlock, block not accepted',
        };

        mine([params[0] - 1, params[1]]);

        return res.writeHead(500).end(stringify({error, result: null}));
      }

      if (isFirstGenerate && args.generate === 'mine_garble') {
        mine(params);

        return res.writeHead(200).end('{"result": [');
      }

      if (isFirstGenerate && args.generate === 'unauthorized') {
        return res.writeHead(401).end();
      }

      if (isFirstGenerate && args.generate === 'mine_lose') {
        mine(params);

        return res.socket.destroy();
      }

      const {error, result} = execute({method, params});

      const code = !!error ? 500 : 200;

      return res.writeHead(code).end(stringify({error, result}));
    });
  });

  return new Promise(resolve => {
    return server.listen(args.port || 0, localhost, () => {
      started.close = () => {
        started.is_closed = true;

        server.closeAllConnections();

        return server.close();
      };
      started.port = server.address().port;

      return resolve(started);
    });
  });
};

module.exports.hashAt = hashAt;
