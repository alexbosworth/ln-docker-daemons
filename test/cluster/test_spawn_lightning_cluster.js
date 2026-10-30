const {deepEqual} = require('node:assert').strict;
const {getWalletInfo} = require('lightning');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const bitcoindDaemon = require('./../docker/bitcoind_daemon');
const {channel} = require('./../setup/fake_lnd');
const {dockerBitcoindImage} = require('./../../bitcoind/constants');
const {dockerLndImage} = require('./../../lnd/constants');
const fakeDocker = require('./../docker/fake_docker');
const fastForward = require('./../docker/fast_forward');
const lndDaemon = require('./../docker/lnd_daemon');
const method = require('./../../cluster/spawn_lightning_cluster');
const {nodeKey} = require('./../lnd/fake_lnd_server');

const clusterAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';
const {firstPickedPort} = fakeDocker;
const images = [dockerBitcoindImage, dockerLndImage];
const isOpener = lnd => lnd.calls.includes('openChannel');
const neverStarting = [...Array(25)].map(() => dockerBitcoindImage);
const running = containers => containers.filter(n => !n.is_removed);

// Tests use the default LND version, whatever is set for the shell
delete process.env.DOCKER_LND_VERSION;

// Spawn a cluster, describe what was started, then stop it
const spawn = async ({args, bitcoinds, fake, lnds}) => {
  const cluster = await method(args);

  const ids = cluster.nodes.map(node => node.id);
  const live = running(fake.containers).length;

  await cluster.kill({});

  return {
    live,
    channels: cluster.channels,
    created: fake.containers.length,
    ids: [...ids].sort(),
    openers: lnds.filter(isOpener).map(lnd => ids.indexOf(lnd.public_key)),
    peers: bitcoinds.flatMap(n => n.peers).length,
  };
};

// Start a fake Docker whose containers run a fake bitcoind or a fake LND
const startDocker = async ({bitcoind, docker}) => {
  const bitcoinds = [];
  const lnds = [];

  const fake = await fakeDocker({
    images,
    daemons: {
      [dockerBitcoindImage]: bitcoindDaemon({...bitcoind, started: bitcoinds}),
      [dockerLndImage]: lndDaemon({started: lnds}),
    },
    ...docker,
  });

  return {bitcoinds, fake, lnds};
};

// Use the node of a default cluster, describe it, then stop the cluster
const useNode = async ({bitcoinds, lnds}) => {
  const cluster = await method({});

  const [bitcoind] = bitcoinds;
  const [lnd] = lnds;
  const [node] = cluster.nodes;

  const badMacaroon = node.rpc({macaroon: '00'});
  const macaroon = lnd.macaroon.toString('hex');

  const wallet = await getWalletInfo({lnd: node.lnd});
  const withMacaroon = await getWalletInfo(node.rpc({macaroon}));

  // A macaroon that is given is the macaroon that is used
  const [code, message] = await getWalletInfo(badMacaroon).catch(err => err);

  await node.generate({count: 1});

  await cluster.kill({});

  return {
    id: node.id,
    mined_to: bitcoind.addresses,
    refused: [code, message],
    socket: node.socket,
    tower: node.tower,
    wallet: wallet.public_key,
    wallet_with_macaroon: withMacaroon.public_key,
  };
};

const tests = [
  {
    args: {},
    description: 'A single node is started by default',
    expected: {
      channels: [],
      created: 2,
      ids: [nodeKey(1)],
      live: 2,
      openers: [],
      peers: 0,
    },
  },
  {
    args: {capacity: 1e6, size: 2},
    description: 'Nodes are connected and open channels in a line',
    expected: {
      channels: [{...channel, from: 0, to: 1}],
      created: 4,
      ids: [nodeKey(1), nodeKey(2)],
      live: 4,
      openers: [0],
      peers: 1,
    },
  },
  {
    args: {size: 2},
    description: 'A failed start is retried, stopping nodes that started',
    docker: {fail: {creates: [dockerLndImage]}},
    expected: {
      channels: [],
      created: 7,
      ids: [nodeKey(2), nodeKey(3)],
      live: 4,
      openers: [],
      peers: 1,
    },
  },
  {
    args: {capacity: -1},
    description: 'A channel capacity is expected to be positive',
    error: [400, 'ExpectedPositiveClusterChannelCapacity'],
  },
  {
    args: {capacity: 1.5},
    description: 'A channel capacity is expected to be a whole number',
    error: [400, 'ExpectedPositiveClusterChannelCapacity'],
  },
  {
    args: {},
    description: 'A failure to start a node is returned',
    docker: {fail: {creates: neverStarting}},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
  {
    args: {size: 2},
    bitcoind: {is_refusing_peers: true},
    description: 'A failure to connect the nodes stops every node',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {cmd: 'addnode', code: -1, message: 'Cannot add the peer'},
    ],
  },
  {
    args: {capacity: 1e6, size: 2},
    bitcoind: {failing_count: 100},
    description: 'A failure to fund a channel stops every node',
    error: [
      503,
      'UnexpectedErrorFromRpcCommand',
      {
        cmd: 'generatetoaddress',
        code: -1,
        message: 'Cannot mine that many blocks',
      },
    ],
  },
];

tests.forEach(({args, bitcoind, description, docker, error, expected}) => {
  return test(description, async t => {
    const {bitcoinds, fake, lnds} = await startDocker({bitcoind, docker});

    t.after(fake.kill);

    const run = () => spawn({args, bitcoinds, fake, lnds});

    if (!!error) {
      await rejects(fastForward({run, context: t}), error);
    } else {
      deepEqual(await run(), expected);
    }

    // Nothing is left running
    return deepEqual(running(fake.containers), []);
  });
});

test('The node of a default cluster can be used', async t => {
  const {bitcoinds, fake, lnds} = await startDocker({});

  t.after(fake.kill);

  deepEqual(await useNode({bitcoinds, lnds}), {
    id: nodeKey(1),
    mined_to: ['genesis', clusterAddress, 'bcrt1qfake'],
    refused: [503, 'GetWalletInfoErr'],
    socket: '172.17.0.3:9735',
    tower: `localhost:${firstPickedPort}`,
    wallet: nodeKey(1),
    wallet_with_macaroon: nodeKey(1),
  });

  return deepEqual(running(fake.containers), []);
});
