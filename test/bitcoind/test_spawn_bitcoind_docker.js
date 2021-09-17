const {test} = require('@alexbosworth/tap');

const {spawnBitcoindDocker} = require('./../../');

// Spawning a Bitcoin Core docker image should launch
test('Spawn Bitcoin Core Docker image', async ({end}) => {
  const {kill} = await spawnBitcoindDocker({
    p2p_port: 18458,
    rpc_port: 18459,
    zmq_block_port: 18460,
    zmq_tx_port: 18461,
  });

  await kill({});

  return end();
});
