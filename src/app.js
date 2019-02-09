'use strict';

/*
TODO:
urget, pre-launch:
- make it work on Safari and Firefox too
- add semi-transparent overlay on page load that tells the controls, disappear on first legal keypress
- name/website?
- local storage?
- security:
  - prevent illeagal timestamps

other:
security:
  - prevent illeagal updates (setting whole screen black)
- confirm IPFS node isn't doing a lot of stuff
- left column off-by-one error (not any other side...)
- minimap
*/

const $ = require('jquery')
require('events').EventEmitter.defaultMaxListeners = 100;
const Base58 = require('base58')

const IPFS = require('ipfs')
const Room = require('ipfs-pubsub-room')

const CRDT = require('delta-crdts')
const RegType = CRDT('lwwreg')
const codec = require('delta-crdts-msgpack-codec')

const names = require('./names')
const colors = require('./colors')

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

function repo() {
  return 'ipfs-ddocs-' + Math.random()
}

var ipfs = new IPFS({
  repo: repo(),
  EXPERIMENTAL: {
    pubsub: true
  },
  config: {
    Addresses: {
      Swarm: [
        // '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star',
        // '/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star',
        // "/dns4/star-signal.cloud.ipfs.team/tcp/443/wss/p2p-webrtc-star",
        //'/ip4/18.96.5.117/tcp/9090/ws/p2p-websocket-star/',
        '/dns4/jb-odysseus.mit.edu/tcp/13579/wss/p2p-websocket-star/',
      ],
      API: '',
      Gateway: '',
    },
  }
})
var info = undefined; // will be defined as soon as ipfs connects

const roomSize = 25; // always odd so player can be in center
// number of tiles per side of a room
const mapSize = 255; // number of rooms per side (all in a grid)
// pos [0,0] is at the top left of the top left map tile,
//  [roomSize*mapSize-1, roomSize*mapSize-1] is the bottom right
const center = Math.floor(mapSize * roomSize / 2)

/***** A note about postition notation *****

all positions (usually in the form pos = [num, num]) should be absolute

i , j refer to position in an individual map/CRDT array

r , c refer to row and column of the actual displayed grid

map does not wrap around

*/

const generateStartPos = function() {
  return (Math.floor(mapSize/2) - 2) * roomSize + Math.floor(Math.random() * 5) * roomSize + Math.floor(roomSize / 2)
}

var charPos = [generateStartPos(), generateStartPos()];

var peers = {};
var peerList = {};

var rooms = {};
var valArrs = {};

// Currently selected color, initialize to black
var curColor = 1;

var posToRC = function(pos) {
  // matters because always at the center
  let r = pos[0] - charPos[0] + (roomSize-1)/2
  let c = pos[1] - charPos[1] + (roomSize-1)/2
  return (r < 0 || c < 0 || r >= roomSize || c >= roomSize) ? undefined : [r,c];
}

var posToIJ = function(pos) {
  return [(pos[0] + roomSize) % roomSize , (pos[1] + roomSize) % roomSize]
}

var rcToPos = function(r, c) {
  // charPos is absolute player position
  return [charPos[0] + r - (roomSize-1)/2, charPos[1] + c - (roomSize-1)/2]
}

var updateBtn = function(r, c, valreg) {
  // $('#btn').text(valreg.value())
  const desc = '#r' + r + ' #c' + c + ' button'
  if (valreg == null) {
    $(desc).css('background-color', 'gray')
  } else if (valreg.value() == null) {
    $(desc).css('background-color', 'white')
  } else {
    $(desc).css('background-color', colors[valreg.value()])
  }
}

var showPeer = function(pos, peer) {
  let peerrc = posToRC(pos);
  if (!(peerrc === undefined)){
    if (peerrc[0] == Math.floor(roomSize/2) && peerrc[1] == Math.floor(roomSize/2)) {
      return
    }
    const playerDesc = '#r' + peerrc[0] + ' #c' + peerrc[1] + ''
    $(playerDesc).addClass('player')
    $(playerDesc).css('background-color', colorForPeer(peer))
    $(playerDesc).append('<div id="name">' + nameForPeer(peer) + '</div>')
    $(playerDesc + ' #name').css('background-color', colorForPeer(peer))
  }
}

var unshowPeer = function(pos) {
  let peerrc = posToRC(pos);
  if (!(peerrc === undefined)){
    if (peerrc[0] == Math.floor(roomSize/2) && peerrc[1] == Math.floor(roomSize/2)) {
      return
    }
    const playerDesc = '#r' + peerrc[0] + ' #c' + peerrc[1] + ''
    $(playerDesc).removeClass('player')
    $(playerDesc).css('background-color', 'white')
    $(playerDesc + ' #name').remove()
  }
}

