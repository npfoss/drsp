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
        '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
      ]
    }
  }
})

const n = 3;
var valarr = [];

const Grid = {
  initial: () => {
    const s = []
    for(var i=0; i<n*n; i++)
      s[i] = [0, 0]
    return s
  },
  join: (s1, s2) => {
    if (Array.isArray(s1) && Array.isArray(s2)) {
      s = []
      for(var i=0; i<n*n; i++) {
	if (s1[i][0] == s2[i][0]) {
	  s[i] = s1[i][1] > s2[i][1] ? s1[i] : s2[i]
	} else {
	  s[i] = s1[i][0] > s2[i][0] ? s1[i] : s2[i]
	}
      }
      return s
    } else if (!Array.isArray(s1) && !Array.isArray(s2)) {
      const s = []
      for(var i=0; i<n*n; i++)
	s[i] = [0, 0]
      if (s[s1[1]][0] < s1[0] || (s[s1[1]][0] == s1[0] && s[s1[1]][1] < s1[2])) {
	s[s1[1]][0] = s1[0]
	s[s1[1]][1] = s1[2]
      }
      if (s[s2[1]][0] < s2[0] || (s[s2[1]][0] == s2[0] && s[s2[1]][1] < s2[2])) {
	s[s2[1]][0] = s2[0]
	s[s2[1]][1] = s2[2]
      }
      return s
    } else if (!Array.isArray(s1) && Array.isArray(s2)) {
      const t = s1
      s1 = s2
      s2 = t
    }
    if (s2[0] > s1[s2[1]][0] || (s2[0] == s1[s2[1]][0] && s2[2] > s1[s2[1]][1])) {
      s1[s2[1]][0] = s2[0]
      s1[s2[1]][1] = s2[1]
    }
    return s1
  },
  value: (state) => state,
  mutators: {
    write (id, s, ts, r, c, v) {
      return {ts: ts, n: n*r+c, v: v}
    }
  }
}

CRDT.define('grid', Grid)

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, info) => {
  if (err) { throw err }
  console.log('IPFS node ready with address ' + info.id)

  const grid = CRDT('grid')(info.id)

  function update_btn(r, c) {
    $('#r' + r + ' #c' + c + ' button').css('background-color', (grid.value()[n*r+c]) ? 'black' : 'white')
  }

  for(var i=0; i<n; i++) {
    $('#table').append('<tr id="r' + i + '">')
    for(var j=0; j<n; j++) {
      $('#r' + i).append('<td id="c' + j + '"><button/></td>')
      update_btn(i, j)
    }
  }

  const room = Room(ipfs, 'decent-2')

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    const rawCRDT = codec.encode(grid)
    room.sendTo(peer, rawCRDT)
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
    var c = e.currentTarget.parentNode.id[1]
    var r = e.currentTarget.parentNode.parentNode.id[1]
    const curVal = grid.value()[n*r+c]
    const delta = grid.write((new Date).getTime(), n*r+c, 1 - curVal)
    update_btn(r, c, val)
    const rawDelta = codec.encode(delta)
    room.broadcast(rawDelta)
  })

  room.on('message', (message) => {
    var delta = codec.decode(message.data)
    grid.apply(delta)
    if (Arrays.isArray(delta)) {
      for (var i=0; i<n*n; i++)
	update_btn(~~(i/n), i%n)
    } else {
      update_btn(~~(delta[1]/n), delta[1]%n)
    }
  })
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
