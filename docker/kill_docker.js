const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const errorAlreadyStopped = 'container already stopped';
const t = 1;

/** Kill a running docker container

  {
    container: <Docker Container Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({container}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!container) {
          return cbk([400, 'ExpectedContainerToKillContainer']);
        }

        return cbk();
      },

      // Stop the running image
      stop: ['validate', ({}, cbk) => {
        return container.stop({t}, err => {
          if (!!err && err.reason === errorAlreadyStopped) {
            return cbk();
          }

          if (!!err && err.statusCode === 404) {
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorStoppingContainer', {err}]);
          }

          return cbk();
        });
      }],

      // Remove the container
      remove: ['stop', ({}, cbk) => {
        return container.remove(err => {
          // Exit early when the container is already gone
          if (!!err && err.statusCode === 404) {
            return cbk();
          }

          // Exit early when the container is already being removed
          if (!!err && err.statusCode === 409) {
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorRemovingContainer', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};
