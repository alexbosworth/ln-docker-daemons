const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncMap = require('async/map');
const asyncMapSeries = require('async/mapSeries');
const asyncRetry = require('async/retry');
const {authenticatedLndGrpc} = require('lightning');
const {findFreePorts} = require('find-free-ports');
const {getIdentity} = require('lightning');
const {returnResult} = require('asyncjs-util');

const generateBlocks = require('./generate_blocks');
const {setupChannel} = require('./../setup');
const {spawnLightningDocker} = require('./../lnd');

const between = (min, max) => Math.floor(Math.random() * (max - min) + min);
const chunk = (arr, n, size) => [...Array(size)].map(_ => arr.splice(0, n));
const count = size => size || 1;
const endPort = 65000;
const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';
const interval = 10;
const {isInteger} = Number;
const line = arr => arr.slice(1).map((_, i) => [i, i + 1]);
const pairs = n => n.map((x, i) => n.slice(i + 1).map(y => [x, y])).flat();
const portsPerLnd = 7;
const startPort = 1025;

/** Spawn a cluster of nodes

  When a channel capacity is specified, each node opens a channel of that size
  to the next node, so the nodes form a line: A -> B -> C

  {
    [capacity]: <Channel Capacity Tokens Number>
    [lnd_configuration]: [<LND Configuration Argument String>]
    [size]: <Total Lightning Nodes Number>
  }

  @returns via cbk or Promise
  {
    channels: [{
      from: <Opening Node Index Number>
      id: <Standard Format Channel Id String>
      to: <Partner Node Index Number>
      transaction_id: <Funding Transaction Id Hex String>
      transaction_vout: <Funding Transaction Output Index Number>
    }]
    kill: <Kill All Nodes Function> ({}) => {}
    nodes: [{
      generate: <Make Block Function> ({address, count}, [cbk]) => {}
      id: <Node Public Key Hex String>
      kill: <Kill Function> ({}, cbk) => {}
      lnd: <Authenticated LND API Object>
      rpc: <RPC Connection Function> ({macaroon}) => {}
      socket: <Node Socket String>
      tower: <LND Tower Socket Host:Port Network Address String>
    }]
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (args.capacity === undefined) {
          return cbk();
        }

        if (!isInteger(args.capacity) || args.capacity <= 0) {
          return cbk([400, 'ExpectedPositiveClusterChannelCapacity']);
        }

        return cbk();
      },

      // Spawn nodes
      spawn: ['validate', async () => {
        return await asyncRetry({interval, times: 25}, async () => {
          const options = {startPort: between(startPort, endPort)};

          // Find ports for the requested daemons
          const findPorts = await findFreePorts(
            portsPerLnd * count(args.size),
            options
          );

          const nodes = chunk(findPorts, portsPerLnd, count(args.size));

          return await asyncMap(nodes, async (ports) => {
            const [
              chainP2pPort,
              chainRpcPort,
              chainZmqBlockPort,
              chainZmqTxPort,
              lightningP2pPort,
              lightningRpcPort,
              lightningTowerPort,
            ] = ports;

            const lightningDocker = await spawnLightningDocker({
              chain_p2p_port: chainP2pPort,
              chain_rpc_port: chainRpcPort,
              chain_zmq_block_port: chainZmqBlockPort,
              chain_zmq_tx_port: chainZmqTxPort,
              generate_address: generateAddress,
              lightning_p2p_port: lightningP2pPort,
              lightning_rpc_port: lightningRpcPort,
              lightning_tower_port: lightningTowerPort,
              lnd_configuration: args.lnd_configuration,
            });

            const {lnd} = authenticatedLndGrpc({
              cert: lightningDocker.cert,
              macaroon: lightningDocker.macaroon,
              socket: lightningDocker.socket,
            });

            const id = (await getIdentity({lnd})).public_key;

            return {
              id,
              lnd,
              chain: {
                addPeer: lightningDocker.add_chain_peer,
                generateToAddress: lightningDocker.generate,
                getBlockInfo: lightningDocker.get_block_info,
                socket: lightningDocker.chain_socket,
              },
              generate: ({address, count}, cbk) => {
                return generateBlocks({
                  address,
                  count,
                  lnd,
                  generate: lightningDocker.generate,
                },
                cbk);
              },
              kill: lightningDocker.kill,
              public_key: id,
              rpc: ({macaroon}) => {
                const {lnd} = authenticatedLndGrpc({
                  macaroon,
                  cert: lightningDocker.cert,
                  socket: lightningDocker.socket,
                });

                return {lnd};
              },
              socket: lightningDocker.ln_socket,
              tower: lightningDocker.tower_socket,
            };
          });
        });
      }],

      // Connect nodes in the cluster to each other
      connect: ['spawn', async ({spawn}) => {
        return await asyncEach(pairs(spawn), async pair => {
          const [a, b] = pair.map(({chain}) => chain);

          return await a.addPeer({socket: b.socket});
        });
      }],

      // Open channels between neighboring nodes, one at a time
      channels: ['connect', 'spawn', async ({spawn}) => {
        // Exit early when there is no channel capacity to create channels
        if (!args.capacity) {
          return [];
        }

        try {
          return await asyncMapSeries(line(spawn), async ([from, to]) => {
            const opened = await setupChannel({
              capacity: args.capacity,
              generate: spawn[from].generate,
              lnd: spawn[from].lnd,
              to: spawn[to],
            });

            return {
              from,
              to,
              id: opened.id,
              transaction_id: opened.transaction_id,
              transaction_vout: opened.transaction_vout,
            };
          });
        } catch (err) {
          // Clean up the spawned nodes when channel setup fails
          await asyncEach(spawn, async ({kill}) => await kill({}));

          throw err;
        }
      }],

      // Final set of nodes
      nodes: ['channels', 'connect', 'spawn', async ({channels, spawn}) => {
        return {
          channels,
          kill: ({}) => asyncEach(spawn, async ({kill}) => await kill({})),
          nodes: spawn.map(node => ({
            generate: node.generate,
            id: node.id,
            kill: node.kill,
            lnd: node.lnd,
            rpc: node.rpc,
            socket: node.socket,
            tower: node.tower,
          })),
        };
      }],
    },
    returnResult({reject, resolve, of: 'nodes'}, cbk));
  });
};
