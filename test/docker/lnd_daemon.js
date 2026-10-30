const fakeLndServer = require('./../lnd/fake_lnd_server');

const certPath = '/root/.lnd/tls.cert';
const rpcPort = '10009/tcp';

/** Make a fake Docker daemon starter that runs a fake LND

  {
    [failures]: [<Fail Next Call to genSeed or initWallet String>]
    [is_without_cert]: <LND Never Writes Its TLS Certificate Bool>
    started: [<Started Fake LND Object>]
  }

  @returns
  <Start Daemon Function> () => <Started Daemon Promise>
*/
module.exports = args => {
  let starts = 0;

  return async () => {
    // Each LND that starts gets the next identity
    starts += 1;

    const lnd = await fakeLndServer({failures: args.failures, index: starts});

    args.started.push(lnd);

    return {
      files: !!args.is_without_cert ? {} : {[certPath]: lnd.cert},
      kill: lnd.kill,
      ports: {[rpcPort]: lnd.port},
    };
  };
};
