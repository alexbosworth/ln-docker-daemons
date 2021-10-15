const asyncAuto = require('async/auto');
const asyncMap = require('async/map');
const {authenticatedLndGrpc} = require('lightning');
const {findFreePorts} = require('find-free-ports');
const {getIdentity} = require('lightning');
const {returnResult} = require('asyncjs-util');

const {spawnLightningDocker} = require('./../lnd');

const chunk = (arr, n, size) => [...Array(size)].map(_ => arr.splice(0, n));
const count = size => size || 1;
const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';
const portsPerLnd = 6;

/** Spawn a cluster of nodes

  {
    [size]: <Total Lightning Nodes Number>
  }

  @returns via cbk or Promise
  {
    nodes: [{
      generate: ({address}, [cbk]) => {}
      id: <Node Public Key Hex String>
      kill: <Kill Function> ({}, cbk) => {}
      lnd: <Authenticated LND API Object>
    }]
  }
*/
module.exports = ({size}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Find ports for the requested daemons
      findPorts: async () => {
        return await findFreePorts(portsPerLnd * count(size));
      },

      // Spawn nodes
      spawn: ['findPorts', async ({findPorts}) => {
        const nodes = chunk(findPorts, portsPerLnd, count(size));

        return await asyncMap(nodes, async (ports) => {
          const [
            chainP2pPort,
            chainRpcPort,
            chainZmqBlockPort,
            chainZmqTxPort,
            lightningP2pPort,
            lightningRpcPort,
          ] = ports;

          const lightningDocker = await spawnLightningDocker({
            chain_p2p_port: chainP2pPort,
            chain_rpc_port: chainRpcPort,
            chain_zmq_block_port: chainZmqBlockPort,
            chain_zmq_tx_port: chainZmqTxPort,
            generate_address: generateAddress,
            lightning_p2p_port: lightningP2pPort,
            lightning_rpc_port: lightningRpcPort,
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
            generate: lightningDocker.generate,
            kill: lightningDocker.kill,
          };
        });
      }],

      // Final set of nodes
      nodes: ['spawn', async ({spawn}) => {
        return {nodes: spawn};
      }],
    },
    returnResult({reject, resolve, of: 'nodes'}, cbk));
  });
};
