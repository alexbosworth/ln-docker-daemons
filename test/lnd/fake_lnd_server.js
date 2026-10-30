const {dirname} = require('node:path');
const {join} = require('node:path');
const {promisify} = require('node:util');
const {randomBytes} = require('node:crypto');
const {readFileSync} = require('node:fs');

const grpc = require('@grpc/grpc-js');
const {loadSync} = require('@grpc/proto-loader');

const fakeLnd = require('./../setup/fake_lnd');

const cert = readFileSync(join(__dirname, 'fake_lnd.cert'));
const key = readFileSync(join(__dirname, 'fake_lnd.key'));
const nodeKey = index => `03${String(index).padStart(64, '0')}`;
const protos = join(dirname(require.resolve('lightning')), 'grpc', 'protos');
const seed = [...Array(24)].map((_, i) => `word${i}`);
const txId = Buffer.alloc(32).toString('hex');

// The gRPC API of LND, loaded the way the lightning package loads it
const {lnrpc} = grpc.loadPackageDefinition(loadSync(
  ['lightning.proto', 'walletunlocker.proto'].map(n => join(protos, n)),
  {
    defaults: true,
    enums: String,
    includeDirs: [protos],
    keepCase: true,
    longs: String,
    oneofs: true,
  },
));

/** Start a fake LND that answers over TLS gRPC like a regtest node

  {
    [failures]: [<Fail Next Call to genSeed or initWallet String>]
    index: <Node Identity Index Number>
  }

  @returns via Promise
  {
    calls: [<Called Method Name String>]
    cert: <TLS Certificate PEM Buffer Object>
    kill: () => <Stop Server>
    macaroon: <Admin Macaroon Buffer Object>
    port: <Listening Port Number>
    public_key: <Identity Public Key Hex String>
    wallet: {
      [seed]: [<Seed Word the Wallet Was Created With String>]
    }
  }
*/
module.exports = async args => {
  const calls = [];
  const {lnd} = fakeLnd({listed: [true], pending: [true], policies: [true]});
  const failures = [...(args.failures || [])];
  const macaroon = randomBytes(32);
  const publicKey = nodeKey(args.index);
  const wallet = {};

  // Record a call, returning true when it should fail this time
  const isFailing = method => {
    calls.push(method);

    const failing = failures.indexOf(method);

    if (failing === -1) {
      return false;
    }

    failures.splice(failing, 1);

    return true;
  };

  // Answer a call only when it presents the admin macaroon
  const authorized = (method, answer) => (call, cbk) => {
    const [presented] = call.metadata.get('macaroon');

    calls.push(method);

    if (presented !== macaroon.toString('hex')) {
      return cbk({code: grpc.status.UNAUTHENTICATED, details: 'bad macaroon'});
    }

    return answer(call.request, (err, res) => {
      if (!!err) {
        return cbk({code: grpc.status.UNKNOWN, details: err.message});
      }

      return cbk(null, res);
    });
  };

  const server = new grpc.Server();

  server.addService(lnrpc.WalletUnlocker.service, {
    genSeed: (call, cbk) => {
      if (isFailing('genSeed')) {
        return cbk({code: grpc.status.UNAVAILABLE, details: 'not ready'});
      }

      return cbk(null, {cipher_seed_mnemonic: seed});
    },

    initWallet: (call, cbk) => {
      if (isFailing('initWallet')) {
        return cbk({code: grpc.status.UNAVAILABLE, details: 'not ready'});
      }

      wallet.seed = call.request.cipher_seed_mnemonic;

      return cbk(null, {admin_macaroon: macaroon});
    },
  });

  server.addService(lnrpc.Lightning.service, {
    connectPeer: authorized('connectPeer', lnd.default.connectPeer),
    getChanInfo: authorized('getChanInfo', lnd.default.getChanInfo),
    getInfo: authorized('getInfo', ({}, cbk) => cbk(null, {
      alias: 'fake',
      best_header_timestamp: '1',
      block_hash: '0'.repeat(64),
      block_height: 1,
      chains: [{chain: 'bitcoin', network: 'regtest'}],
      color: '#000000',
      identity_pubkey: publicKey,
      synced_to_chain: true,
      version: '0.21.4-beta',
    })),
    listChannels: authorized('listChannels', lnd.default.listChannels),
    listUnspent: authorized('listUnspent', ({}, cbk) => cbk(null, {
      utxos: [{
        address: 'bcrt1qfake',
        address_type: 'WITNESS_PUBKEY_HASH',
        amount_sat: '5000000000',
        confirmations: '1',
        outpoint: {output_index: 0, txid_str: txId},
        pk_script: '00',
      }],
    })),
    newAddress: authorized('newAddress', ({}, cbk) => {
      return cbk(null, {address: 'bcrt1qfake'});
    }),
    openChannel: call => {
      calls.push('openChannel');

      const opening = lnd.default.openChannel(call.request);

      return opening.on('data', update => call.write(update));
    },
    pendingChannels: authorized(
      'pendingChannels',
      lnd.default.pendingChannels,
    ),
  });

  const bind = promisify(server.bindAsync.bind(server));
  const credentials = grpc.ServerCredentials.createSsl(null, [{
    cert_chain: cert,
    private_key: key,
  }]);

  const port = await bind('127.0.0.1:0', credentials);

  return {
    calls,
    cert,
    macaroon,
    port,
    kill: () => server.forceShutdown(),
    wallet,
    public_key: publicKey,
  };
};

module.exports.nodeKey = nodeKey;
