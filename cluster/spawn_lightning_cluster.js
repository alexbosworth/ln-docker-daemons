const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncMapSeries = require('async/mapSeries');
const asyncRetry = require('async/retry');
const {authenticatedLndGrpc} = require('lightning');
const {returnResult} = require('asyncjs-util');

const generateBlocks = require('./generate_blocks');
const {setupChannel} = require('./../setup');
const {spawnLightningDocker} = require('./../lnd');

const count = size => size || 1;
const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';
const interval = 10;
const {isInteger} = Number;
const line = arr => arr.slice(1).map((_, i) => [i, i + 1]);
const pairs = n => n.map((x, i) => n.slice(i + 1).map(y => [x, y])).flat();
const started = all => all.filter(n => !!n.value).map(n => n.value);

// Stop nodes for cleanup, ignoring any failures to stop them
const stopNodes = (nodes, cbk) => {
  return asyncEach(nodes, ({kill}, cbk) => kill({}, () => cbk()), cbk);
};

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
      spawn: ['validate', ({}, cbk) => {
        return asyncRetry({interval, times: 25}, cbk => {
          const spawning = [...Array(count(args.size))].map(() => {
            return spawnLightningDocker({
              generate_address: generateAddress,
              lnd_configuration: args.lnd_configuration,
            });
          });

          // Wait for every node to finish starting, even when one fails
          return Promise.allSettled(spawning).then(spawned => {
            const failure = spawned.find(n => n.status === 'rejected');

            // Stop the nodes that started so they are not left running
            if (!!failure) {
              return stopNodes(started(spawned), () => cbk(failure.reason));
            }

            return cbk(null, started(spawned).map(lightningDocker => {
              const id = lightningDocker.public_key;

              const {lnd} = authenticatedLndGrpc({
                cert: lightningDocker.cert,
                macaroon: lightningDocker.macaroon,
                socket: lightningDocker.socket,
              });

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
            }));
          });
        },
        cbk);
      }],

      // Connect nodes in the cluster to each other
      connect: ['spawn', ({spawn}, cbk) => {
        return asyncEach(pairs(spawn), (pair, cbk) => {
          const [a, b] = pair.map(({chain}) => chain);

          return a.addPeer({socket: b.socket}).then(() => cbk(), cbk);
        },
        cbk);
      }],

      // Open channels between neighboring nodes, one at a time
      channels: ['connect', 'spawn', ({spawn}, cbk) => {
        // Exit early when there is no channel capacity to create channels
        if (!args.capacity) {
          return cbk(null, []);
        }

        return asyncMapSeries(line(spawn), ([from, to], cbk) => {
          return setupChannel({
            capacity: args.capacity,
            generate: spawn[from].generate,
            lnd: spawn[from].lnd,
            to: spawn[to],
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            return cbk(null, {
              from,
              to,
              id: res.id,
              transaction_id: res.transaction_id,
              transaction_vout: res.transaction_vout,
            });
          });
        },
        cbk);
      }],

      // Final set of nodes
      nodes: ['channels', 'connect', 'spawn', ({channels, spawn}, cbk) => {
        return cbk(null, {
          channels,
          kill: ({}) => asyncEach(spawn, ({kill}, cbk) => kill({}, cbk)),
          nodes: spawn.map(node => ({
            generate: node.generate,
            id: node.id,
            kill: node.kill,
            lnd: node.lnd,
            rpc: node.rpc,
            socket: node.socket,
            tower: node.tower,
          })),
        });
      }],
    },
    (err, res) => {
      // Stop the spawned nodes when the cluster cannot be set up
      if (!!err && !!res && !!res.spawn) {
        return stopNodes(res.spawn, () => {
          return returnResult({reject, resolve}, cbk)(err);
        });
      }

      return returnResult({reject, resolve, of: 'nodes'}, cbk)(err, res);
    });
  });
};
