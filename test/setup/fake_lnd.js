const {EventEmitter} = require('node:events');

const chanId = '111050674470912';
const next = (list, n) => list[Math.min(n, list.length - 1)];
const partner = `02${'aa'.repeat(32)}`;
const self = `03${'bb'.repeat(32)}`;
const transactionId = `${'ab'.repeat(31)}cd`;
const unavailable = {details: 'Unavailable'};

// A routing policy as getChanInfo describes it
const policy = {
  disabled: false,
  fee_base_msat: '1000',
  fee_rate_milli_msat: '1',
  last_update: 1,
  max_htlc_msat: '990000000',
  min_htlc: '1000',
  time_lock_delta: 40,
};

// The channel as pendingChannels describes it while it opens
const pendingOpen = {
  channel: {channel_point: `${transactionId}:0`},
  commit_fee: '1000',
  commit_weight: '1000',
};

// The channel as listChannels describes it once it is open
const rpcChannel = {
  active: true,
  alias_scids: [],
  capacity: '1000000',
  chan_id: chanId,
  channel_point: `${transactionId}:0`,
  commit_fee: '1000',
  commit_weight: '1000',
  commitment_type: 'ANCHORS',
  fee_per_kw: '1000',
  local_balance: '990000',
  local_chan_reserve_sat: '10000',
  local_constraints: {},
  num_updates: '0',
  pending_htlcs: [],
  private: false,
  remote_balance: '0',
  remote_chan_reserve_sat: '10000',
  remote_constraints: {},
  remote_pubkey: partner,
  thaw_height: 0,
  total_satoshis_received: '0',
  total_satoshis_sent: '0',
  unsettled_balance: '0',
};

// Another channel from the same funding transaction, at another output
const sibling = {
  ...rpcChannel,
  chan_id: '111050674470913',
  channel_point: `${transactionId}:1`,
};

/** Make an LND API that answers the calls made to set up a channel

  {
    listed: [<Channel Is Listed Bool> or <Fail Request Null>]
    pending: [<Channel Is Pending Bool> or <Fail Request Null>]
    policies: [<Both Channel Policies Are Known Bool> or <Fail Request Null>]
  }

  @returns
  {
    lnd: <Authenticated LND API Object>
    requests: [{
      method: <LND Method Name String>
      request: <Request Object>
    }]
  }
*/
module.exports = ({listed, pending, policies}) => {
  const requests = [];

  // Record a request, returning which outcome of the method's list to give
  const record = (method, request) => {
    const earlier = requests.filter(n => n.method === method).length;

    requests.push({method, request});

    return earlier;
  };

  const lnd = {
    default: {
      // The partner is always already connected
      connectPeer: (request, cbk) => {
        record('connectPeer', request);

        return cbk({message: 'already connected to peer'});
      },

      // Describe the channel, with or without the partner's policy
      getChanInfo: (request, cbk) => {
        const isKnown = next(policies, record('getChanInfo', request));

        if (isKnown === null) {
          return cbk(unavailable);
        }

        return cbk(null, {
          capacity: '1000000',
          chan_point: `${transactionId}:0`,
          channel_id: chanId,
          node1_policy: policy,
          node1_pub: self,
          node2_policy: isKnown ? policy : null,
          node2_pub: partner,
        });
      },

      // List the channel once it is open, next to its sibling
      listChannels: (request, cbk) => {
        const isListed = next(listed, record('listChannels', request));

        if (isListed === null) {
          return cbk(unavailable);
        }

        const channels = isListed ? [sibling, rpcChannel] : [sibling];

        return cbk(null, {channels});
      },

      // Start opening the channel and report it as pending
      openChannel: request => {
        const opening = Object.assign(new EventEmitter(), {cancel: () => {}});

        record('openChannel', request);

        process.nextTick(() => opening.emit('data', {
          chan_pending: {
            output_index: 0,
            txid: Buffer.from(transactionId, 'hex').reverse(),
          },
          update: 'chan_pending',
        }));

        return opening;
      },

      // List the channel as pending, or fail the request
      pendingChannels: (request, cbk) => {
        const isPending = next(pending, record('pendingChannels', request));

        if (isPending === null) {
          return cbk(unavailable);
        }

        return cbk(null, {
          pending_force_closing_channels: [],
          pending_open_channels: isPending ? [pendingOpen] : [],
          waiting_close_channels: [],
        });
      },
    },
  };

  return {lnd, requests};
};

module.exports.channel = {
  id: '101x1x0',
  transaction_id: transactionId,
  transaction_vout: 0,
};

module.exports.partner = partner;
