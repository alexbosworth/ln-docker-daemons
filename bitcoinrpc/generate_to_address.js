const asyncAuto = require('async/auto');
const asyncQueue = require('async/queue');
const {returnResult} = require('asyncjs-util');

const mineBlocks = require('./mine_blocks');

const queue = asyncQueue(mineBlocks, 1);

/** Generate blocks and mine coinbase outputs to an address

  Requests run one at a time. When the outcome of a request is unclear, blocks
  on top of where it started can then only be from that request, unless they
  were mined outside of this process.

  {
    address: <Address to Mine Outputs Towards String>
    [count]: <Generate Count Number>
    pass: <RPC Password String>
    port: <RPC Port Number>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
  [<Generated Block Hash Hex String>]
*/
module.exports = ({address, count, pass, port, user}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!address) {
          return cbk([400, 'ExpectedAddressToGenerateToAddress']);
        }

        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToGenerateToAddress']);
        }

        if (!port) {
          return cbk([400, 'ExpectedRpcPortNumberToGenerateToAddress']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToGenerateToAddresss']);
        }

        return cbk();
      },

      // Mine the blocks once earlier generate requests are done
      generate: ['validate', ({}, cbk) => {
        return queue.push({
          address,
          pass,
          port,
          user,
          count: count || [address].length,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'generate'}, cbk));
  });
};
