const {test} = require('@alexbosworth/tap');

const {spawnLightningDocker} = require('./../../');

// Spawning a Lightning node docker image should launch
test('Spawn Lightning node image', async ({end}) => {
  const {kill} = await spawnLightningDocker({
    chain_p2p_port: 18458,
    chain_rpc_port: 18459,
    chain_zmq_block_port: 18460,
    chain_zmq_tx_port: 18461,
    generate_address: '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF',
    lightning_p2p_port: 18462,
    lightning_rpc_port: 1863,
  });

  await kill({});

  return end();
});
