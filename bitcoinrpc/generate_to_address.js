const asyncAuto = require('async/auto');
const asyncQueue = require('async/queue');
const {returnResult} = require('asyncjs-util');

const mineBlocks = require('./mine_blocks');

const queue = asyncQueue(mineBlocks, 1);

/** Generate blocks and mine coinbase outputs to an address

  {
    address: <Address to Mine Outputs Towards String>
    [check_interval]: <Unclear Outcome Poll Interval Milliseconds Number>
    [check_times]: <Unclear Outcome Poll Times Number>
    [count]: <Generate Count Number>
    pass: <RPC Password String>
    port: <RPC Port Number>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
  [<Generated Block Hash Hex String>]
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.address) {
          return cbk([400, 'ExpectedAddressToGenerateToAddress']);
        }

        if (!args.pass) {
          return cbk([400, 'ExpectedRpcPasswordToGenerateToAddress']);
        }

        if (!args.port) {
          return cbk([400, 'ExpectedRpcPortNumberToGenerateToAddress']);
        }

        if (!args.user) {
          return cbk([400, 'ExpectedRpcUsernameToGenerateToAddresss']);
        }

        return cbk();
      },

      // Mine after earlier requests so that new blocks are from this request
      generate: ['validate', ({}, cbk) => {
        return queue.push({
          address: args.address,
          check_interval: args.check_interval,
          check_times: args.check_times,
          count: args.count || [args.address].length,
          pass: args.pass,
          port: args.port,
          user: args.user,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'generate'}, cbk));
  });
};
