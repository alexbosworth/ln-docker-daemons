const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {getChannels} = require('lightning');

const {spawnLightningCluster} = require('./../../');

// Spawning a cluster with channels should open channels in a line
test('Spawn Lightning cluster with channels', async () => {
  const {channels, kill, nodes} = await spawnLightningCluster({
    capacity: 1e6,
    size: 3,
  });

  try {
    const [alice, bob, carol] = nodes;

    deepEqual(channels.map(({from, to}) => [from, to]), [[0, 1], [1, 2]]);

    const counts = await Promise.all(nodes.map(async ({lnd}) => {
      return (await getChannels({lnd})).channels.length;
    }));

    deepEqual(counts, [1, 2, 1]);

    const [aliceChannel] = (await getChannels({lnd: alice.lnd})).channels;

    deepEqual(aliceChannel.capacity, 1e6);
    deepEqual(aliceChannel.partner_public_key, bob.id);

    const [carolChannel] = (await getChannels({lnd: carol.lnd})).channels;

    deepEqual(carolChannel.partner_public_key, bob.id);
  } finally {
    await kill({});
  }

  return;
});
