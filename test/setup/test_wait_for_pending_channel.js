const {deepEqual} = require('node:assert').strict;
const {promisify} = require('node:util');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeLnd = require('./fake_lnd');
const method = promisify(require('./../../setup/wait_for_pending_channel'));

const {channel} = fakeLnd;
const normal = {listed: [true], pending: [true], policies: [true]};

// Wait for the channel to be pending, then describe the pending channel
const wait = async ({args, lnd}) => {
  const res = await method({lnd, id: channel.transaction_id, ...args});

  return {
    is_opening: res.channel.is_opening,
    transaction_id: res.channel.transaction_id,
    transaction_vout: res.channel.transaction_vout,
  };
};

const tests = [
  {
    description: 'A pending channel is returned',
    expected: ['pendingChannels'],
  },
  {
    behavior: {pending: [null, false, true]},
    description: 'A pending channel is waited on through failures',
    expected: ['pendingChannels', 'pendingChannels', 'pendingChannels'],
  },
  {
    args: {id: undefined},
    description: 'A funding transaction id is expected',
    error: [400, 'ExpectedTransactionIdToWaitForChannelPending'],
    expected: [],
  },
  {
    args: {lnd: undefined},
    description: 'An LND API object is expected',
    error: [400, 'ExpectedAuthenticatedLndToWaitForChannelPending'],
    expected: [],
  },
];

tests.forEach(({args, behavior, description, error, expected}) => {
  return test(description, async () => {
    const {lnd, requests} = fakeLnd({...normal, ...behavior});

    const call = wait({args, lnd});

    if (!!error) {
      await rejects(call, error);
    } else {
      deepEqual(await call, {
        is_opening: true,
        transaction_id: channel.transaction_id,
        transaction_vout: channel.transaction_vout,
      });
    }

    return deepEqual(requests.map(n => n.method), expected);
  });
});
