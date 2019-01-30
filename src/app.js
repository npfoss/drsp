const $ = require('jquery')
require('events').EventEmitter.defaultMaxListeners = 100;

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
        '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star',
        '/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star'
      ]
    }
  }
})

const update_btn = function(r, c, valreg) {
  // $('#btn').text(valreg.value())
  $('#r' + r + ' #c' + c + ' button').css('background-color', (valreg.value() === 1) ? 'black' : 'white')
}

const n = 20;

var valarr = [];

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, info) => {
  if (err) { throw err }
  console.log('IPFS node ready with address ' + info.id)

  const RegType = CRDT('lwwreg')

  for(var i=0; i<n; i++) {
    $('#table').append('<tr id="r' + i + '">')
    valarr[i] = [];
    for(var j=0; j<n; j++) {
      $('#r' + i).append('<td id="c' + j + '"><button/></td>')
      valarr[i][j] = RegType(info.id + (n+10)*i + j);
      update_btn(i, j, valarr[i][j])
    }
  }

  const room = Room(ipfs, 'decent-2')

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    for(var i=0; i<n; i++) {
      for(var j=0; j<n; j++) {
        const rawCRDT = codec.encode({r: i, c: j, delta:valarr[i][j].state()})
	setTimeout(() => {
	  room.sendTo(peer, rawCRDT)
	}, (n*i+j) * 25)
      }
    }
  })

  room.on('peer left', (peer) => {
    console.log('Peer left...', peer)
  })

  // now started to listen to room
  room.on('subscribed', () => {
    console.log('Now connected!')
  })

  $('button').click((e) => {
    // assumes n <= 10
    var c = e.currentTarget.parentNode.id.slice(1)
    var r = e.currentTarget.parentNode.parentNode.id.slice(1)
    var val = valarr[r][c];
    const delta = val.write((new Date).getTime(), (val.value() == null) ? 1 : (1 - val.value()))
    update_btn(r, c, val)
    const rawDelta = codec.encode({r: r, c: c, delta: delta})
    room.broadcast(rawDelta)
  })

  room.on('message', (message) => {
    var mess = codec.decode(message.data)
    r = mess['r']
    c = mess['c']
    delta = mess['delta']
    valarr[r][c].apply(delta)
    update_btn(r, c, valarr[r][c])
  })
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
