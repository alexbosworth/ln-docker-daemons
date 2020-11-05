const {spawnBitcoindDocker} = require('./bitcoind');
const {spawnLightningDocker} =  require('./lnd');

module.exports = {spawnBitcoindDocker, spawnLightningDocker};
