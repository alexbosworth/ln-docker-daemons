const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const {getChannel} = require('lightning');
const {getChannels} = require('lightning');

const interval = 20;
const times = 10000;

/** Wait for channel to be open

  {
    id: <Channel Transaction Id Hex String>
    lnd: <Authenticated LND API Object>
    vout: <Channel Output Index Number>
  }

  @returns via cbk or Promise
  {
    capacity: <Channel Token Capacity Number>
    commit_transaction_fee: <Commit Transaction Fee Number>
    commit_transaction_weight: <Commit Transaction Weight Number>
    id: <Standard Format Channel Id String>
    is_active: <Channel Active Bool>
    is_closing: <Channel Is Closing Bool>
    is_opening: <Channel Is Opening Bool>
    is_partner_initiated: <Channel Partner Opened Channel>
    is_private: <Channel Is Private Bool>
    local_balance: <Local Balance Tokens Number>
    partner_public_key: <Channel Partner Public Key String>
    pending_payments: [{
      id: <Payment Preimage Hash Hex String>
      is_outgoing: <Payment Is Outgoing Bool>
      timeout: <Chain Height Expiration Number>
      tokens: <Payment Tokens Number>
    }]
    received: <Received Tokens Number>
    remote_balance: <Remote Balance Tokens Number>
    sent: <Sent Tokens Number>
    transaction_id: <Blockchain Transaction Id String>
    transaction_vout: <Blockchain Transaction Vout Number>
    unsettled_balance: <Unsettled Balance Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.id) {
          return cbk([400, 'ExpectedTransactionIdToWaitForChannelOpen']);
        }

        if (!args.lnd || !args.lnd.default) {
          return cbk([400, 'ExpectedAuthenticatedLndToWaitForChannelOpen']);
        }

        return cbk();
      },

      // Find channel in channels list
      channel: ['validate', async () => {
        return await asyncRetry({interval, times}, async () => {
          const {channels} = await getChannels({lnd: args.lnd});

          const chan = channels.find(channel => {
            const txVout = channel.transaction_vout;

            return channel.transaction_id === args.id && txVout === args.vout;
          });

          if (!chan) {
            throw new Error('FailedToFindChannelWithTransactionId');
          }

          return chan;
        });
      }],

      // Check channel fully created
      gotChannel: ['channel', async ({channel}) => {
        return await asyncRetry({interval, times}, async () => {
          const {policies} = await getChannel({id: channel.id, lnd: args.lnd});

          if (!!policies.find(n => !n.cltv_delta)) {
            throw new Error('FailedToFindChannelWithFullPolicyDetails');
          }

          return;
        });
      }],
    },
    returnResult({reject, resolve, of: 'channel'}, cbk));
  });
};