var sendPos = function(room, pos) {
  if (room === undefined){
    console.log('sendPos: room undefined')
    return
  }
  let rawDelta = codec.encode({type: 'pos', p0: pos[0], p1: pos[1]})
  room.broadcast(rawDelta)
}

var getRoomID = function(pos){
  // absolute game pos
  if (pos[0] < 0 || pos[1] < 1 || pos[0] >= mapSize*roomSize || pos[1] >= mapSize*roomSize) {
    return undefined
  }
  return 'rsp-' + Math.floor(pos[0]/roomSize) + '-' + Math.floor(pos[1]/roomSize)
}

var colorForPeer = function(peer){
  const val = Base58.base58_to_int(peer.substring(10, 15))
  const hue = val % 360
  const lightness = 60 + val % 25
  return 'hsl(' + hue + ', 100%, ' + lightness + '%)'
}

var nameForPeer = function(peer){
  const val = Base58.base58_to_int(peer.substring(15, 20))
  return names[val % names.length]
}

// sets up a new room and CRDT
var setupRoom = function(pos) {
  let roomID = getRoomID(pos)
  console.log('setting up new room! ' + roomID)
  // roompos is top left
  let roompos = [Math.floor(pos[0]/roomSize) * roomSize, Math.floor(pos[1]/roomSize) * roomSize]
  let room = Room(ipfs, roomID, {pollInterval: 5000})

  // now started to listen to room
  room.on('subscribed', () => {
    console.log('Now connected!')
  })

  // first the CRDT
  let valarr = [];
  for(let i = 0; i < roomSize; i++) {
    valarr[i] = [];
    for(let j = 0; j < roomSize; j++) {
      valarr[i][j] = RegType(info.id + roomID + (roomSize+40)*i + j);
    }
  }
  valArrs[roomID] = valarr;

  // next set up all the callbacks
  room.on('peer joined', (peer) => {
    console.log('Peer joined room ' + roomID + ': ' + peer)
    if (peerList[roomID] == null) {
      peerList[roomID] = [info.id]
    }
    peerList[roomID].push(peer)
    peerList[roomID].sort()
    // update pos
    if (!(peer in peers)) {
      // sometimes sends us a message first smh. they're already shown if so
      peers[peer] = [0,0]
      showPeer(peers[peer], peer)
    }
    //send room
    const me = peerList[roomID].indexOf(info.id)
    const you = peerList[roomID].indexOf(peer)
    const nPeers = peerList[roomID].length
    if ((you > me && you <= me + 3)
        || (you + nPeers > me && you + nPeers <= me + 3)) {
      console.log("sending info to " + peer);
      let delay = 0
      for(let i=0; i<roomSize; i++) {
      	for(let j=0; j<roomSize; j++) {
          // no need to send null tiles...
      	  if (valArrs[roomID][i][j].state()[0] > 0) {
            let rawCRDT = codec.encode({type: 'delta', i: i, j: j, delta:valArrs[roomID][i][j].state()})
            window.setTimeout(() => {
              room.sendTo(peer, rawCRDT)
            }, delay)
      	    delay += 25
      	  }
      	}
      }
    }
    // send pos
    let rawDelta = codec.encode({type: 'pos', p0: charPos[0], p1: charPos[1]})
    room.sendTo(peer, rawDelta)
  })

  room.on('peer left', (peer) => {
    console.log('Peer left room ' + roomID + ': ' + peer)
    const peerIndex = peerList[roomID].indexOf(peer)
    if (peerIndex != -1) {
      peerList[roomID].splice(peerIndex, 1)
      console.log('peers are now ' + peerList[roomID])
    }
    if (peer in peers){
      // sometimes peers are reported as leaving the room multiple times, or before they've joined...?
      unshowPeer(peers[peer])
      delete peers[peer];
    }
  })

  room.on('message', async (message) => {
    if (message.from === info.id){
      // it's from us. ignore it
      return;
    }
    let mess = codec.decode(message.data)
    if (mess['type'] === 'delta'){
      let i = mess['i']
      let j = mess['j']
      let delta = mess['delta']
      valArrs[roomID][i][j].apply(delta)
      let rc = posToRC([roompos[0] + i, roompos[1] + j])
      if (rc !== undefined) {
        updateBtn(rc[0], rc[1], valArrs[roomID][i][j])
      }
    } else if (mess['type'] === 'pos') {
      peers[message.from] = [mess['p0'], mess['p1']]
      // if (message.from in peers){
      //   unshowPeer(peers[message.from])
      // }
      // showPeer(peers[message.from], message.from)
      refreshMap()
    }
  })

  rooms[roomID] = room
}

var getRoom = function(pos) {
  // pos is absolute game position over the whole map
  let roomID = getRoomID(pos)
  if (roomID === undefined) {
    return undefined;
  }

  if (!(roomID in rooms)) {
    // need to create a new room
    setupRoom(pos)
  }
  return rooms[roomID];
}

