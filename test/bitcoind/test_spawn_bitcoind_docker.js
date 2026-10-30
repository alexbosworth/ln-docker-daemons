const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const bitcoindDaemon = require('./../docker/bitcoind_daemon');
const {dockerBitcoindImage} = require('./../../bitcoind/constants');
const fakeDocker = require('./../docker/fake_docker');
const fastForward = require('./../docker/fast_forward');
const {getBlockchainInfo} = require('./../../bitcoinrpc');
const method = require('./../../bitcoind/spawn_bitcoind_docker');

const image = dockerBitcoindImage;
const isAuth = arg => arg.startsWith('--rpcauth=');
const running = containers => containers.filter(n => !n.is_removed);

// The arguments Bitcoin Core is started with, other than its RPC auth
const startArgs = ({block, tx}) => [
  '--disablewallet',
  '--listen=1',
  '--persistmempool=false',
  '--printtoconsole',
  '--regtest',
  '--rpcallowip=0.0.0.0/0',
  '--rpcbind=0.0.0.0',
  '--server',
  '--txindex',
  `--zmqpubrawblock=tcp://*:${block}`,
  `--zmqpubrawtx=tcp://*:${tx}`,
];

// Spawn Bitcoin Core, describe what was started, then stop it
const spawn = async ({args, fake}) => {
  const res = await method(args);

  const [{Cmd, HostConfig}] = fake.containers;

  // Bitcoin Core only answers when the RPC details returned are right
  const {blocks} = await getBlockchainInfo({
    pass: res.rpc_pass,
    port: res.rpc_port,
    user: res.rpc_user,
  });

  await res.kill({});

  return {
    blocks,
    bindings: HostConfig.PortBindings,
    cmd: Cmd.filter(n => !isAuth(n)),
    host: res.host,
    rpc_user: res.rpc_user,
    zmq_block_port: res.zmq_block_port,
    zmq_tx_port: res.zmq_tx_port,
  };
};

// Start a fake Docker that runs a fake bitcoind for the Bitcoin Core image
const startDocker = docker => fakeDocker({
  daemons: {[image]: bitcoindDaemon({started: []})},
  images: [image],
  ...docker,
});

const tests = [
  {
    args: {},
    description: 'Bitcoin Core is started with an RPC port Docker picks',
    expected: {
      bindings: {'18443/tcp': [{HostPort: ''}]},
      blocks: 1,
      cmd: startArgs({block: 28332, tx: 28333}),
      host: '172.17.0.2',
      rpc_user: 'bitcoinrpc',
      zmq_block_port: 28332,
      zmq_tx_port: 28333,
    },
  },
  {
    args: {
      p2p_port: 18444,
      rpc_port: 18443,
      zmq_block_port: 38332,
      zmq_tx_port: 38333,
    },
    description: 'Ports that are given are published',
    expected: {
      bindings: {
        '18443/tcp': [{HostPort: '18443'}],
        '18444/tcp': [{HostPort: '18444'}],
        '38332/tcp': [{HostPort: '38332'}],
        '38333/tcp': [{HostPort: '38333'}],
      },
      blocks: 1,
      cmd: startArgs({block: 38332, tx: 38333}),
      host: '172.17.0.2',
      rpc_user: 'bitcoinrpc',
      zmq_block_port: 38332,
      zmq_tx_port: 38333,
    },
  },
  {
    args: {},
    description: 'A failure to start the container is returned',
    docker: {fail: {creates: [image]}},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
  {
    args: {},
    description: 'Bitcoin Core that never answers is stopped',
    docker: {daemons: {}},
    error: [503, 'ConnectionToBitcoindRpcServiceFailed'],
  },
];

tests.forEach(({args, description, docker, error, expected}) => {
  return test(description, async t => {
    const fake = await startDocker(docker);

    t.after(fake.kill);

    const run = () => spawn({args, fake});

    if (!!error) {
      await rejects(fastForward({run, context: t}), error);
    } else {
      deepEqual(await run(), expected);
    }

    // Nothing is left running
    return deepEqual(running(fake.containers), []);
  });
});
