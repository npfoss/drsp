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

const sendPos = function(room, pos) {
  const rawDelta = codec.encode({type: 'pos', r: pos[0], c: pos[1]})
  room.broadcast(rawDelta)
}

const n = 10;

var valarr = [];

var charPos = [0,0];

var peers = {};

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, info) => {
  if (err) { throw err }
  console.log('IPFS node ready with address ' + info.id)
  const room = Room(ipfs, 'pikachu')

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

  $('#r' + charPos[0] + ' #c' + charPos[1] + '').addClass('player')
  sendPos(room, charPos)

  room.on('peer joined', (peer) => {
    console.log('Peer joined the room', peer)
    // update pos
    peers[peer] = [0,0]
    $('#r' + peers[peer][0] + ' #c' + peers[peer][1] + '').addClass('peer')
    //send room
    for(var i=0; i<n; i++) {
      for(var j=0; j<n; j++) {
        const rawCRDT = codec.encode({type: 'delta', r: i, c: j, delta:valarr[i][j].state()})
      	setTimeout(() => {
      	  room.sendTo(peer, rawCRDT)
      	}, (n*i+j) * 25)
      }
    }
    // send pos
    const rawDelta = codec.encode({type: 'pos', r: charPos[0], c: charPos[1]})
    room.sendTo(peer, rawDelta)
  })

  room.on('peer left', (peer) => {
    console.log('Peer left...', peer)
    $('#r' + peers[peer][0] + ' #c' + peers[peer][1] + '').removeClass('peer')
    delete peers[peer];
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
    const rawDelta = codec.encode({type: 'delta', r: r, c: c, delta: delta})
    room.broadcast(rawDelta)
  })

  room.on('message', (message) => {
    console.log(message)
    if (message.from === info.id){
      // it's from us. ignore it
      return;
    }
    var mess = codec.decode(message.data)
    if (mess['type'] === 'delta'){
      r = mess['r']
      c = mess['c']
      delta = mess['delta']
      valarr[r][c].apply(delta)
      update_btn(r, c, valarr[r][c])
    } else if (mess['type'] === 'pos') {
      console.log(mess)
      $('#r' + peers[message.from][0] + ' #c' + peers[message.from][1] + '').removeClass('peer')
      peers[message.from] = [mess['r'], mess['c']]
      $('#r' + peers[message.from][0] + ' #c' + peers[message.from][1] + '').addClass('peer')
    }
  })

  document.getElementById("body").onkeypress = function(e) {
    $('#r' + charPos[0] + ' #c' + charPos[1] + '').removeClass('player')
    if (e['key'] == 'w'){
      charPos[0] = Math.max(0, charPos[0] - 1);
    } else if (e['key'] == 's'){
      charPos[0] = Math.min(n-1, charPos[0] + 1);
    } else if (e['key'] == 'a'){
      charPos[1] = Math.max(0, charPos[1] - 1);
    } else if (e['key'] == 'd'){
      charPos[1] = Math.min(n-1, charPos[1] + 1);
    }
    $('#r' + charPos[0] + ' #c' + charPos[1] + '').addClass('player')
    sendPos(room, charPos)
  }
}))

function repo() {
  return 'ipfs-crdts-demo/' + Math.random()
}
