# Versions

## 6.0.21

- Change default LND version to v0.18.2-beta

## 6.0.20

- Change default LND version to v0.18.1-beta

## 6.0.19

- Change default LND version to v0.18.0-beta

## 6.0.16

- Change default LND version to v0.17.5-beta

## 6.0.13

- Change default LND version to v0.17.4-beta

## 6.0.9

- Change default LND version to v0.17.1-beta

## 6.0.3

- Change default Bitcoin Core version to 23.0

## 6.0.1

- Change default LND version to v0.17.0-beta

### Breaking Changes

- node.js 16 is no longer supported, minimum node.js version is 18

## 5.1.3

- Change default LND version to v0.16.4-beta

## 5.1.0

- `setupChannel`: add `is_private` to setup a private channel

## 5.0.7

- Change default LND version to v0.16.3-beta

## 5.0.4

- Change default LND version to v0.16.2-beta

## 5.0.1

- Change default LND version to v0.16.1-beta

## 5.0.0

### Breaking Changes

- node.js 14 is no longer supported, minimum node.js version is 16

## 4.1.4

- Change default LND version to v0.16.0-beta

## 4.1.2

- `spawnLndDocker`: Add method to spawn an LND docker

## 4.0.4

- `spawnLightningCluster`: Return `tower` for the watchtower server socket
- `spawnLightningDocker`: Add `tower_port` to specify watchtower server port
- `spawnLightningDocker`: Return `tower_socket` for the watchtower socket

### Breaking Changes

- `spawnLightningDocker`: `tower_port` is now a required argument

## 3.1.6

- Change default LND version to v0.15.5-beta

## 3.1.5

- Change default LND version to v0.15.4-beta

## 3.1.3

- Change default LND version to v0.15.3-beta

## 3.1.1

- Change default LND version to v0.15.2-beta

## 3.1.0

- `spawnLightningDocker`: Add argument `seed` to use a predetermined seed

## 3.0.1

- `spawnLightningCluster`: Add `rpc` for custom macaroon rpc connections

### Breaking Changes

- Versions of node.js before 14 are no longer supported

## 2.3.6

- Change default LND version to v0.15.1-beta

## 2.3.5

- Change default LND version to v0.15.0-beta

## 2.3.1

- `setupChannel`: Add method to setup a channel between LND nodes

## 2.2.12

- Change default LND version to v0.14.3-beta

## 2.2.8

- Change default LND version to v0.14.2-beta

## 2.2.3

- Change Bitcoin Core version to 22.0

## 2.2.2

- Change default LND version to v0.14.1-beta

## 2.2.1

- `spawnLightningCluster`, `spawnLightningDocker`: Add `lnd_configuration` to
    allow specifying additional LND configuration parameters

## 2.1.1

- `DOCKER_LND_VERSION`: add environment variable to control docker lnd image

## 2.0.0

- `spawnLightningCluster`: add `socket` to reveal node LN p2p sockets
- `spawnLightningDocker`: add `add_chain_peer` method to add a chain peer
- `spawnLightningDocker`: add `chain_socket` method for the chain p2p socket
- `spawnLightningDocker`: add `ln_socket` method for the chain p2p socket

### Breaking Changes

- Node 12+ is required

## 1.2.0

- `spawnLightningCluster` add `generate` to generate coins for a node

## 1.1.0

- Add `spawnLightningCluster` to spawn multiple lightning dockers

## 1.0.2

- Update lnd to 0.13.1 and Bitcoin Core to 0.21.1

## 1.0.1

- `spawnBitcoindDocker`: Add method to spawn a Bitcoind Docker image
- `spawnLightningDocker`: Add method to spawn linked Bitcoind and LND images
