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

  const RegType = CRDT('lwwreg')
  const val = RegType(info.id)

  const room = Room(ipfs, 'room-name')

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    const rawCRDT = codec.encode(val.state())
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

  $('#btn').click((e) => {
    const delta = val.write((new Date).getTime(), (val.value() == null) ? 1 : (1 - val.value()))
    $('#val').text(val.value())
    const rawDelta = codec.encode(delta)
    room.broadcast(rawDelta)
    console.log('Sent delta!')
  })

  room.on('message', (message) => {
    console.log('Received message from ' + message.from + '!')
    delta = codec.decode(message.data)
    val.apply(delta)
    $('#val').text(val.value())
    console.log('Processed message!')
  })
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
