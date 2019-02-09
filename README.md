# DRSP
DRSP, which stands for decentralized [r/place](https://www.reddit.com/r/place/top/?t=all) (our inspiration), is a real-time massive multiplayer decentralized persistent virtual world.

There is no central server behind this game.
You dynamically load small chunks of a gigantic map as you move around,
and sync updates about the world state only with the othe people in those chunks.

It's built with [IPFS](https://ipfs.io/) [pubsub room](https://github.com/ipfs-shipyard/ipfs-pubsub-room) and [delta-crdts](https://github.com/ipfs-shipyard/js-delta-crdts).
CRDTs are Confilct-free Replicated Data Types, and are the reason everyone on DRSP ends up with the same world-state no matter what order updates are recieved in.

## installation

`npm install`

## run

```bash
npm run compile
npm run start
```