const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {returnResult} = require('asyncjs-util');

const checkGenerated = require('./check_generated');
const getBlockchainInfo = require('./get_blockchain_info');
const rpc = require('./rpc');

const cmd = 'generatetoaddress';
const defaultCheckInterval = 100;
const defaultCheckTimes = 100;
const hasResponse = err => isCommandError(err) || !!err[2].status;
const host = 'localhost';
const isCommandError = err => err[1] === 'UnexpectedErrorFromRpcCommand';
const isDisconnected = err => isUnsent(err) || isLost(err);
const isInvalid = err => err[0] === 400;
const isLost = err => err[1] === 'ConnectionToBitcoindRpcServiceLost';
const isUnsent = err => err[1] === 'ConnectionToBitcoindRpcServiceFailed';
const retryRead = {errorFilter: isDisconnected, interval: 100, times: 5};
const retryUnsent = {errorFilter: isUnsent, interval: 100, times: 5};

/** Mine blocks to an address, checking the chain when the outcome is unclear

  {
    address: <Address to Mine Outputs Towards String>
    [check_interval]: <Unclear Outcome Poll Interval Milliseconds Number>
    [check_times]: <Unclear Outcome Poll Times Number>
    count: <Generate Count Number>
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
          return cbk([400, 'ExpectedAddressToMineBlocks']);
        }

        if (!args.count) {
          return cbk([400, 'ExpectedCountOfBlocksToMine']);
        }

        if (!args.pass) {
          return cbk([400, 'ExpectedRpcPasswordToMineBlocks']);
        }

        if (!args.port) {
          return cbk([400, 'ExpectedRpcPortNumberToMineBlocks']);
        }

        if (!args.user) {
          return cbk([400, 'ExpectedRpcUsernameToMineBlocks']);
        }

        return cbk();
      },

      // Get the chain height to check against if the request fails
      getStart: ['validate', ({}, cbk) => {
        return asyncRetry(retryRead, cbk => {
          return getBlockchainInfo({
            pass: args.pass,
            port: args.port,
            user: args.user,
          },
          cbk);
        },
        cbk);
      }],

      // Generate the blocks, retrying when the request never reached bitcoind
      generate: ['getStart', ({}, cbk) => {
        const params = [args.count, args.address];

        return asyncRetry(retryUnsent, cbk => {
          return rpc({
            cmd,
            host,
            params,
            pass: args.pass,
            port: args.port,
            user: args.user,
          },
          cbk);
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
        // Exit early when bitcoind returned the generated block hashes
        if (!generate.err) {
          return cbk(null, generate.hashes);
        }

        return checkGenerated({
          address: args.address,
          count: args.count,
          err: generate.err,
          interval: args.check_interval || defaultCheckInterval,
          is_finished: hasResponse(generate.err),
          pass: args.pass,
          port: args.port,
          start: getStart.blocks,
          times: args.check_times || defaultCheckTimes,
          user: args.user,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'check'}, cbk));
  });
};
