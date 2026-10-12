const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const rpc = require('./rpc');

const action = 'add';
const alreadyAdded = -23;
const cmd = 'addnode';
const host = 'localhost';
const isAlreadyAdded = err => isRpcError(err) && err[2].code === alreadyAdded;
const isRpcError = err => err[1] === 'UnexpectedErrorFromRpcCommand';

/** Add a node as a peer

  Adding a node that is already added is not an error

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

        return rpc({cmd, host, pass, params, port, user}, err => {
          // Exit early when the node was already added
          if (!!err && isAlreadyAdded(err)) {
            return cbk();
          }

          return cbk(err);
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
