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

Supported methods:

- setupChannel: Create a channel between lnds
- spawnBitcoindDocker: Run a Bitcoin Core container
- spawnLightningCluster: Spin up a group of nodes
- spawnLightningDocker: Run lnd + bitcoind

One liner for killing all running Docker containers:

```
docker container kill $(docker ps -q)
```

## Environment Variables

- `DOCKER_LND_VERSION`: set this to use a custom LND docker image

Example:

```shell
export DOCKER_LND_VERSION="v0.14.0-beta"
```

A list of available tags can be found here:
https://hub.docker.com/r/lightninglabs/lnd/tags

## `setupChannel`

Setup channel

    {
      [capacity]: <Channel Capacity Tokens Number>
      generate: <Generate Blocks Promise>
      [give_tokens]: <Gift Tokens Number>
      [is_private]: <Is Private Bool>
      lnd: <Authenticated LND API Object>
      [partner_csv_delay]: <Partner CSV Delay Number>
      to: {
        id: <Partner Public Key Hex String>
        socket: <Network Address String>
      }
    }

    @returns via cbk or Promise
    {
      id: <Standard Format Channel Id String>
      transaction_id: <Funding Transaction Id Hex String>
      transaction_vout: <Funding Transaction Output Index Number>
    }

Example:

```node
const {getNetworkInfo} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {kill, nodes} = await spawnLightningCluster({size: 2});

const [alice, bob] = nodes;

await setupChannel({generate: alice.generate, lnd: alice.lnd, to: bob});

const networkInfo = await getNetworkInfo({lnd: alice.lnd});
// networkInfo.channel_count now equals 1

await kill({});
```

## `spawnBitcoindDocker`

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
        generate: <Make Block Function> ({address, count}, [cbk]) => {}
        id: <Node Public Key Hex String>
        kill: <Kill Function> ({}, cbk) => {}
        lnd: <Authenticated LND API Object>
        rpc: <RPC Connection Function> ({macaroon}) => {}
        socket: <Node Socket String>
        tower: <LND Tower Socket Host:Port Network Address String>
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

## `spawnLightningDocker`

Spawn an LND Docker

    {
      chain_p2p_port: <Chain Network P2P Listen Port Number>
      chain_rpc_port: <Chain Node RPC Port Number>
      chain_zmq_block_port: <Chain Node ZMQ Blocks Port Number>
      chain_zmq_tx_port: <Chain Node ZMQ Transactions Port Number>
      generate_address: <Generate Blocks to Address String>
      lightning_p2p_port: <Lightning Network P2P Listen Port Number>
      lightning_rpc_port: <Lightning Node RPC Port Number>
      lightning_tower_port: <Lightning Tower Port Number>
      [lnd_configuration]: [<LND Configuration Argument String>]
      [seed]: <Mnemonic Seed String>
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
      tower_socket: <LND Tower Socket Host:Port Network Address String>
    }

## `spawnLndDocker`

Spawn a new Docker image running LND

    {
      bitcoind_rpc_host: <Bitcoin Core RPC Host String>
      bitcoind_rpc_pass: <Bitcoin Core RPC Password String>
      bitcoind_rpc_port: <Bitcoin Core RPC Port Number>
      bitcoind_rpc_user: <Bitcoin Core RPC Username String>
      [bitcoind_zmq_block_port]: <Bitcoin Core ZMQ Block Port Number>
      [bitcoind_zmq_tx_port]: <Bitcoin Core ZMQ Transaction Port Number>
      [configuration]: [<LND Configuration Argument String>]
      p2p_port: <LND Peer to Peer Listen Port Number>
      rpc_port: <LND RPC Port Number>
      tower_port: <LND Tower Port Number>
      [seed]: <Mnemonic Seed String>
    }

    @returns via cbk or Promise
    {
      cert: <LND Base64 Serialized TLS Cert Base64 String>
      kill: ({}, [cbk]) => <Kill LND Docker Promise>
      macaroon: <LND Base64 Serialized Macaroon String>
      public_key: <LND Public Key Hex String>
      socket: <LND RPC Host:Port Network Address String>
      tower_socket: <LND Tower Socket Host:Port Network Address String>
    }
