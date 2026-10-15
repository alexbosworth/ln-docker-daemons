const {createHmac} = require('crypto');
const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const {bitcoindPorts} = require('./constants');
const {dockerBitcoindImage} = require('./constants');
const {getBlockchainInfo} = require('./../bitcoinrpc');
const {rpcUser} = require('./constants');
const {spawnDockerImage} =  require('./../docker');

const clean = string => string.replace(/\+/g, '-').replace(/\//g, '_');
const defaultZmqBlockPort = 28332;
const defaultZmqTxPort = 28333;
const deriveHmac = (s, p) => createHmac('sha256', s).update(p).digest('hex');
const generateAuthSalt = () => randomBytes(16).toString('hex');
const generatePassword = () => randomBytes(32).toString('base64');
const interval = 100;
const readyCheckTimeout = 1000 * 5;
const times = 100;
const trim = string => string.replace(/=+$/g, '');
const zmqBlockPort = args => args.zmq_block_port || defaultZmqBlockPort;
const zmqTxPort = args => args.zmq_tx_port || defaultZmqTxPort;

/** Spawn a Bitcoin Core Docker image

  Ports that are not specified are not published to the host, except for RPC,
  which is published on a free port picked by Docker. ZMQ defaults to ports
  28332 and 28333 inside the container.

  {
    [p2p_port]: <P2P Port Number>
    [rpc_port]: <RPC Port Number>
    [zmq_block_port]: <ZMQ Blocks Port Number>
    [zmq_tx_port]: <ZMQ Transactions Port Number>
  }

  @returns via cbk or Promise
  {
    host: <Host String>
    kill: ({}, [cbk]) => <Kill Promise>
    rpc_pass: <RPC Password String>
    rpc_port: <RPC Port Number>
    rpc_user: <RPC Username String>
    zmq_block_port: <ZMQ Blocks Port Number>
    zmq_tx_port: <ZMQ Transactions Port Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Generate auth
      generateAuth: cbk => {
        const pass = trim(clean(generatePassword()));
        const salt = generateAuthSalt();

        return cbk(null, {
          rpc_auth: `${rpcUser}:${salt}$${deriveHmac(salt, pass)}`,
          rpc_pass: pass,
        });
      },

      // Spawn the docker image
      spawnDocker: ['generateAuth', ({generateAuth}, cbk) => {
        const arguments = [
          '--disablewallet',
          '--listen=1',
          '--persistmempool=false',
          '--printtoconsole',
          '--regtest',
          '--rpcallowip=0.0.0.0/0',
          `--rpcauth=${generateAuth.rpc_auth}`,
          '--rpcbind=0.0.0.0',
          '--server',
          '--txindex',
          `--zmqpubrawblock=tcp://*:${zmqBlockPort(args)}`,
          `--zmqpubrawtx=tcp://*:${zmqTxPort(args)}`,
        ];

        const image = dockerBitcoindImage;

        // Docker picks a free host port for RPC when no port is specified
        const ports = {'18443/tcp': args.rpc_port};

        // Other ports are reached over the Docker network unless specified
        if (!!args.p2p_port) {
          ports['18444/tcp'] = args.p2p_port;
        }

        if (!!args.zmq_block_port) {
          ports[`${args.zmq_block_port}/tcp`] = args.zmq_block_port;
        }

        if (!!args.zmq_tx_port) {
          ports[`${args.zmq_tx_port}/tcp`] = args.zmq_tx_port;
        }

        return spawnDockerImage({arguments, image, ports}, cbk);
      }],

      // Wait for the image to respond to a query
      checkReady: [
        'generateAuth',
        'spawnDocker',
        ({generateAuth, spawnDocker}, cbk) =>
      {
        return asyncRetry({interval, times}, cbk => {
          // A check that hangs is retried rather than waited on for long
          return getBlockchainInfo({
            pass: generateAuth.rpc_pass,
            port: spawnDocker.ports['18443/tcp'],
            timeout: readyCheckTimeout,
            user: rpcUser,
          },
          cbk);
        },
        err => {
          // Exit early when bitcoind is responding
          if (!err) {
            return cbk();
          }

          // Stop the container when bitcoind never responds
          return spawnDocker.kill({}, () => cbk(err));
        });
      }],

      // Final docker object
      spawned: [
        'checkReady',
        'generateAuth',
        'spawnDocker',
        ({generateAuth, spawnDocker}, cbk) =>
      {
        return cbk(null, {
          host: spawnDocker.host,
          kill: spawnDocker.kill,
          rpc_pass: generateAuth.rpc_pass,
          rpc_port: spawnDocker.ports['18443/tcp'],
          rpc_user: rpcUser,
          zmq_block_port: zmqBlockPort(args),
          zmq_tx_port: zmqTxPort(args),
        });
      }],
    },
    returnResult({reject, resolve, of: 'spawned'}, cbk));
  });
};
