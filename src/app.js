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

const update_btn = function(btnID, valreg) {
  // $('#btn').text(valreg.value())
  console.log('setting color for:' + btnID)
  $(btnID).css('background-color', (valreg.value() === 0) ? 'white' : 'black')
}

var valarr = [];

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, info) => {
  if (err) { throw err }
  console.log('IPFS node ready with address ' + info.id)

  const RegType = CRDT('lwwreg')

  const n = 3;

  for(var i=0; i<n; i++) {
      valarr[i] = [];
      for(var j=0; j<n; j++) {
          valarr[i][j] = RegType(info.id + (n+10)*i + j);
          update_btn('.r' + i + ' .c' + j + ' button', valarr[i][j])
      }
  }


  const room = Room(ipfs, 'room-name')

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    for(var i=0; i<n; i++) {
      for(var j=0; j<n; j++) {
        const rawCRDT = codec.encode({r: i, c: j, delta:valarr[i][j].state()})
        room.sendTo(peer, rawCRDT)
      }
    }
    console.log('Sent current state!')
  })

  room.on('peer left', (peer) => {
    console.log('Peer left...', peer)
  })

  // now started to listen to room
  room.on('subscribed', () => {
    console.log('Now connected!')
  })

  $('button').click((e) => {
    // assumes n < 10
    var c = e.currentTarget.parentNode.classList[0][1]
    var r = e.currentTarget.parentNode.parentNode.classList[0][1]
    var val = valarr[r][c];
    const delta = val.write((new Date).getTime(), (val.value() == null) ? 1 : (1 - val.value()))
    update_btn('.r' + r + ' .c' + c + ' button', val)
    const rawDelta = codec.encode({r: i, c: j, delta: delta})
    room.broadcast(rawDelta)
    console.log('Sent delta!')
  })

  room.on('message', (message) => {
    console.log('Received message from ' + message.from + '!')
    var mess = codec.decode(message.data)
    console.log(mess)
    r = mess['r']
    c = mess['c']
    delta = mess['delta']
    console.log(r)
    console.log(c)
    console.log(delta)
    console.log(valarr)
    valarr[r][c].apply(delta)
    update_btn('.r' + r + ' .c' + c + ' button', valarr[r][c])
    console.log('Processed message!')
  })
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
