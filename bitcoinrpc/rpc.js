const fetch = require('@alexbosworth/node-fetch');
const http = require('http');
const https = require('https');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const defaultTimeout = 1000 * 30;
const agents = {};
let requests = 0;
const {stringify} = JSON;

/** Call JSON RPC

  {
    [cert]: <Cert Buffer Object>
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
module.exports = ({cert, cmd, host, params, pass, port, user}, cbk) => {
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

      // Derive an HTTP agent as necessary for using a self-signed cert
      agent: ['validate', async ({}) => {
        // Exit early when there is no cert and this is a regular HTTP request
        if (!cert) {
          return new http.Agent({});
        }

        return new https.Agent({cert, ca: [cert], ecdhCurve: 'auto'});
      }],

      // Send request to the server
      request: ['agent', async ({agent}) => {
        const credentials = Buffer.from(`${user}:${pass}`);
        const scheme = !!cert ? 'https' : 'http';

        try {
        	const response = await fetch(
            `${scheme}://${host}:${port}/`,
            {
              agent,
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

          if (!result) {
            throw [503, 'ExpectedResultOfRpcRequest'];
          }

          return result;
        } catch (err) {
          if (err.code === 'ECONNRESET') {
            throw [503, 'ConnectionToBitcoindRpcServiceFailed'];
          }

          throw [503, 'UnexpectedErrorFromRpcService', {err}];
        }
      }],
    },
    returnResult({reject, resolve, of: 'request'}, cbk));
  });
};
