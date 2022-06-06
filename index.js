const {setupChannel} = require('./setup');
const {spawnBitcoindDocker} = require('./bitcoind');
const {spawnLightningCluster} = require('./cluster');
const {spawnLightningDocker} =  require('./lnd');

module.exports = {
  setupChannel,
  spawnBitcoindDocker,
  spawnLightningCluster,
  spawnLightningDocker,
};
