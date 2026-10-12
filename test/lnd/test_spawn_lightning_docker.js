const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {authenticatedLndGrpc} = require('lightning');
const {getIdentity} = require('lightning');

const {spawnLightningDocker} = require('./../../');

const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';

// Spawning a Lightning node docker image should launch
test('Spawn Lightning node image', async () => {
  const {kill, socket} = await spawnLightningDocker({
    chain_p2p_port: 18458,
    chain_rpc_port: 18459,
    chain_zmq_block_port: 18460,
    chain_zmq_tx_port: 18461,
    generate_address: generateAddress,
    lightning_p2p_port: 18462,
    lightning_rpc_port: 18463,
    lightning_tower_port: 18464,
  });

  await kill({});

  // The node is reached on the RPC port that was asked for
  deepEqual(socket, 'localhost:18463');

  return;
});

// Spawning without ports should use free ports that Docker picks
test('Spawn Lightning node image on free ports', async () => {
  const node = await spawnLightningDocker({generate_address: generateAddress});

  try {
    const {lnd} = authenticatedLndGrpc({
      cert: node.cert,
      macaroon: node.macaroon,
      socket: node.socket,
    });

    deepEqual((await getIdentity({lnd})).public_key, node.public_key);
  } finally {
    await node.kill({});
  }

  return;
});
