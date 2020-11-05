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
const deriveHmac = (s, p) => createHmac('sha256', s).update(p).digest('hex');
const generateAuthSalt = () => randomBytes(16).toString('hex');
const generatePassword = () => randomBytes(32).toString('base64');
const interval = 100;
const times = 100;
const trim = string => string.replace(/=+$/g, '');

/** Spawn a Bitcoin Core Docker image

  {
    p2p_port: <P2P Port Number>
    rpc_port: <RPC Port Number>
    zmq_block_port: <ZMQ Blocks Port Number>
    zmq_tx_port: <ZMQ Transactions Port Number>
  }

  @returns via cbk or Promise
  {
    kill: ({}, [cbk]) => <Kill Promise>
    rpc_pass: <RPC Password String>
    rpc_user: <RPC Username String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.p2p_port) {
          return cbk([400, 'ExpectedPeerListenPortToSpawnBitcoindDocker']);
        }

        if (!args.rpc_port) {
          return cbk([400, 'ExpectedRpcListenPortToSpawnBitcoindDocker']);
        }

        if (!args.zmq_block_port) {
          return cbk([400, 'ExpectedZmqBlocksPortToSpawnBitcoindDocker']);
        }

        if (!args.zmq_tx_port) {
          return cbk([400, 'ExpectedZmqTxPortToSpawnBitcoindDocker']);
        }

        return cbk();
      },

      // Generate auth
      generateAuth: ['validate', ({}, cbk) => {
        const pass = trim(clean(generatePassword()));
        const salt = generateAuthSalt();

        return cbk(null, {
          rpc_auth: `${rpcUser}:${salt}$${deriveHmac(salt, pass)}`,
          rpc_pass: pass,
        });
      }],

      // Spawn the docker image
      spawnDocker: ['generateAuth', ({generateAuth}, cbk) => {
        return spawnDockerImage({
          arguments: [
            '--disablewallet',
            '--persistmempool=false',
            '--printtoconsole',
            '--regtest',
            '--rpcallowip=172.17.0.0/16',
            `--rpcauth=${generateAuth.rpc_auth}`,
            '--rpcbind=0.0.0.0',
            '--server',
            '--txindex',
            `--zmqpubrawblock=tcp://*:${args.zmq_block_port}`,
            `--zmqpubrawtx=tcp://*:${args.zmq_tx_port}`,
          ],
          expose: [
            '18443/tcp',
            '18444/tcp',
            [`${args.zmq_block_port}/tcp`],
            [`${args.zmq_tx_port}/tcp`],
          ],
          image: dockerBitcoindImage,
          ports: {
            '18443/tcp': args.rpc_port,
            '18444/tcp': args.p2p_port,
            [`${args.zmq_block_port}/tcp`]: args.zmq_block_port,
            [`${args.zmq_tx_port}/tcp`]: args.zmq_tx_port,
          },
        },
        cbk);
      }],

      // Wait for the image to respond to a query
      checkReady: ['generateAuth', 'spawnDocker', ({generateAuth}, cbk) => {
        return asyncRetry({interval, times}, cbk => {
          return getBlockchainInfo({
            pass: generateAuth.rpc_pass,
            port: args.rpc_port,
            user: rpcUser,
          },
          cbk);
        },
        cbk);
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
          rpc_user: rpcUser,
        });
      }],
    },
    returnResult({reject, resolve, of: 'spawned'}, cbk));
  });
};
