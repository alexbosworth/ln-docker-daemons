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

  An undefined external port is published on a free port that Docker picks

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
    host: <Container Network Address String>
    kill: <Kill Daemon Function>
    ports: {
      <Internal Port String>: <External Port Number>
    }
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
              // Docker picks a free host port when none is specified
              sum[port] = [{HostPort: !ports[port] ? '' : `${ports[port]}`}];

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
        err => {
          // Exit early when the container started
          if (!err) {
            return cbk();
          }

          // Remove the container so a failed start does not leave it behind
          return container.remove({force: true}, () => cbk(err));
        });
      }],

      // Get the details about the container
      spawned: ['container', 'start', ({container}, cbk) => {
        return container.inspect({}, (err, res) => {
          if (!!err) {
            return killDocker({container}, () => cbk([
              503,
              'UnexpectedErrorGettingContainerDetails',
              {err},
            ]));
          }

          const network = res.NetworkSettings;
          const published = network.Ports || {};
          const {bridge} = network.Networks || {};

          const host = network.IPAddress || (!!bridge && bridge.IPAddress);

          // Exit early when the container has no network address
          if (!host) {
            return killDocker({container}, () => {
              return cbk([503, 'ExpectedNetworkAddressForDockerContainer']);
            });
          }

          return cbk(null, {
            host,
            getFile: ({path}, cbk) => getFile({container, path}, cbk),
            kill: ({}, cbk) => killDocker({container}, cbk),
            ports: keys(ports).reduce((sum, port) => {
              const [binding] = published[port] || [];

              sum[port] = !binding ? undefined : Number(binding.HostPort);

              return sum;
            },
            {}),
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'spawned'}, cbk));
  });
};
