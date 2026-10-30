const {createServer} = require('node:http');

const blockSize = 512;
const {ceil} = Math;
const {concat} = Buffer;
const firstPickedPort = 32768;
const {fromEntries} = Object;
const {keys} = Object;
const {stringify} = JSON;

// Make a tar archive holding one file
const makeTar = ({data, name}) => {
  const header = Buffer.alloc(blockSize);
  const padded = Buffer.alloc(ceil(data.length / blockSize) * blockSize);

  header.write(name, 0, 'ascii');
  header.write(data.length.toString(8).padStart(11, '0'), 124, 'ascii');
  header.write('0', 156, 'ascii');

  data.copy(padded);

  return concat([header, padded, Buffer.alloc(blockSize * 2)]);
};

// A container without a daemon serves no files and no ports
const noDaemon = () => ({files: {}, kill: () => {}, ports: {}});

/** Start a fake Docker Engine API and point DOCKER_HOST at it

  {
    [daemons]: {
      <Image Name String>: ({cmd}) => <Started Daemon Promise>
    }
    [fail]: {
      [creates]: [<Fail Creating a Container of Image Name String>]
      [image]: <Fail Checking For Images Bool>
      [inspect]: <Fail Inspecting Containers Bool>
      [pull]: <Fail Pulling 'request' or 'stream' String>
      [starts]: <Fail Starting Containers Count Number>
    }
    [images]: [<Already Pulled Image Name String>]
    [is_offline]: <Docker Is Not Running Bool>
    [network]: <Report No Network 'none' or No Published Ports 'unpublished'>
  }

  @returns via Promise
  {
    containers: [{
      Cmd: [<Command Argument String>]
      ExposedPorts: <Exposed Ports Object>
      HostConfig: <Host Configuration Object>
      Image: <Image Name String>
      id: <Container Id String>
      [is_forced]: <Container Was Force Removed Bool>
      [is_removed]: <Container Was Removed Bool>
      [is_started]: <Container Was Started Bool>
      [is_stopped]: <Container Was Stopped Bool>
      [ports]: {
        <Container Port String>: <Published Host Port Number>
      }
    }]
    images: [<Pulled Image Name String>]
    kill: () => <Stop Docker and Daemons Promise>
  }
*/
module.exports = async args => {
  const containers = [];
  const daemons = {...args.daemons};
  const fail = {...args.fail};
  const {network} = args;

  const creates = [...(fail.creates || [])];
  let picked = 0;
  const pulled = [...(args.images || [])];
  let starts = fail.starts || 0;

  const find = id => containers.find(n => n.id === id);

  // Start a container's daemon and decide which host ports it publishes
  const start = async container => {
    const bindings = container.HostConfig.PortBindings;
    const startDaemon = daemons[container.Image] || noDaemon;

    const daemon = await startDaemon({cmd: container.Cmd});

    const published = keys(bindings).map(port => {
      const requested = Number(bindings[port][0].HostPort);

      // A daemon listens on its own ports, others are published as requested
      if (!!daemon.ports[port] || !!requested) {
        return [port, daemon.ports[port] || requested];
      }

      // Docker picks a host port when none is requested
      const pickedPort = firstPickedPort + picked;

      picked += 1;

      return [port, pickedPort];
    });

    container.daemon = daemon;
    container.is_started = true;
    container.ports = fromEntries(published);

    return;
  };

  // Describe a container the way Docker inspects it
  const describe = container => {
    const ports = keys(container.ports).reduce((sum, port) => {
      sum[port] = [{HostIp: '0.0.0.0', HostPort: `${container.ports[port]}`}];

      return sum;
    },
    {});

    return {
      Id: container.id,
      NetworkSettings: {
        Networks: network === 'none' ? undefined : {
          bridge: {IPAddress: container.ip},
        },
        Ports: network === 'unpublished' ? null : ports,
      },
    };
  };

  // Answer requests, in the order they are checked
  const routes = [
    [/^GET \/images\/(.+)\/json$/, ({match, reply}) => {
      if (!!fail.image) {
        return reply(500, {message: 'Docker failed to check for the image'});
      }

      if (!pulled.includes(match[1])) {
        return reply(404, {message: `No such image: ${match[1]}`});
      }

      return reply(200, {Id: `sha256:${'0'.repeat(64)}`});
    }],

    [/^POST \/images\/create$/, ({res, reply, url}) => {
      const from = url.searchParams.get('fromImage');
      const tag = url.searchParams.get('tag');

      if (fail.pull === 'request') {
        return reply(500, {message: 'Docker failed to start pulling'});
      }

      const progress = `${stringify({status: `Pulling from ${from}`})}\n`;

      res.writeHead(200, {'Content-Type': 'application/json'});

      // Drop the connection partway through the pull
      if (fail.pull === 'stream') {
        return res.write(progress, () => res.socket.destroy());
      }

      pulled.push(`${from}:${tag}`);

      res.write(progress);

      return res.end(`${stringify({status: 'Downloaded newer image'})}\n`);
    }],

    [/^POST \/containers\/create$/, ({body, reply}) => {
      const created = JSON.parse(body);
      const failing = creates.indexOf(created.Image);

      if (failing !== -1) {
        creates.splice(failing, 1);

        return reply(500, {message: 'Docker failed to create the container'});
      }

      const id = (containers.length + 1).toString(16).padStart(64, '0');
      const ip = `172.17.0.${containers.length + 2}`;

      containers.push({...created, id, ip});

      return reply(201, {Id: id, Warnings: []});
    }],

    [/^POST \/containers\/(\w+)\/start$/, async ({match, reply}) => {
      if (!!starts) {
        starts -= 1;

        return reply(500, {message: 'Docker failed to start the container'});
      }

      await start(find(match[1]));

      return reply(204);
    }],

    [/^GET \/containers\/(\w+)\/json$/, ({match, reply}) => {
      if (!!fail.inspect) {
        return reply(500, {message: 'Docker failed to inspect the container'});
      }

      return reply(200, describe(find(match[1])));
    }],

    [/^POST \/containers\/(\w+)\/stop$/, ({match, reply}) => {
      find(match[1]).is_stopped = true;

      return reply(204);
    }],

    [/^DELETE \/containers\/(\w+)$/, ({match, reply, url}) => {
      const container = find(match[1]);

      container.is_forced = url.searchParams.get('force') === 'true';
      container.is_removed = true;

      return reply(204);
    }],

    [/^GET \/containers\/(\w+)\/archive$/, ({match, res, reply, url}) => {
      const path = url.searchParams.get('path');

      const data = find(match[1]).daemon.files[path];

      if (!data) {
        return reply(404, {message: `Could not find the file ${path}`});
      }

      res.writeHead(200, {'Content-Type': 'application/x-tar'});

      return res.end(makeTar({data, name: path.split('/').pop()}));
    }],

    [/^/, ({reply}) => reply(404, {message: 'page not found'})],
  ];

  const server = createServer((req, res) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));

    return req.on('end', () => {
      const url = new URL(req.url, 'http://docker');

      const request = `${req.method} ${url.pathname}`;

      const [pattern, respond] = routes.find(([n]) => n.test(request));

      return respond({
        res,
        url,
        body: concat(chunks).toString(),
        match: request.match(pattern),
        reply: (code, json) => {
          res.writeHead(code, {'Content-Type': 'application/json'});

          return res.end(stringify(json));
        },
      });
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  // Dockerode connects to the Docker Engine named by DOCKER_HOST
  delete process.env.DOCKER_CERT_PATH;
  delete process.env.DOCKER_TLS_VERIFY;

  process.env.DOCKER_HOST = `tcp://127.0.0.1:${server.address().port}`;

  // A Docker Engine that is not running refuses connections
  if (!!args.is_offline) {
    server.close();
  }

  return {
    containers,
    images: pulled,
    kill: async () => {
      server.closeAllConnections();
      server.close();

      const started = containers.filter(n => !!n.daemon);

      return await Promise.all(started.map(n => n.daemon.kill()));
    },
  };
};

module.exports.firstPickedPort = firstPickedPort;
