const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../docker/first_file_in_tar');

const blockSize = 512;
const {ceil} = Math;
const {concat} = Buffer;
const file = Buffer.from('file contents');

// Make a tar entry with a header and padded data
const makeEntry = ({data, name, type}) => {
  const header = Buffer.alloc(blockSize);

  header.write(name, 0, 'ascii');
  header.write(data.length.toString(8).padStart(11, '0'), 124, 'ascii');
  header.write(type, 156, 'ascii');

  const padded = Buffer.alloc(ceil(data.length / blockSize) * blockSize);

  data.copy(padded);

  return concat([header, padded]);
};

const certEntry = makeEntry({data: file, name: 'tls.cert', type: '0'});
const endMarker = Buffer.alloc(blockSize * 2);

const tests = [
  {
    args: {tar: concat([certEntry, endMarker])},
    description: 'The first file is returned',
    expected: {file},
  },
  {
    args: {
      tar: concat([
        makeEntry({data: Buffer.alloc(600, 1), name: 'pax', type: 'x'}),
        certEntry,
        endMarker,
      ]),
    },
    description: 'Metadata entries are skipped',
    expected: {file},
  },
  {
    args: {tar: endMarker},
    description: 'An empty archive has no file',
    expected: {},
  },
  {
    args: {tar: Buffer.alloc(0)},
    description: 'No data has no file',
    expected: {},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected);

    return end();
  });
});
