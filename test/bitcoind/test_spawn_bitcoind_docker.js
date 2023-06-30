const test = require('node:test');

const {findFreePorts} = require('find-free-ports');

const {spawnBitcoindDocker} = require('./../../');

// Spawning a Bitcoin Core docker image should launch
test('Spawn Bitcoin Core Docker image', async () => {
  const [p2pPort, rpcPort, zmqBlockPort, zmqTxPort] = await findFreePorts(
    4,
    {startPort: 5000}
  );

  const {kill} = await spawnBitcoindDocker({
    p2p_port: p2pPort,
    rpc_port: rpcPort,
    zmq_block_port: zmqBlockPort,
    zmq_tx_port: zmqTxPort,
  });

  await kill({});

  return;
});
