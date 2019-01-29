const $ = require('jquery')

const IPFS = require('ipfs')
const Room = require('ipfs-pubsub-room')

const CRDT = require('delta-crdts')
const codec = require('delta-crdts-msgpack-codec')

const ipfs = new IPFS({
  repo: repo(),
  EXPERIMENTAL: {
    pubsub: true
  },
  config: {
    Addresses: {
      Swarm: [
        '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
      ]
    }
  }
})

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, info) => {
  if (err) { throw err }
  console.log('IPFS node ready with address ' + info.id)

  const CounterType = CRDT('gcounter')
  const num = CounterType(info.id)

  const room = Room(ipfs, 'room-name')

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    const rawCRDT = codec.encode(num.state())
    room.sendTo(peer, rawCRDT)
    console.log('Sent current state!')
  })

  room.on('peer left', (peer) => {
    console.log('Peer left...', peer)
  })

  // now started to listen to room
  room.on('subscribed', () => {
    console.log('Now connected!')
  })

  $('#btn').click(() => {
    const delta = num.inc()
    $('#num').text(num.value())
    const rawDelta = codec.encode(delta)
    room.broadcast(rawDelta)
    console.log('Sent delta!')
  })

  room.on('message', (message) => {
    console.log('Received message from ' + message.from + '!')
    delta = codec.decode(message.data)
    num.apply(delta)
    $('#num').text(num.value())
    console.log('Processed message!')
  })
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
