const {fetch} = globalThis;
const {parse} = JSON;
const {stringify} = JSON;

// Fail like fetch does when the socket to bitcoind has an error
const socketFailure = (code, message) => {
  const cause = Object.assign(new Error(message), {code});

  return Promise.reject(new TypeError('fetch failed', {cause}));
};

/** Make a fetch that answers requests for one JSON-RPC method itself

  {
    method: <JSON-RPC Method Name String>
    reply: <Make Response Function> () => <Response Promise>
  }

  @returns
  <Fetch Function> (url, options) => <Response Promise>
*/
module.exports = ({method, reply}) => (url, options) => {
  // Exit early when the request is for another method
  if (parse(options.body).method !== method) {
    return fetch(url, options);
  }

  return reply();
};

// Answer with a JSON-RPC response body
module.exports.answer = body => () => {
  return Promise.resolve(new Response(stringify(body)));
};

// Fail as when the connection to bitcoind is lost mid-request
module.exports.lose = () => socketFailure('ECONNRESET', 'read ECONNRESET');

// Fail as when bitcoind is not accepting connections
module.exports.refuse = () => {
  return socketFailure('ECONNREFUSED', 'connect ECONNREFUSED');
};
