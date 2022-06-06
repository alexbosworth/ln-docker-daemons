const asyncRetry = require('async/retry');
const {getPendingChannels} = require('lightning');

const interval = 10;
const times = 20000;

/** Wait for a pending channel to appear

  {
    id: <Channel Transaction Id Hex String>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk
*/
module.exports = (args, cbk) => {
  if (!args.id) {
    return cbk([400, 'ExpectedTransactionIdToWaitForChannelPending']);
  }

  if (!args.lnd || !args.lnd.default) {
    return cbk([400, 'ExpectedAuthenticatedLndToWaitForChannelPending']);
  }

  const {id} = args;

  return asyncRetry({interval, times}, cbk => {
    return getPendingChannels({lnd: args.lnd}, (err, res) => {
      if (!!err) {
        return cbk(err);
      }

      const channel = res.pending_channels.find(n => n.transaction_id === id);

      if (!channel) {
        return cbk([503, 'FailedToFindPendingChannelWithTransactionId']);
      }

      return cbk(null, {channel});
    });
  },
  cbk);
};
