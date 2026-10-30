const {authenticatedLndGrpc} = require('lightning');
const {deepEqual} = require('node:assert').strict;
const {getWalletInfo} = require('lightning');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const bitcoindDaemon = require('./../docker/bitcoind_daemon');
const {dockerBitcoindImage} = require('./../../bitcoind/constants');
const {dockerLndImage} = require('./../../lnd/constants');
const fakeDocker = require('./../docker/fake_docker');
const {getBlockchainInfo} = require('./../../bitcoinrpc');
const {hashAt} = require('./../bitcoinrpc/fake_bitcoind');
const lndDaemon = require('./../docker/lnd_daemon');
const method = require('./../../lnd/spawn_lightning_docker');
const {nodeKey} = require('./fake_lnd_server');

const flag = (cmd, k) => cmd.find(n => n.startsWith(k)).slice(k.length);
const images = [dockerBitcoindImage, dockerLndImage];
const isChainArg = arg => arg.startsWith('--bitcoind.') && !isPass(arg);
const isPass = arg => arg.startsWith('--bitcoind.rpcpass=');
const running = containers => containers.filter(n => !n.is_removed);

// Tests use the default LND version, whatever is set for the shell
delete process.env.DOCKER_LND_VERSION;

// Spawn Bitcoin Core with LND, use the pair, describe it, then stop it
const spawn = async ({args, bitcoinds, fake}) => {
  const res = await method(args);

  const [chain, lightning] = fake.containers;
  const [bitcoind] = bitcoinds;

  // LND logs in to Bitcoin Core with the credentials Bitcoin Core has
  const login = await getBlockchainInfo({
    pass: flag(lightning.Cmd, '--bitcoind.rpcpass='),
    port: chain.ports['18443/tcp'],
    user: flag(lightning.Cmd, '--bitcoind.rpcuser='),
  });

  // LND only answers when the connection details returned are right
  const {lnd} = authenticatedLndGrpc({
    cert: res.cert,
    macaroon: res.macaroon,
    socket: res.socket,
  });

  const wallet = await getWalletInfo({lnd});

  // The chain of the pair can be controlled
  await res.add_chain_peer({socket: '172.17.0.9'});

  const generated = await res.generate({address: 'other', count: 2});

  const block = await res.get_block_info({id: hashAt(4)});

  await res.kill({});

  return {
    generated,
    block: block.hash,
    chain: lightning.Cmd.filter(isChainArg),
    chain_blocks: login.blocks,
    chain_peers: bitcoind.peers,
    chain_socket: res.chain_socket,
    last_argument: lightning.Cmd[lightning.Cmd.length - 1],
    ln_socket: res.ln_socket,
    mined_to: bitcoind.addresses,
    public_key: res.public_key,
    wallet_public_key: wallet.public_key,
  };
};

// Start a fake Docker that runs a fake bitcoind and a fake LND
const startDocker = async ({bitcoind, docker}) => {
  const bitcoinds = [];

  const fake = await fakeDocker({
    images,
    daemons: {
      [dockerBitcoindImage]: bitcoindDaemon({...bitcoind, started: bitcoinds}),
      [dockerLndImage]: lndDaemon({started: []}),
    },
    ...docker,
  });

  return {bitcoinds, fake};
};

const tests = [
  {
    args: {generate_address: 'address', lnd_configuration: ['--alias=fake']},
    description: 'A Bitcoin Core and LND pair is started and controlled',
    expected: {
      block: hashAt(4),
      chain: [
        '--bitcoind.rpchost=172.17.0.2:18443',
        '--bitcoind.rpcuser=bitcoinrpc',
        '--bitcoind.zmqpubrawblock=tcp://172.17.0.2:28332',
        '--bitcoind.zmqpubrawtx=tcp://172.17.0.2:28333',
      ],
      chain_blocks: 2,
      chain_peers: ['172.17.0.9'],
      chain_socket: '172.17.0.2',
      generated: [hashAt(3), hashAt(4)],
      last_argument: '--alias=fake',
      ln_socket: '172.17.0.3:9735',
      mined_to: ['genesis', 'address', 'other', 'other'],
      public_key: nodeKey(1),
      wallet_public_key: nodeKey(1),
    },
  },
  {
    args: {},
    description: 'A generate address is expected',
    error: [400, 'ExpectedGenerateAddressToSpawnLightningDocker'],
  },
  {
    args: {generate_address: 'address'},
    bitcoind: {generate: 'error'},
    description: 'A failure to mine the first block stops Bitcoin Core',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'generatetoaddress', code: -5, message: 'Invalid address'},
    ],
  },
  {
    args: {generate_address: 'address'},
    description: 'A failure to start LND stops Bitcoin Core',
    docker: {fail: {creates: [dockerLndImage]}},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
  {
    args: {generate_address: 'address'},
    description: 'A failure to start Bitcoin Core is returned',
    docker: {fail: {creates: [dockerBitcoindImage]}},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
];

tests.forEach(({args, bitcoind, description, docker, error, expected}) => {
  return test(description, async t => {
    const {bitcoinds, fake} = await startDocker({bitcoind, docker});

    t.after(fake.kill);

    const call = spawn({args, bitcoinds, fake});

    if (!!error) {
      await rejects(call, error);
    } else {
      deepEqual(await call, expected);
    }

    // Nothing is left running
    return deepEqual(running(fake.containers), []);
  });
});
