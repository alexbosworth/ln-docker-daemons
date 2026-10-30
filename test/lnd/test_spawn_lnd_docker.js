const {authenticatedLndGrpc} = require('lightning');
const {deepEqual} = require('node:assert').strict;
const {getWalletInfo} = require('lightning');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {dockerLndImage} = require('./../../lnd/constants');
const fakeDocker = require('./../docker/fake_docker');
const fastForward = require('./../docker/fast_forward');
const lndDaemon = require('./../docker/lnd_daemon');
const method = require('./../../lnd/spawn_lnd_docker');
const {nodeKey} = require('./fake_lnd_server');

const {firstPickedPort} = fakeDocker;
const given = [...Array(24)].map((_, i) => `given${i}`);
const isChainArg = arg => arg.startsWith('--bitcoind.');
const newSeed = [...Array(24)].map((_, i) => `word${i}`);
const running = containers => containers.filter(n => !n.is_removed);
const version = 'v0.0.0-test';
const versioned = `lightninglabs/lnd:${version}`;

const chain = {
  bitcoind_rpc_host: '172.17.0.9',
  bitcoind_rpc_pass: 'pass',
  bitcoind_rpc_port: 18443,
  bitcoind_rpc_user: 'user',
};

// The chain backend arguments LND is started with, polling for blocks
const polling = [
  '--bitcoind.rpchost=172.17.0.9:18443',
  '--bitcoind.rpcpass=pass',
  '--bitcoind.rpcuser=user',
  '--bitcoind.rpcpolling',
  '--bitcoind.blockpollinginterval=1s',
  '--bitcoind.txpollinginterval=1s',
];

// Tests pick the LND version explicitly, so ignore any set for the shell
delete process.env.DOCKER_LND_VERSION;

// What LND started with a new seed and ports Docker picks looks like
const makeExpected = overrides => ({
  bindings: {'10009/tcp': [{HostPort: ''}], '9911/tcp': [{HostPort: ''}]},
  calls: ['genSeed', 'initWallet', 'getInfo'],
  chain: polling,
  host: '172.17.0.2',
  image: dockerLndImage,
  last_argument: '--bitcoind.txpollinginterval=1s',
  public_key: nodeKey(1),
  seed: newSeed,
  tower_socket: `localhost:${firstPickedPort}`,
  wallet_public_key: nodeKey(1),
  ...overrides,
});

// Spawn LND, describe what was started, then stop it
const spawn = async ({args, context, fake, started, version}) => {
  // Pick the LND version through the environment, as a user would
  if (!!version) {
    process.env.DOCKER_LND_VERSION = version;

    context.after(() => delete process.env.DOCKER_LND_VERSION);
  }

  const res = await method(args);

  const [{Cmd, HostConfig, Image}] = fake.containers;
  const [node] = started;

  const calls = [...node.calls];

  // LND only answers when the connection details returned are right
  const {lnd} = authenticatedLndGrpc({
    cert: res.cert,
    macaroon: res.macaroon,
    socket: res.socket,
  });

  const wallet = await getWalletInfo({lnd});

  await res.kill({});

  return {
    calls,
    bindings: HostConfig.PortBindings,
    chain: Cmd.filter(isChainArg),
    host: res.host,
    image: Image,
    last_argument: Cmd[Cmd.length - 1],
    public_key: res.public_key,
    seed: node.wallet.seed,
    tower_socket: res.tower_socket,
    wallet_public_key: wallet.public_key,
  };
};

// Start a fake Docker that runs a fake LND for the LND images
const startDocker = async ({docker, lnd}) => {
  const started = [];

  const daemon = lndDaemon({...lnd, started});

  const fake = await fakeDocker({
    daemons: {[dockerLndImage]: daemon, [versioned]: daemon},
    images: [dockerLndImage, versioned],
    ...docker,
  });

  return {fake, started};
};

const tests = [
  {
    args: chain,
    description: 'LND starts with a wallet made from a new seed',
    expected: makeExpected({}),
  },
  {
    args: {
      ...chain,
      bitcoind_zmq_block_port: 28332,
      bitcoind_zmq_tx_port: 28333,
      configuration: ['--alias=fake'],
      p2p_port: 9735,
      rpc_port: 10009,
      seed: given.join(' '),
      tower_port: 9911,
    },
    description: 'LND uses ZMQ, given ports, extra arguments and a given seed',
    expected: makeExpected({
      bindings: {
        '10009/tcp': [{HostPort: '10009'}],
        '9735/tcp': [{HostPort: '9735'}],
        '9911/tcp': [{HostPort: '9911'}],
      },
      chain: [
        '--bitcoind.rpchost=172.17.0.9:18443',
        '--bitcoind.rpcpass=pass',
        '--bitcoind.rpcuser=user',
        '--bitcoind.zmqpubrawblock=tcp://172.17.0.9:28332',
        '--bitcoind.zmqpubrawtx=tcp://172.17.0.9:28333',
      ],
      last_argument: '--alias=fake',
      seed: given,
      tower_socket: 'localhost:9911',
    }),
  },
  {
    args: chain,
    description: 'An LND version picked in the environment is used',
    expected: makeExpected({image: versioned}),
    version,
  },
  {
    args: chain,
    description: 'Creating the wallet is retried until LND is ready',
    expected: makeExpected({
      calls: [
        'genSeed',
        'genSeed',
        'initWallet',
        'genSeed',
        'initWallet',
        'getInfo',
      ],
    }),
    lnd: {failures: ['genSeed', 'initWallet']},
  },
  {
    args: chain,
    description: 'A failure to start the container is returned',
    docker: {fail: {creates: [dockerLndImage]}},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
  {
    args: chain,
    description: 'LND that never writes its certificate is stopped',
    error: [404, 'FailedToFindFileAtPathInContainer'],
    lnd: {is_without_cert: true},
  },
  {
    args: {...chain, bitcoind_rpc_pass: undefined},
    description: 'A Bitcoin Core RPC password is expected',
    error: [400, 'ExpectedBitcoinCoreRpcPasswordToSpawnLndDocker'],
  },
  {
    args: {...chain, bitcoind_rpc_port: undefined},
    description: 'A Bitcoin Core RPC port is expected',
    error: [400, 'ExpectedBitcoinCoreRpcPortToSpawnLndDocker'],
  },
  {
    args: {...chain, bitcoind_rpc_user: undefined},
    description: 'A Bitcoin Core RPC user is expected',
    error: [400, 'ExpectedBitcoinCoreRpcUserToSpawnLndDocker'],
  },
];

tests.forEach(({args, description, docker, error, expected, lnd, version}) => {
  return test(description, async t => {
    const {fake, started} = await startDocker({docker, lnd});

    t.after(fake.kill);

    const run = () => spawn({args, fake, started, version, context: t});

    if (!!error) {
      await rejects(fastForward({run, context: t}), error);
    } else {
      deepEqual(await run(), expected);
    }

    // Nothing is left running
    return deepEqual(running(fake.containers), []);
  });
});
