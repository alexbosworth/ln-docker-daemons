const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const asyncRetry = require('async/retry');
const asyncTimesSeries = require('async/timesSeries');
const {returnResult} = require('asyncjs-util');

const getBlockchainInfo = require('./get_blockchain_info');
const rpc = require('./rpc');
const unknownGeneratedError = require('./unknown_generated_error');

const host = 'localhost';
const txVerbosityFlag = 2;

/** Check what blocks a failed generate request made

  Generate requests run one at a time, so blocks on top of the start height
  can only be from this request, unless they were mined outside this process.
  They must all pay to the address, and there can't be more than requested.

  A request that may still be running is given time to finish mining. When a
  request finished without mining anything, its original error is returned.

  {
    address: <Coinbase Output Address String>
    count: <Requested Blocks Count Number>
    err: <Generate Request Error Object>
    interval: <Poll Interval Milliseconds Number>
    [is_finished]: <Request Finished Running Bool>
    pass: <RPC Password String>
    port: <RPC Port Number>
    start: <Chain Height Before Generating Number>
    times: <Poll Times Number>
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
          return cbk([400, 'ExpectedAddressToCheckGeneratedBlocks']);
        }

        if (!args.count) {
          return cbk([400, 'ExpectedCountToCheckGeneratedBlocks']);
        }

        if (!args.err) {
          return cbk([400, 'ExpectedGenerateErrorToCheckGeneratedBlocks']);
        }

        if (args.start === undefined) {
          return cbk([400, 'ExpectedStartHeightToCheckGeneratedBlocks']);
        }

        return cbk();
      },

      // Get the chain height, waiting for blocks from a request still running
      getHeight: ['validate', ({}, cbk) => {
        const target = args.start + args.count;
        const times = !!args.is_finished ? 1 : args.times;

        return asyncRetry({times, interval: args.interval}, cbk => {
          return getBlockchainInfo({
            pass: args.pass,
            port: args.port,
            user: args.user,
          },
          (err, res) => {
            if (!!err) {
              return cbk(err);
            }

            if (res.blocks < target) {
              return cbk([503, 'ExpectedMoreBlocks', {height: res.blocks}]);
            }

            return cbk(null, res.blocks);
          });
        },
        (err, height) => {
          // A chain short of the expected height still has a known height
          if (!!err && err[1] === 'ExpectedMoreBlocks') {
            return cbk(null, err[2].height);
          }

          if (!!err) {
            return cbk(unknownGeneratedError({
              count: args.count,
              err: args.err,
              start: args.start,
            }));
          }

          return cbk(null, height);
        });
      }],

      // Make the error for when it cannot be known what blocks were made
      unknown: ['getHeight', ({getHeight}, cbk) => {
        return cbk(null, unknownGeneratedError({
          count: args.count,
          err: args.err,
          height: getHeight,
          start: args.start,
        }));
      }],

      // Make sure the chain height can be explained by the request
      checkHeight: ['getHeight', 'unknown', ({getHeight, unknown}, cbk) => {
        const target = args.start + args.count;

        // Losing blocks or gaining extra blocks means others changed the chain
        if (getHeight < args.start || getHeight > target) {
          return cbk(unknown);
        }

        // A request that may still be running might not be done mining yet
        if (getHeight < target && !args.is_finished) {
          return cbk(unknown);
        }

        // A request that finished without mining failed without any effect
        if (getHeight === args.start) {
          return cbk(args.err);
        }

        return cbk();
      }],

      // Get the hashes of the blocks on top of the start height
      getHashes: [
        'checkHeight',
        'getHeight',
        'unknown',
        ({getHeight, unknown}, cbk) =>
      {
        return asyncTimesSeries(getHeight - args.start, (i, cbk) => {
          return rpc({
            host,
            cmd: 'getblockhash',
            params: [args.start + i + 1],
            pass: args.pass,
            port: args.port,
            user: args.user,
          },
          cbk);
        },
        (err, hashes) => {
          if (!!err) {
            return cbk(unknown);
          }

          return cbk(null, hashes);
        });
      }],

      // Get the blocks to look at their coinbase outputs
      getBlocks: ['getHashes', 'unknown', ({getHashes, unknown}, cbk) => {
        return asyncMapSeries(getHashes, (id, cbk) => {
          return rpc({
            host,
            cmd: 'getblock',
            params: [id, txVerbosityFlag],
            pass: args.pass,
            port: args.port,
            user: args.user,
          },
          cbk);
        },
        (err, blocks) => {
          if (!!err) {
            return cbk(unknown);
          }

          return cbk(null, blocks);
        });
      }],

      // Make sure the blocks pay to the address and were not mined elsewhere
      check: [
        'getBlocks',
        'getHashes',
        'unknown',
        ({getBlocks, getHashes, unknown}, cbk) =>
      {
        const others = getBlocks.filter(block => {
          const [coinbase] = block.tx || [];
          const {vout} = coinbase || {};
          const scripts = (vout || []).map(n => n.scriptPubKey || {});

          return !scripts.map(n => n.address).includes(args.address);
        });

        if (!!others.length) {
          return cbk(unknown);
        }

        // Exit early when all of the requested blocks were made
        if (getHashes.length === args.count) {
          return cbk(null, getHashes);
        }

        const [, cause, details] = args.err;
        const {code, message} = details || {};

        // The request finished after making only some of the blocks
        return cbk([
          503,
          'GeneratedFewerBlocksThanRequested',
          {cause, code, message, count: args.count, hashes: getHashes},
        ]);
      }],
    },
    returnResult({reject, resolve, of: 'check'}, cbk));
  });
};
