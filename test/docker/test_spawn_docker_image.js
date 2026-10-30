const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fakeDocker = require('./fake_docker');
const method = require('./../../docker/spawn_docker_image');

const file = Buffer.from('file contents');
const image = 'example/daemon:1.0';
const path = '/data/file';
const running = containers => containers.filter(n => !n.is_removed);

// The create request made for a spawn with an exposed port
const created = {
  Cmd: ['--flag'],
  ExposedPorts: {'5678/tcp': {}},
  HostConfig: {
    AutoRemove: true,
    PortBindings: {
      '1234/tcp': [{HostPort: '1234'}],
      '5678/tcp': [{HostPort: ''}],
    },
  },
  Image: image,
  StopTimeout: 60,
};

// A daemon that has a file and serves a port Docker picks
const daemon = () => ({
  files: {[path]: file},
  kill: () => {},
  ports: {'5678/tcp': 45678},
});

// Spawn arguments with a second port, exposed, that Docker publishes
const exposing = {
  expose: ['5678/tcp'],
  ports: {'1234/tcp': 1234, '5678/tcp': undefined},
};

// Spawn arguments for an image with a port that is published as given
const makeArgs = overrides => ({
  arguments: ['--flag'],
  image,
  ports: {'1234/tcp': 1234},
  ...overrides,
});

// What a started image with a published and an exposed port looks like
const makeExpected = overrides => ({
  created,
  file,
  host: '172.17.0.2',
  images: [image],
  ports: {'1234/tcp': 1234, '5678/tcp': 45678},
  ...overrides,
});

// Spawn the image, describe what was started, then stop it
const spawn = async ({args, fake}) => {
  const res = await method(args);

  const [container] = fake.containers;
  const {file} = await res.getFile({path});

  await res.kill({});

  return {
    file,
    created: {
      Cmd: container.Cmd,
      ExposedPorts: container.ExposedPorts,
      HostConfig: container.HostConfig,
      Image: container.Image,
      StopTimeout: container.StopTimeout,
    },
    host: res.host,
    images: fake.images,
    ports: res.ports,
  };
};

const tests = [
  {
    args: makeArgs(exposing),
    description: 'An image that is already pulled is started',
    docker: {daemons: {[image]: daemon}, images: [image]},
    expected: makeExpected({}),
  },
  {
    args: makeArgs(exposing),
    description: 'An image is pulled before it is started',
    docker: {daemons: {[image]: daemon}},
    expected: makeExpected({}),
  },
  {
    args: makeArgs(exposing),
    description: 'A container that starts on a retry is used',
    docker: {daemons: {[image]: daemon}, fail: {starts: 4}, images: [image]},
    expected: makeExpected({}),
  },
  {
    args: makeArgs(exposing),
    description: 'Ports Docker does not report as published are undefined',
    docker: {
      daemons: {[image]: daemon},
      images: [image],
      network: 'unpublished',
    },
    expected: makeExpected({
      ports: {'1234/tcp': undefined, '5678/tcp': undefined},
    }),
  },
  {
    args: makeArgs({}),
    description: 'Docker that is not running is an error',
    docker: {is_offline: true},
    error: [503, 'CannotConnectToDockerDaemon'],
  },
  {
    args: makeArgs({}),
    description: 'A failure to check for the image is returned',
    docker: {fail: {image: true}},
    error: [503, 'UnexpectedErrorGettingDockerImage'],
  },
  {
    args: makeArgs({}),
    description: 'A failure to start pulling the image is returned',
    docker: {fail: {pull: 'request'}},
    error: [503, 'FailedToPullImageToSpawnDockerImage'],
  },
  {
    args: makeArgs({}),
    description: 'A pull that breaks off partway is returned as a failure',
    docker: {fail: {pull: 'stream'}},
    error: [503, 'PullFailedToCompleteSpawningDockerImage'],
  },
  {
    args: makeArgs({}),
    description: 'A failure to create the container is returned',
    docker: {fail: {creates: [image]}, images: [image]},
    error: [503, 'UnexpectedErrorCreatingDockerContainer'],
  },
  {
    args: makeArgs({}),
    description: 'A container that never starts is removed',
    docker: {fail: {starts: 5}, images: [image]},
    error: [503, 'UnexpectedErrorStartingContainer'],
  },
  {
    args: makeArgs({}),
    description: 'A container that cannot be inspected is stopped',
    docker: {fail: {inspect: true}, images: [image]},
    error: [503, 'UnexpectedErrorGettingContainerDetails'],
  },
  {
    args: makeArgs({}),
    description: 'A container without a network address is stopped',
    docker: {images: [image], network: 'none'},
    error: [503, 'ExpectedNetworkAddressForDockerContainer'],
  },
  {
    args: makeArgs({arguments: undefined}),
    description: 'Arguments are expected',
    docker: {},
    error: [400, 'ExpectedArgumentsListToSpawnDockerImage'],
  },
  {
    args: makeArgs({expose: '5678/tcp'}),
    description: 'Exposed ports are expected to be a list',
    docker: {},
    error: [400, 'ExpectedExposedPortsArrayToSpawnDockerImage'],
  },
  {
    args: makeArgs({image: undefined}),
    description: 'An image is expected',
    docker: {},
    error: [400, 'ExpectedImageRepoNameToSpawnDockerImage'],
  },
  {
    args: makeArgs({ports: undefined}),
    description: 'Port bindings are expected',
    docker: {},
    error: [400, 'ExpectedPortBindingsToSpawnDockerImage'],
  },
];

tests.forEach(({args, description, docker, error, expected}) => {
  return test(description, async t => {
    const fake = await fakeDocker(docker);

    t.after(fake.kill);

    const call = spawn({args, fake});

    if (!!error) {
      await rejects(call, error);
    } else {
      deepEqual(await call, expected);
    }

    // Nothing is left behind, whether the spawn worked or not
    return deepEqual(running(fake.containers), []);
  });
});
