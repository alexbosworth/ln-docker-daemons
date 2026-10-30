const {deepEqual} = require('node:assert').strict;
const {Readable} = require('node:stream');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../docker/get_file');

const blockSize = 512;
const {ceil} = Math;
const {concat} = Buffer;
const file = Buffer.from('file contents');
const path = '/root/.lnd/tls.cert';

// Make a tar archive with one file in it
const makeTar = data => {
  const header = Buffer.alloc(blockSize);
  const padded = Buffer.alloc(ceil(data.length / blockSize) * blockSize);

  header.write('tls.cert', 0, 'ascii');
  header.write(data.length.toString(8).padStart(11, '0'), 124, 'ascii');
  header.write('0', 156, 'ascii');

  data.copy(padded);

  return concat([header, padded, Buffer.alloc(blockSize * 2)]);
};

// Make a container that answers archive requests with an error or a stream
const makeContainer = ({err, stream}) => {
  const paths = [];

  const container = {
    getArchive: (options, cbk) => {
      paths.push(options.path);

      return cbk(err, stream);
    },
  };

  return {container, paths};
};

// A stream that fails as soon as it is read
const failing = new Readable({read: () => failing.destroy(new Error('Fail'))});
const tar = makeTar(file);

const tests = [
  {
    args: {path},
    description: 'The file is returned',
    expected: {file, paths: [path]},
    stream: Readable.from([tar.subarray(0, 100), tar.subarray(100)]),
  },
  {
    args: {path},
    description: 'A path without a file is not found',
    err: {statusCode: 404},
    error: [404, 'FailedToFindFileAtPathInContainer'],
  },
  {
    args: {path},
    description: 'A failure to get the archive is returned',
    err: {statusCode: 500},
    error: [503, 'UnexpectedErrorGettingFileFromDocker'],
  },
  {
    args: {path},
    description: 'A failure to read the archive is returned',
    error: [503, 'FailedToReadFileArchiveFromDocker'],
    stream: failing,
  },
  {
    args: {container: undefined, path},
    description: 'A container is expected',
    error: [400, 'ExpectedContainerToGetFileFromDockerContainer'],
  },
  {
    args: {},
    description: 'A file path is expected',
    error: [400, 'ExpectedFilePathToGetFileFromDockerContainer'],
  },
];

tests.forEach(({args, description, err, error, expected, stream}) => {
  return test(description, async () => {
    const {container, paths} = makeContainer({err, stream});

    const call = method({container, ...args});

    if (!!error) {
      return await rejects(call, error);
    }

    const {file} = await call;

    return deepEqual({file, paths}, expected);
  });
});
