const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {addPeer} = require('./../bitcoinrpc');
const {generateToAddress} = require('./../bitcoinrpc');
const {getBlockInfo} = require('./../bitcoinrpc');
const {killDockers} = require('./../docker');
const {spawnBitcoindDocker} = require('./../bitcoind');
const spawnLndDocker = require('./spawn_lnd_docker');

const defaultBitcoindRpcPort = 18443;

/** Spawn an LND Docker

  {
    chain_p2p_port: <Chain Network P2P Listen Port Number>
    chain_rpc_port: <Chain Node RPC Port Number>
    chain_zmq_block_port: <Chain Node ZMQ Blocks Port Number>
    chain_zmq_tx_port: <Chain Node ZMQ Transactions Port Number>
    generate_address: <Generate Blocks to Address String>
    lightning_p2p_port: <Lightning Network P2P Listen Port Number>
    lightning_rpc_port: <Lightning Node RPC Port Number>
    lightning_tower_port: <Lightning Tower Port Number>
    [lnd_configuration]: [<LND Configuration Argument String>]
    [seed]: <Mnemonic Seed String>
  }

  @returns via cbk or Promise
  {
    add_chain_peer: <Add Peer Function> ({socket}) => {}
    cert: <LND Base64 Serialized TLS Cert>
    chain_socket: <Chain P2P Socket String>
    generate: ({address, count}, cbk) => <Generate to Address Promise>
    get_block_info: <Get Block Info Function> ({id}) => {}
    kill: ({}, [cbk]) => <Kill LND Daemon Promise>
    ln_socket: <LN P2P Socket String>
    macaroon: <LND Base64 Serialized Macaroon String>
    public_key: <Identity Public Key Hex String>
    socket: <LND RPC Host:Port Network Address String>
    tower_socket: <LND Tower Socket Host:Port Network Address String>
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

        if (!args.lightning_tower_port) {
          return cbk([400, 'ExpectedLnTowerPortToSpawnLightningDocker']);
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
          configuration: args.lnd_configuration,
          bitcoind_rpc_host: spawnChainDaemon.host,
          bitcoind_rpc_pass: spawnChainDaemon.rpc_pass,
          bitcoind_rpc_port: defaultBitcoindRpcPort,
          bitcoind_rpc_user: spawnChainDaemon.rpc_user,
          bitcoind_zmq_block_port: args.chain_zmq_block_port,
          bitcoind_zmq_tx_port: args.chain_zmq_tx_port,
          p2p_port: args.lightning_p2p_port,
          rpc_port: args.lightning_rpc_port,
          tower_port: args.lightning_tower_port,
          seed: args.seed,
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
          add_chain_peer: ({socket}) => addPeer({
            socket,
            pass: spawnChainDaemon.rpc_pass,
            port: args.chain_rpc_port,
            user: spawnChainDaemon.rpc_user,
          }),
          cert: spawnLightningDaemon.cert,
          chain_socket: `${spawnChainDaemon.host}`,
          generate: ({address, count}) => generateToAddress({
            address,
            count,
            pass: spawnChainDaemon.rpc_pass,
            port: args.chain_rpc_port,
            user: spawnChainDaemon.rpc_user,
          }),
          get_block_info: ({id}) => getBlockInfo({
            id,
            pass: spawnChainDaemon.rpc_pass,
            port: args.chain_rpc_port,
            user: spawnChainDaemon.rpc_user,
          }),
          kill: ({}, cbk) => killDockers({dockers}, cbk),
          macaroon: spawnLightningDaemon.macaroon,
          ln_socket: `${spawnLightningDaemon.host}:9735`,
          public_key: spawnLightningDaemon.public_key,
          socket: spawnLightningDaemon.socket,
          tower_socket: spawnLightningDaemon.tower_socket,
        });
      }],
    },
    returnResult({reject, resolve, of: 'daemon'}, cbk));
  });
};
