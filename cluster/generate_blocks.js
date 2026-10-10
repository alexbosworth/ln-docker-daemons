const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {createChainAddress} = require('lightning');
const {getUtxos} = require('lightning');
const {returnResult} = require('asyncjs-util');

const interval = 10;
const maturity = 100;
const times = 3000;

/** Generate blocks for a node, waiting for a UTXO when enough blocks mature

  {
    [address]: <Mine Coinbase Outputs to Address String>
    [count]: <Generate Blocks Count Number>
    generate: <Generate Blocks Function> ({address, count}, cbk) => {}
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.generate) {
          return cbk([400, 'ExpectedGenerateFunctionToGenerateBlocks']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGenerateBlocks']);
        }

        return cbk();
      },

      // Get a node address to mine to when no address is specified
      getAddress: ['validate', ({}, cbk) => {
        // Exit early when there is an address to mine to
        if (!!args.address) {
          return cbk(null, {address: args.address});
        }

        return createChainAddress({lnd: args.lnd}, cbk);
      }],

      // Generate the blocks
      generate: ['getAddress', ({getAddress}, cbk) => {
        return args.generate({
          address: getAddress.address,
          count: args.count,
        },
        cbk);
      }],

      // Wait for a UTXO to show up when there are enough blocks to mature it
      waitForUtxo: ['generate', ({}, cbk) => {
        // Exit early when there are not enough blocks to mature a coinbase
        if (!args.count || args.count < maturity) {
          return cbk();
        }

        return asyncRetry({interval, times}, cbk => {
          return getUtxos({lnd: args.lnd}, (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            if (!res.utxos.length) {
              return cbk([503, 'ExpectedUtxoInUtxos']);
            }

            return cbk();
          });
        },
        cbk);
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
