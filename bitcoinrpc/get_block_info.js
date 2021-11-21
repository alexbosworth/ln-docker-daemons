const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const rpc = require('./rpc');

const cmd = 'getblock';
const host = 'localhost';
const infoVerbosityFlag = 1;

/** Get block info from Bitcoin Core daemon

  {
    id: <Block Hash Hex String>
    pass: <RPC Password String>
    port: <RPC Port Number>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
  {
    tx: [<Transaction Id Hex String>]
  }
*/
module.exports = ({id, pass, port, user}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!id) {
          return cbk([400, 'ExpectedBlockIdToGetBlockInfo']);
        }

        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToGetBlockInfo']);
        }

        if (!port) {
          return cbk([400, 'ExpectedRpcPortNumberToGetBlockInfo']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToGetBlockInfo']);
        }

        return cbk();
      },

      // Execute request
      request: ['validate', ({}, cbk) => {
        const params = [id, infoVerbosityFlag];

        return rpc({cmd, host, pass, params, port, user}, cbk);
      }],
    },
    returnResult({reject, resolve, of: 'request'}, cbk));
  });
};
