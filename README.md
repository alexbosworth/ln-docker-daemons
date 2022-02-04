# LN Docker Daemons

Spawn and run LN Docker daemons

Example:

```node
const {authenticatedLndGrpc, getIdentity} = require('ln-service');
const {spawnLightningDocker} = require('ln-docker-daemons');

const {cert, kill, macaroon, socket} = spawnLightningDocker({});

const {lnd} = authenticatedLndGrpc({cert, macaroon, socket});

// Fetch the identity public key of the LND node
const publicKey = (await getIdentity({lnd})).public_key;

await kill({});
```

## Environment Variables

- `DOCKER_LND_VERSION`: set this to use a custom LND docker image

Example:

```shell
export DOCKER_LND_VERSION="v0.14.0-beta"
```

A list of available tags can be found here:
https://hub.docker.com/r/lightninglabs/lnd/tags

## spawnBitcoindDocker

Spawn a Bitcoin Core Docker image

    {
      p2p_port: <P2P Port Number>
      rpc_port: <RPC Port Number>
      zmq_block_port: <ZMQ Blocks Port Number>
      zmq_tx_port: <ZMQ Transactions Port Number>
    }

    @returns via cbk or Promise
    {
      host: <Host String>
      kill: ({}, [cbk]) => <Kill Promise>
      rpc_pass: <RPC Password String>
      rpc_user: <RPC Username String>
    }

Example:

```node
const {spawnBitcoindDocker} = require('ln-docker-daemons');

// Launch a Bitcoind Docker image
const {kill} = spawnBitcoindDocker({
  p2p_port: 2345,
  rpc_port: 3456,
  zmq_block_port: 4567,
  zmq_tx_port: 5678,
});

// Stop the image
await kill({});
```

## `spawnLightningCluster`

Spawn a cluster of nodes

    {
      [lnd_configuration]: [<LND Configuration Argument String>]
      [size]: <Total Lightning Nodes Number>
    }

    @returns via cbk or Promise
    {
      nodes: [{
        generate: ({address, [count]}) => {}
        id: <Node Public Key Hex String>
        kill: <Kill Function> ({}, cbk) => {}
        lnd: <Authenticated LND API Object>
        socket: <Node Socket String>
      }]
    }

Example:

```node
const {createChainAddress, getIdentity} = require('lightning');
const {spawnLightningCluster} = require('ln-docker-daemons');

// Launch a lightning node
const {nodes} = await spawnLightningCluster({});
const [{lnd, generate, kill}] = nodes;

const publicKey = (await getIdentity({lnd})).public_key;

// Generate some coins for the wallet
await generate({count: 500});

// Stop the image
await kill({});
```

## spawnLightningDocker

Spawn an LND Docker

    {
      chain_p2p_port: <Chain Network P2P Listen Port Number>
      chain_rpc_port: <Chain Node RPC Port Number>
      chain_zmq_block_port: <Chain Node ZMQ Blocks Port Number>
      chain_zmq_tx_port: <Chain Node ZMQ Transactions Port Number>
      generate_address: <Generate Blocks to Address String>
      lightning_p2p_port: <Lightning Network P2P Listen Port Number>
      lightning_rpc_port: <Lightning Node RPC Port Number>
      [lnd_configuration]: [<LND Configuration Argument String>]
    }

    @returns via cbk or Promise
    {
      add_chain_peer: <Add Peer Function> ({socket}) => {}
      cert: <LND Base64 Serialized TLS Cert>
      chain_socket: <Chain P2P Socket String>
      kill: ({}, [cbk]) => <Kill LND Daemon Promise>
      ln_socket: <LN P2P Socket String>
      macaroon: <LND Base64 Serialized Macaroon String>
      public_key: <Identity Public Key Hex String>
      socket: <LND RPC Host:Port Network Address String>
    }
