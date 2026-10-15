const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {authenticatedLndGrpc} = require('lightning');
const {getIdentity} = require('lightning');

const {spawnLightningDocker} = require('./../../');

const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';

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
