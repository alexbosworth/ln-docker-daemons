const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const rpc = require('./rpc');

const cmd = 'generatetoaddress';
const host = 'localhost';

/** Generate blocks and mine coinbase outputs to an address

  {
    address: <Address to Mine Outputs Towards String>
    [count]: <Generate Count Number>
    pass: <RPC Password String>
    port: <RPC Port Number>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
  {
    blocks: <Best Chain Block Height Number>
  }
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

      // Execute request
      request: ['validate', ({}, cbk) => {
        const params = [count || [address].length, address];

        return rpc({cmd, host, pass, params, port, user}, cbk);
      }],
    },
    returnResult({reject, resolve, of: 'request'}, cbk));
  });
};
