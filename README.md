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
      [size]: <Total Lightning Nodes Number>
    }

    @returns via cbk or Promise
    {
      nodes: [{
        id: <Node Public Key Hex String>
        kill: <Kill Function> ({}, cbk) => {}
        lnd: <Authenticated LND API Object>
      }]
    }

Example:

```node
const {getIdentity} = require('lightning');
const {spawnLightningCluster} = require('ln-docker-daemons');

// Launch a lightning node
const [{lnd, kill}] = spawnLightningCluster({});

const pubilcKey = (await getIdentity({lnd})).public_key;

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
    }

    @returns via cbk or Promise
    {
      cert: <LND Base64 Serialized TLS Cert>
      kill: ({}, [cbk]) => <Kill LND Daemon Promise>
      macaroon: <LND Base64 Serialized Macaroon String>
      public_key: <Identity Public Key Hex String>
      socket: <LND RPC Host:Port Network Address String>
    }
