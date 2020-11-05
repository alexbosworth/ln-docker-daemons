const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const rpc = require('./rpc');

const cmd = 'getblockchaininfo';
const host = 'localhost';
const params = [];

/** Get blockchain info from Bitcoin Core daemon

  {
    pass: <RPC Password String>
    port: <RPC Port Number>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
  {
    blocks: <Best Chain Block Height Number>
  }
*/
module.exports = ({pass, port, user}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToGetBlockchainInfo']);
        }

        if (!port) {
          return cbk([400, 'ExpectedRpcPortNumberToGetBlockchainInfo']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToGetBlockchainInfo']);
        }

        return cbk();
      },

      // Execute request
      request: ['validate', ({}, cbk) => {
        return rpc({cmd, host, pass, params, port, user}, cbk);
      }],
    },
    returnResult({reject, resolve, of: 'request'}, cbk));
  });
};
