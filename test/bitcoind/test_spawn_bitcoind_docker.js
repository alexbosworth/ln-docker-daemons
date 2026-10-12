const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {getBlockchainInfo} = require('./../../bitcoinrpc');
const {spawnBitcoindDocker} = require('./../../');

// Spawning a Bitcoin Core docker image should launch
test('Spawn Bitcoin Core Docker image', async () => {
  const bitcoind = await spawnBitcoindDocker({});

  try {
    // Docker picked a free port for RPC and bitcoind answers on it
    const {blocks} = await getBlockchainInfo({
      pass: bitcoind.rpc_pass,
      port: bitcoind.rpc_port,
      user: bitcoind.rpc_user,
    });

    deepEqual(blocks, 0);
  } finally {
    await bitcoind.kill({});
  }

  return;
});
