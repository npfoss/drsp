# [DRSP](http://npfoss.com/drsp)
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

## peering servers

Unfortunately this does rely on peering servers to make the initial contact between two users.
Here's an example setup of such a server:

First, get nginx and docker (you can do it without docker too).

You will also need https certs since Chrome won't let you use http websocket on https pages.

To start the actual peering server run `sudo docker run -d -p 9090:9090 --name rendezvous libp2p/websocket-star-rendezvous:release`.

To make it possible to use with https (a must), run nginx with an `nginx.conf` file like the one in [rendezvous](https://github.com/npfoss/drsp/tree/master/rendezvous).
These commands may be useful:
```bash
sudo systemctl start nginx
sudo systemctl status nginx
sudo systemctl stop nginx
```

You should now be able to add a peering server to the list that looks something like `'/dns4/npfoss.mit.edu/tcp/13579/wss/p2p-websocket-star/'`!
