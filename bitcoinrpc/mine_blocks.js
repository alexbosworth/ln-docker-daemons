const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const checkGenerated = require('./check_generated');
const getBlockchainInfo = require('./get_blockchain_info');
const rpc = require('./rpc');

const checkInterval = 100;
const checkTimes = 100;
const cmd = 'generatetoaddress';
const hasResponse = err => isCommandError(err) || !!(err[2] || {}).status;
const host = 'localhost';
const isCommandError = err => err[1] === 'UnexpectedErrorFromRpcCommand';
const isDisconnected = err => isUnsent(err) || isLost(err);
const isInvalid = err => err[0] === 400;
const isLost = err => err[1] === 'ConnectionToBitcoindRpcServiceLost';
const isUnsent = err => err[1] === 'ConnectionToBitcoindRpcServiceFailed';
const retryRead = {errorFilter: isDisconnected, interval: 100, times: 5};
const retryUnsent = {errorFilter: isUnsent, interval: 100, times: 5};

/** Mine blocks to an address, checking the chain when the outcome is unclear

  A request is only retried when it never reached bitcoind. When it fails in
  any other way, it may have mined blocks, so the chain is checked for them.

  {
    address: <Address to Mine Outputs Towards String>
    count: <Generate Count Number>
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
          return cbk([400, 'ExpectedAddressToMineBlocks']);
        }

        if (!count) {
          return cbk([400, 'ExpectedCountOfBlocksToMine']);
        }

        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToMineBlocks']);
        }

        if (!port) {
          return cbk([400, 'ExpectedRpcPortNumberToMineBlocks']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToMineBlocks']);
        }

        return cbk();
      },

      // Get the chain height to check against if the request fails
      getStart: ['validate', ({}, cbk) => {
        return asyncRetry(retryRead, cbk => {
          return getBlockchainInfo({pass, port, user}, cbk);
        },
        cbk);
      }],

      // Generate the blocks, retrying when the request never reached bitcoind
      generate: ['getStart', ({}, cbk) => {
        const params = [count, address];

        return asyncRetry(retryUnsent, cbk => {
          return rpc({cmd, host, pass, params, port, user}, cbk);
        },
        (err, hashes) => {
          if (!err) {
            return cbk(null, {hashes});
          }

          // Pass back errors where the request never reached bitcoind
          if (isUnsent(err) || isInvalid(err)) {
            return cbk(err);
          }

          // Otherwise the request may have mined blocks, so check the chain
          return cbk(null, {err});
        });
      }],

      // Check the chain for blocks when the generate request failed
      check: ['generate', 'getStart', ({generate, getStart}, cbk) => {
        // Exit early when bitcoind returned the generated block hashes, since
        // the blocks are known to exist and there is nothing to check
        if (!generate.err) {
          return cbk(null, generate.hashes);
        }

        return checkGenerated({
          address,
          count,
          pass,
          port,
          user,
          err: generate.err,
          interval: checkInterval,
          is_finished: hasResponse(generate.err),
          start: getStart.blocks,
          times: checkTimes,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'check'}, cbk));
  });
};
