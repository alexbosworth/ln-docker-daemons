const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const fakeDocker = require('./fake_docker');

test('A request the fake does not know is not found', async t => {
  const docker = await fakeDocker({});

  t.after(docker.kill);

  const url = process.env.DOCKER_HOST.replace('tcp://', 'http://');

  const res = await fetch(`${url}/unknown`);

  return deepEqual(res.status, 404);
});
