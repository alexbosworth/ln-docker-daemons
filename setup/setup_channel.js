const {addPeer} = require('lightning');
const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {getChainBalance} = require('lightning');
const {openChannel} = require('lightning');
const {returnResult} = require('asyncjs-util');

const waitForChannel = require('./wait_for_channel');
const waitForPendingChannel = require('./wait_for_pending_channel');

const channelCapacityTokens = 1e6;
const confCount = 6;
const count = 100;
const defaultFee = 1e3;
const interval = 100;
const times = 1500;

/** Setup channel

  {
    [capacity]: <Channel Capacity Tokens Number>
    generate: <Generate Blocks Promise>
    [give_tokens]: <Gift Tokens Number>
    [is_private]: <Is Private Bool>
    lnd: <Authenticated LND API Object>
    [partner_csv_delay]: <Partner CSV Delay Number>
    to: {
      id: <Partner Public Key Hex String>
      socket: <Network Address String>
    }
  }

  @returns via cbk or Promise
  {
    id: <Standard Format Channel Id String>
    transaction_id: <Funding Transaction Id Hex String>
    transaction_vout: <Funding Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Make sure the node is connected
      addPeer: cbk => {
        return addPeer({
          lnd: args.lnd,
          public_key: args.to.id || args.to.public_key,
          socket: args.to.socket,
        },
        cbk);
      },

      // Make sure the node has funds
      generateFunds: async () => await args.generate({count}),

      // Open channel
      chanOpen: cbk => {
        return asyncRetry({interval, times}, cbk => {
          return openChannel({
            chain_fee_tokens_per_vbyte: defaultFee,
            give_tokens: args.give_tokens,
            is_private: args.is_private,
            lnd: args.lnd,
            local_tokens: args.capacity || channelCapacityTokens,
            partner_csv_delay: args.partner_csv_delay,
            partner_public_key: args.to.public_key || args.to.id,
            socket: args.to.socket,
          },
          cbk);
        },
        cbk);
      },

      // Wait for pending
      waitPending: ['chanOpen', ({chanOpen}, cbk) => {
        return waitForPendingChannel({
          id: chanOpen.transaction_id,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Generate blocks to confirm the pending channel
      generate: ['waitPending', async ({}) => {
        return await args.generate({count: confCount});
      }],

      // Wait for open
      channel: ['chanOpen', ({chanOpen}, cbk) => {
        return waitForChannel({
          id: chanOpen.transaction_id,
          lnd: args.lnd,
          vout: chanOpen.transaction_vout,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'channel'}, cbk));
  });
};
