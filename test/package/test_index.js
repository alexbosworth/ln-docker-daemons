const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const lnDockerDaemons = require('./../../');

test('The package exports its methods', () => {
  const exported = Object.keys(lnDockerDaemons);

  deepEqual(exported, [
    'setupChannel',
    'spawnBitcoindDocker',
    'spawnLightningCluster',
    'spawnLightningDocker',
    'spawnLndDocker',
  ]);

  return deepEqual(exported.every(n => !!lnDockerDaemons[n].call), true);
});
