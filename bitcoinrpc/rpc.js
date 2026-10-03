const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const defaultTimeout = 1000 * 30;
let requests = 0;
const {stringify} = JSON;

/** Call JSON RPC

  {
    cmd: <Command String>
    host: <Host Name String>
    params: [<Parameter Object>]
    pass: <Password String>
    port: <Port Number>
    user: <Username String>
  }

  @returns via cbk or Promise
  <Result Object>
*/
module.exports = ({cmd, host, params, pass, port, user}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!cmd) {
          return cbk([400, 'ExpectedCommandNameToExecuteRpcCall']);
        }

        if (!host) {
          return cbk([400, 'ExpectedRpcHostToExecuteRpcCall']);
        }

        if (!params) {
          return cbk([400, 'ExpectedCommandParametersToExecuteRpcCall']);
        }

        if (!pass) {
          return cbk([400, 'ExpectedRpcPasswordToExecuteRpcCall']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToExecuteRpcCall']);
        }

        return cbk();
      },

      // Send request to the server
      request: ['validate', async ({}) => {
        const credentials = Buffer.from(`${user}:${pass}`);

        try {
          const response = await fetch(
            `http://${host}:${port}/`,
            {
              body: stringify({
                id: `${++requests}`,
                method: cmd,
                params: params,
              }),
              headers: {
                'Authorization': `Basic ${credentials.toString('base64')}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
            },
          );

          const {result} = await response.json();

          return result;
        } catch (err) {
          if ([err.code, err.cause?.code].includes('ECONNRESET')) {
            throw [503, 'ConnectionToBitcoindRpcServiceFailed'];
          }

          throw [503, 'UnexpectedErrorFromRpcService', {err}];
        }
      }],
    },
    returnResult({reject, resolve, of: 'request'}, cbk));
  });
};