var getValArr = function(pos) {
  // pos is absolute game position over the whole map
  let roomID = getRoomID(pos)
  if (roomID === undefined) {
    return undefined;
  }

  if (!(roomID in rooms)) {
    // need to create a new room
    setupRoom(pos)
  }
  return valArrs[roomID];
}

var refreshMap = function() {
  for(let r = 0; r < roomSize; r++) {
    for(let c = 0; c < roomSize; c++) {
      let pos = [charPos[0] + r - (roomSize-1)/2, charPos[1] + c - (roomSize-1)/2]
      unshowPeer(pos)
      let valarr = getValArr(pos)
      if (valarr === undefined) {
        updateBtn(r, c, undefined)
      } else {
        let ij = posToIJ(pos)
        updateBtn(r, c, valarr[ij[0]][ij[1]])
      }
    }
  }
  const locsDrawn = {}
  for (let key in peers) {
    if (peers.hasOwnProperty(key)) {
      const loc = peers[key]
      if (locsDrawn[loc] == undefined) {
	showPeer(peers[key], key)
	locsDrawn[loc] = true
      }
    }
  }
  $('#coords').text('(' + (charPos[1]-center) + ', ' + (center-charPos[0]) + ')')
}

var updateColorSelector = function() {
  $('#colorList').children().each((i, el) => {
    if (i === curColor) {
      if (!$(el).hasClass('selected')) {
	$(el).addClass('selected')
      }
    } else {
      if ($(el).hasClass('selected')) {
	$(el).removeClass('selected')
      }
    }
  })
}

// IPFS node is ready, so we can start using ipfs-pubsub-room
ipfs.once('ready', () => ipfs.id((err, infoArg) => {
  if (err) { throw err }
  info = infoArg;
  console.log('IPFS node ready with address ' + info.id)

  // build table
  for(let i = 0; i < roomSize; i++) {
    $('#table').append('<tr id="r' + i + '">')
    for(let j = 0; j < roomSize; j++) {
      $('#r' + i).append('<td id="c' + j + '"><button/></td>')
    }
  }

  const playerDesc = '#r' + (roomSize-1)/2 + ' #c' + (roomSize-1)/2 + ''
  $(playerDesc).addClass('player')
  $(playerDesc).css('background-color', colorForPeer(info.id))
  $(playerDesc).append('<div id="name">' + nameForPeer(info.id) + '</div>')
  $(playerDesc + ' #name').css('background-color', colorForPeer(info.id))

  $("button#go-btn").click(function () {
    let inp = $('#room-input').val();
    let h = Math.abs(inp.hashCode())
    let y = h % mapSize
    let x = Math.ceil(h / mapSize) % mapSize
    console.log('going to room ' + x + ' ' + y)
    /// should probably broadcast change in pos to this room TODO
    let newPos = [x*roomSize+(roomSize-1)/2, y*roomSize+(roomSize-1)/2]
    sendPos(getRoom(charPos), newPos)
    charPos = newPos
    refreshMap()
    sendPos(getRoom(charPos), charPos)
  })
  // so you don't click the button every time you hit space now
  $('button#go-btn').mouseup(function() { this.blur() })

  $("#numColors").text(colors.length-1)
  for (let color of colors) {
    $("#colorList").append('<span style="background-color: ' + color + '"></span>')
  }
  updateColorSelector()

  refreshMap()
  sendPos(getRoom(charPos), charPos)

  document.onkeydown = function(e) {
    if (e.repeat) {
      // prevents holding down keys
      return
    }
    let prevroom = getRoom(charPos)
    if (e['key'] == ' ') {
      // assumes roomSize <= 10
      let pos = charPos
      let roomID = getRoomID(pos)
      if (roomID === undefined){
      	updateBtn(r, c, undefined)
      	return
      }
      let room = getRoom(pos)
      let ij = posToIJ(pos)
      let val = valArrs[roomID][ij[0]][ij[1]]
      let delta = val.write((new Date).getTime(), curColor)
      let rc = posToRC(pos)
      updateBtn(rc[0], rc[1], val)
      let rawDelta = codec.encode({type: 'delta', i: ij[0], j: ij[1], delta: delta})
      room.broadcast(rawDelta)
      return
    } else if (!isNaN(e['key']) && (+e['key']) < colors.length) {
      curColor = +e['key']
      updateColorSelector()
    }  
    if (e['key'] == 'w'){
      charPos[0] -= 1;
    } else if (e['key'] == 's'){
      charPos[0] += 1;
    } else if (e['key'] == 'a'){
      charPos[1] -= 1;
    } else if (e['key'] == 'd'){
      charPos[1] += 1;
    } else {
      console.log('unsupported keypress')
      return
    }
    let newroom = getRoom(charPos)
    sendPos(newroom, charPos)
    if (newroom !== prevroom) {
      sendPos(prevroom, charPos)
    }
    refreshMap()
  }
}))

