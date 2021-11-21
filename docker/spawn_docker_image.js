const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const Dockerode = require('dockerode');
const {returnResult} = require('asyncjs-util');

const getFile = require('./get_file');
const killDocker = require('./kill_docker');

const {isArray} = Array;
const {keys} =  Object;
const stopAfterRuntimeSeconds = 60;

/** Spawn a new docker image

  {
    arguments: [<Command Arguments String>]
    [expose]: [<Expose Port String>]
    image: <Image Name String>
    ports: {
      <Internal Port String>: <External Port Number>
    }
  }

  @returns via cbk or Promise
  {
    getFile: <Get File Function>
    kill: <Kill Daemon Function>
  }
*/
module.exports = ({arguments, expose, image, ports}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(arguments)) {
          return cbk([400, 'ExpectedArgumentsListToSpawnDockerImage']);
        }

        if (!!expose && !isArray(expose)) {
          return cbk([400, 'ExpectedExposedPortsArrayToSpawnDockerImage']);
        }

        if (!image) {
          return cbk([400, 'ExpectedImageRepoNameToSpawnDockerImage']);
        }

        if (!ports) {
          return cbk([400, 'ExpectedPortBindingsToSpawnDockerImage']);
        }

        return cbk();
      },

      // Instantiate a docker object against the socket
      docker: ['validate', ({}, cbk) => cbk(null, new Dockerode({}))],

      // Check if the image is cached
      getImage: ['docker', async ({docker}) => {
        try {
          return await docker.getImage(image).inspect();
        } catch (err) {
          if (err.statusCode === 404) {
            return;
          }

          if (err.code === 'ECONNREFUSED') {
            throw [503, 'CannotConnectToDockerDaemon'];
          }

          console.log("ERR", err);

          throw [503, 'UnexpectedErrorGettingDockerImage', {err}];
        }
      }],

      // Pull the docker image
      pull: ['docker', 'getImage', ({docker, getImage}, cbk) => {
        // Exit early when the image is already pulled
        if (!!getImage) {
          return cbk();
        }

        return docker.pull(image, (err, stream) => {
          if (!!err) {
            return cbk([503, 'FailedToPullImageToSpawnDockerImage', {err}]);
          }

          return docker.modem.followProgress(stream, err => {
            if (!!err) {
              return cbk([503, 'PullFailedToCompleteSpawningDockerImage']);
            }

            return cbk();
          })
        });
      }],

      // Create the container
      container: ['docker', 'pull', ({docker}, cbk) => {
        return docker.createContainer({
          Cmd: arguments,
          ExposedPorts: (expose || []).reduce((sum, port) => {
            sum[port.toString()] = {};

            return sum;
          },
          {}),
          HostConfig: {
            AutoRemove: true,
            PortBindings: keys(ports).reduce((sum, port) => {
              sum[port] = [{HostPort: ports[port].toString()}];

              return sum;
            },
            {}),
          },
          Image: image,
          StopTimeout: stopAfterRuntimeSeconds,
        },
        (err, container) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingDockerContainer', {err}]);
          }

          return cbk(null, container);
        });
      }],

      // Start the image
      start: ['container', 'docker', ({container, docker}, cbk) => {
        return asyncRetry({}, cbk => {
          return container.start(err => {
            if (!!err) {
              return cbk([503, 'UnexpectedErrorStartingContainer', {err}]);
            }

            return cbk();
          });
        },
        cbk);
      }],

      // Get the details about the container
      spawned: ['container', 'start', ({container}, cbk) => {
        return container.inspect({}, (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingContainerDetails', {err}]);
          }

          return cbk(null, {
            getFile: ({path}, cbk) => getFile({container, path}, cbk),
            host: res.NetworkSettings.IPAddress,
            kill: ({}, cbk) => killDocker({container}, cbk),
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'spawned'}, cbk));
  });
};
