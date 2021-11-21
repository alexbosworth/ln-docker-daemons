const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const rpc = require('./rpc');

const action = 'add';
const cmd = 'addnode';
const host = 'localhost';

/** Add a node as a peer

  {
    pass: <RPC Password String>
    port: <RPC Port Number>
    socket: <Socket to Connect to String>
    user: <RPC Username String>
  }

  @returns via cbk or Promise
*/
module.exports = ({pass, port, socket, user}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToAddChainPeer']);
        }

        if (!port) {
          return cbk([400, 'ExpectedRpcPortNumberToAddChainPeer']);
        }

        if (!socket) {
          return cbk([400, 'ExpectedSocketToAddChainPeer']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToAddChainPeer']);
        }

        return cbk();
      },

      // Execute request
      request: ['validate', ({}, cbk) => {
        const params = [socket, action];

        return rpc({cmd, host, pass, params, port, user}, cbk);
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
