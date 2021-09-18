const {spawnBitcoindDocker} = require('./bitcoind');
const {spawnLightningCluster} = require('./cluster');
const {spawnLightningDocker} =  require('./lnd');

module.exports = {
  spawnBitcoindDocker,
  spawnLightningCluster,
  spawnLightningDocker,
};
