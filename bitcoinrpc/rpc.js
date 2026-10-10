const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const defaultTimeout = 1000 * 30;
const {isInteger} = Number;
const isSuccess = code => code >= 200 && code < 300;
const isTimeout = err => ['AbortError', 'TimeoutError'].includes(err.name);
const lostCodes = ['ECONNRESET', 'EPIPE', 'UND_ERR_CLOSED', 'UND_ERR_SOCKET'];
const {parse} = JSON;
let requests = 0;
const {stringify} = JSON;
const unsentCodes = ['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'];

/** Call JSON RPC

  {
    cmd: <Command String>
    host: <Host Name String>
    params: [<Parameter Object>]
    pass: <Password String>
    port: <Port Number>
    [timeout]: <Request Timeout Milliseconds Number>
    user: <Username String>
  }

  ConnectionToBitcoindRpcServiceFailed means the request never reached the
  server. ConnectionToBitcoindRpcServiceLost and TimedOutWaitingForRpcResponse
  mean the server may have executed the command.

  @returns via cbk or Promise
  <Result Object>
*/
module.exports = ({cmd, host, params, pass, port, timeout, user}, cbk) => {
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

        if (timeout !== undefined && !(isInteger(timeout) && timeout > 0)) {
          return cbk([400, 'ExpectedPositiveTimeoutToExecuteRpcCall']);
        }

        if (!user) {
          return cbk([400, 'ExpectedRpcUsernameToExecuteRpcCall']);
        }

        return cbk();
      },

      // Send request to the server, failures are returned rather than thrown
      request: ['validate', async ({}) => {
        const credentials = Buffer.from(`${user}:${pass}`);

        try {
          const response = await fetch(`http://${host}:${port}/`, {
            body: stringify({params, id: `${++requests}`, method: cmd}),
            headers: {
              'Authorization': `Basic ${credentials.toString('base64')}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal: AbortSignal.timeout(timeout || defaultTimeout),
          });

          return {body: await response.text(), statusCode: response.status};
        } catch (err) {
          return {err};
        }
      }],

      // Check for a failure to get a response from the server
      checkRequest: ['request', ({request}, cbk) => {
        const {err} = request;

        // Exit early when there is a response
        if (!err) {
          return cbk();
        }

        if (isTimeout(err)) {
          return cbk([503, 'TimedOutWaitingForRpcResponse', {cmd}]);
        }

        // Undici puts the underlying failure reason into the error cause
        const cause = err.cause || {};
        const code = cause.code || err.code;

        // Failing to connect to every address of a host groups the failures
        const [failure] = cause.errors || [];
        const reason = failure || cause;

        const details = {
          cmd,
          code,
          err,
          message: reason.message || err.message,
        };

        // The connection was never made so the command was not executed
        if (unsentCodes.includes(code)) {
          return cbk([503, 'ConnectionToBitcoindRpcServiceFailed', details]);
        }

        // The connection broke so the command may have been executed
        if (lostCodes.includes(code)) {
          return cbk([503, 'ConnectionToBitcoindRpcServiceLost', details]);
        }

        return cbk([503, 'UnexpectedErrorFromRpcService', details]);
      }],

      // Parse the response body as a JSON-RPC response object
      parseBody: ['checkRequest', 'request', ({request}, cbk) => {
        const details = {cmd, status: request.statusCode};
        let body;

        try {
          body = parse(request.body);
        } catch (err) {
          return cbk([503, 'FailedToParseRpcServiceResponse', details]);
        }

        if (!body || typeof body !== 'object') {
          return cbk([503, 'UnexpectedRpcServiceResponse', details]);
        }

        return cbk(null, body);
      }],

      // Check the response for a command failure and pull out the result
      result: ['parseBody', 'request', ({parseBody, request}, cbk) => {
        const {error} = parseBody;

        // A JSON-RPC command failure is reported in the error attribute
        if (error !== undefined && error !== null) {
          return cbk([
            503,
            'UnexpectedErrorFromRpcCommand',
            {cmd, code: error.code, message: error.message},
          ]);
        }

        // Without a command failure the HTTP response should be a success
        if (!isSuccess(request.statusCode)) {
          return cbk([
            503,
            'UnexpectedRpcServiceResponse',
            {cmd, status: request.statusCode},
          ]);
        }

        return cbk(null, parseBody.result);
      }],
    },
    returnResult({reject, resolve, of: 'result'}, cbk));
  });
};
