const fakeBitcoind = require('./../bitcoinrpc/fake_bitcoind');

const authFlag = '--rpcauth=';
const rpcPort = '18443/tcp';

/** Make a fake Docker daemon starter that runs a fake bitcoind

  {
    [failing_count]: <Reject Requests to Mine This Many Blocks Number>
    [generate]: <Fake bitcoind First Generate Call Behavior String>
    [is_refusing_peers]: <Fail Requests to Add a Peer Bool>
    started: [<Started Fake bitcoind Object>]
  }

  @returns
  <Start Daemon Function> ({cmd}) => <Started Daemon Promise>
*/
module.exports = args => async ({cmd}) => {
  const bitcoind = await fakeBitcoind({
    addresses: ['genesis'],
    auth: cmd.find(n => n.startsWith(authFlag)).slice(authFlag.length),
    failing_count: args.failing_count,
    generate: args.generate,
    is_refusing_peers: args.is_refusing_peers,
  });

  args.started.push(bitcoind);

  return {files: {}, kill: bitcoind.kill, ports: {[rpcPort]: bitcoind.port}};
};
