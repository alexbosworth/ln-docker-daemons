const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../cluster/generate_blocks');

const txId = Buffer.alloc(32).toString('hex');

// Make a generate function and LND object that record how they are called
const makeMocks = ({failure, utxos}) => {
  const calls = {generated: [], polls: 0};

  const utxo = {
    address: 'address',
    address_type: 'WITNESS_PUBKEY_HASH',
    amount_sat: '1',
    confirmations: '1',
    outpoint: {output_index: 0, txid_str: txId},
    pk_script: '00',
  };

  // Return the next count of UTXOs on each poll, then keep returning the last
  const listUnspent = ({}, cbk) => {
    const count = utxos[Math.min(calls.polls++, utxos.length - 1)];

    return cbk(null, {utxos: [...Array(count)].map(() => utxo)});
  };

  const generate = (args, cbk) => {
    calls.generated.push(args);

    return cbk(failure);
  };

  const lnd = {
    default: {
      listUnspent,
      newAddress: ({}, cbk) => cbk(null, {address: 'created'}),
    },
    wallet: {listUnspent},
  };

  return {calls, generate, lnd};
};

const tests = [
  {
    args: {count: 1},
    description: 'Blocks are generated to a new address',
    expected: {generated: [{address: 'created', count: 1}], polls: 0},
  },
  {
    args: {address: 'address', count: 1},
    description: 'Blocks are generated to a specified address',
    expected: {generated: [{address: 'address', count: 1}], polls: 0},
  },
  {
    args: {count: 100},
    description: 'Mature blocks wait for a UTXO to show up',
    expected: {generated: [{address: 'created', count: 100}], polls: 3},
    utxos: [0, 0, 1],
  },
  {
    args: {count: 1},
    description: 'A generate failure is returned',
    error: [503, 'ConnectionToBitcoindRpcServiceFailed'],
    failure: [503, 'ConnectionToBitcoindRpcServiceFailed'],
  },
  {
    args: {lnd: undefined},
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndToGenerateBlocks'],
  },
];

tests.forEach(({args, description, error, expected, failure, utxos}) => {
  return test(description, async () => {
    const mocks = makeMocks({failure, utxos});
    const call = method({...mocks, ...args});

    if (!!error) {
      return await rejects(call, error);
    }

    await call;

    return deepEqual(mocks.calls, expected);
  });
});
