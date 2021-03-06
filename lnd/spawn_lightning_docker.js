const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {generateToAddress} = require('./../bitcoinrpc');
const {killDockers} = require('./../docker');
const {spawnBitcoindDocker} = require('./../bitcoind');
const spawnLndDocker = require('./spawn_lnd_docker');

/** Spawn an LND Docker

  {
    chain_p2p_port: <Chain Network P2P Listen Port Number>
    chain_rpc_port: <Chain Node RPC Port Number>
    chain_zmq_block_port: <Chain Node ZMQ Blocks Port Number>
    chain_zmq_tx_port: <Chain Node ZMQ Transactions Port Number>
    generate_address: <Generate Blocks to Address String>
    lightning_p2p_port: <Lightning Network P2P Listen Port Number>
    lightning_rpc_port: <Lightning Node RPC Port Number>
  }

  @returns via cbk or Promise
  {
    cert: <LND Base64 Serialized TLS Cert>
    kill: ({}, [cbk]) => <Kill LND Daemon Promise>
    macaroon: <LND Base64 Serialized Macaroon String>
    public_key: <Identity Public Key Hex String>
    socket: <LND RPC Host:Port Network Address String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.chain_p2p_port) {
          return cbk([400, 'ExpectedBlockchainDaemonP2pPortToSpawnLnDocker']);
        }

        if (!args.chain_rpc_port) {
          return cbk([400, 'ExpecteddChainRpcPortToSpawnLightningDocker']);
        }

        if (!args.chain_zmq_block_port) {
          return cbk([400, 'ExpectedChainZmqBlockPortToSpawnLightningDocker']);
        }

        if (!args.chain_zmq_tx_port) {
          return cbk([400, 'ExpectedChainZmqTxPortToSpawnLightningDocker']);
        }

        if (!args.generate_address) {
          return cbk([400, 'ExpectedGenerateAddressToSpawnLightningDocker']);
        }

        if (!args.lightning_p2p_port) {
          return cbk([400, 'ExpectedLnP2pPortToSpawnLightningDocker']);
        }

        if (!args.lightning_rpc_port) {
          return cbk([400, 'ExpectedLnRpcPortToSpawnLightningDocker']);
        }

        return cbk();
      },

      // Spawn the Bitcoin Core chain daemon
      spawnChainDaemon: ['validate', ({}, cbk) => {
        return spawnBitcoindDocker({
          p2p_port: args.chain_p2p_port,
          rpc_port: args.chain_rpc_port,
          zmq_block_port: args.chain_zmq_block_port,
          zmq_tx_port: args.chain_zmq_tx_port,
        },
        cbk);
      }],

      // Generate a block, necessary before starting LND
      generateBlock: ['spawnChainDaemon', ({spawnChainDaemon}, cbk) => {
        return generateToAddress({
          address: args.generate_address,
          pass: spawnChainDaemon.rpc_pass,
          port: args.chain_rpc_port,
          user: spawnChainDaemon.rpc_user,
        },
        cbk);
      }],

      // Spawn the LND lightning daemon
      spawnLightningDaemon: [
        'generateBlock',
        'spawnChainDaemon',
        ({spawnChainDaemon}, cbk) =>
      {
        return spawnLndDocker({
          bitcoind_rpc_host: spawnChainDaemon.host,
          bitcoind_rpc_pass: spawnChainDaemon.rpc_pass,
          bitcoind_rpc_port: args.chain_rpc_port,
          bitcoind_rpc_user: spawnChainDaemon.rpc_user,
          bitcoind_zmq_block_port: args.chain_zmq_block_port,
          bitcoind_zmq_tx_port: args.chain_zmq_tx_port,
          p2p_port: args.lightning_p2p_port,
          rpc_port: args.lightning_rpc_port,
        },
        cbk);
      }],

      // Return the result
      daemon: [
        'spawnChainDaemon',
        'spawnLightningDaemon',
        ({spawnChainDaemon, spawnLightningDaemon}, cbk) =>
      {
        const dockers = [spawnChainDaemon, spawnLightningDaemon];

        return cbk(null, {
          cert: spawnLightningDaemon.cert,
          kill: ({}, cbk) => killDockers({dockers}, cbk),
          macaroon: spawnLightningDaemon.macaroon,
          public_key: spawnLightningDaemon.public_key,
          socket: spawnLightningDaemon.socket,
        });
      }],
    },
    returnResult({reject, resolve, of: 'daemon'}, cbk));
  });
};
