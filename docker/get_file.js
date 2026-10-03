const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const firstFileInTar = require('./first_file_in_tar');

const {concat} = Buffer;

/** Get a file from inside a docker container

  {
    container: <Docker COntainer Object>
    path: <Path To File String>
  }

  @returns via cbk or Promise
  {
    file: <File Buffer Object>
  }
*/
module.exports = ({container, path}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!container) {
          return cbk([400, 'ExpectedContainerToGetFileFromDockerContainer']);
        }

        if (!path) {
          return cbk([400, 'ExpectedFilePathToGetFileFromDockerContainer']);
        }

        return cbk();
      },

      // Get archive
      getArchive: ['validate', ({}, cbk) => {
        return container.getArchive({path}, (err, stream) => {
          // Exit early when there are no files at the path
          if (!!err && err.statusCode === 404) {
            return cbk([404, 'FailedToFindFileAtPathInContainer']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingFileFromDocker', {err}]);
          }

          const parts = [];

          stream.on('data', part => parts.push(part));

          stream.once('error', err => {
            return cbk([503, 'FailedToReadFileArchiveFromDocker', {err}]);
          });

          stream.once('end', () => {
            return cbk(null, firstFileInTar({tar: concat(parts)}).file);
          });

          return;
        });
      }],

      // Final resulting file
      file: ['getArchive', ({getArchive}, cbk) => {
        return cbk(null, {file: getArchive});
      }],
    },
    returnResult({reject, resolve, of: 'file'}, cbk));
  });
};
