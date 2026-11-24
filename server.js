'use strict';
// LAN server for Yunwang Paradise: serves the game files and runs Paradise Brawl matches over WebSockets.
// Uses only Node.js built-in modules (no npm install needed).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const D = require('./js/data.js');
const { Sim } = require('./js/sim.js');

const ARGS = process.argv.slice(2);
function arg(name, def) {
  const i = ARGS.indexOf('--' + name);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : def;
}

const PORT = Number(process.env.PORT || arg('port', 8080));
const HOST = arg('host', '0.0.0.0');
const MAX_TOTAL = 30;
const LEGACY_PLAYERS = Number(arg('players', 0));
const DEFAULT_BOTS = Math.max(0, Math.min(MAX_TOTAL - 1, Number(arg('bots', LEGACY_PLAYERS ? LEGACY_PLAYERS - 1 : 13)) || 0));
// Level 1 (beginner) to 5 (hard); the names easy, normal and hard from older versions mean 3, 4 and 5.
const DIFFICULTY = D.diffLevel(arg('difficulty', '')) || D.DIFF_DEFAULT;
// ffa: everyone for themselves; teams: red against blue; coop: everyone together against the bots.
const MODE = D.TEAM_MODES.indexOf(arg('mode', '')) >= 0 ? arg('mode', '') : 'ffa';
// Snapshots wait in the socket buffer no longer than this; a slow connection skips to the newest one.
const SNAP_BUFFER = 96 * 1024;
// Seconds before a match starts on its own once someone is in the room; 0 means the host presses Start.
const AUTOSTART = Math.max(0, Number(arg('autostart', arg('lobby', 0))) || 0);
const STATS = ARGS.indexOf('--stats') >= 0;
const ROOT = __dirname;
const MAX_FRAME = 64 * 1024;
const MAX_CLIENTS = 64;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};
const ALLOWED_DIRS = ['', 'js', 'css', 'assets', 'assets/sfx'];

function serveFile(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const rel = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const full = path.join(ROOT, rel);
  const ext = path.extname(full).toLowerCase();
  const dir = path.dirname(rel) === '.' ? '' : path.dirname(rel).split(path.sep).join('/');
  if (!full.startsWith(ROOT + path.sep) || !MIME[ext] || ALLOWED_DIRS.indexOf(dir) < 0 || rel.startsWith('server')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

class WsConn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.open = true;
    this.onMessage = onMessage;
    this.onClose = onClose;
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }

  closed() {
    if (!this.open) return;
    this.open = false;
    this.onClose(this);
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) {
          this.close();
          return;
        }
        len = Number(big);
        off = 10;
      }
      if (len > MAX_FRAME || !masked) {
        this.close();
        return;
      }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) {
        this.close();
        return;
      }
      if (op === 0x9) {
        this.sendFrame(0xA, payload);
        continue;
      }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        this.frags.push(payload);
        const total = this.frags.reduce((a, f) => a + f.length, 0);
        if (total > MAX_FRAME) {
          this.close();
          return;
        }
        if (fin) {
          const msg = Buffer.concat(this.frags).toString('utf8');
          this.frags = [];
          this.onMessage(this, msg);
        }
      }
    }
  }

  sendFrame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | op, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | op;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | op;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  send(obj) {
    if (!this.open) return;
    if (this.socket.writableLength > 8 * 1024 * 1024) return;
    this.sendFrame(0x1, Buffer.from(JSON.stringify(obj)));
  }

  // Game snapshots replace each other, so an old one still waiting to go out is not worth adding to.
  sendSnap(obj) {
    if (!this.open) return false;
    if (this.socket.writableLength > SNAP_BUFFER) return false;
    const buf = Buffer.from(JSON.stringify(obj));
    this.sendFrame(0x1, buf);
    return buf.length;
  }

  close() {
    if (this.open) {
      try {
        this.sendFrame(0x8, Buffer.alloc(0));
        this.socket.end();
      } catch (e) {
        this.socket.destroy();
      }
    }
    this.closed();
  }
}

const clients = new Set();
let sim = null;
let mapData = null;
let state = 'lobby';
let lobbyTimer = AUTOSTART;
let roomTick = 0;
let endTimer = 0;
let matchNo = 0;
let nextCid = 1;
let hostCid = 0;
const room = { bots: DEFAULT_BOTS, diff: DIFFICULTY, mode: MODE };
const stats = { bytes: 0, snaps: 0, skipped: 0, tickMs: 0, ticks: 0 };

function joined() {
  return [...clients].filter(c => c.joined).sort((a, b) => a.cid - b.cid);
}

function ensureHost() {
  const list = joined();
  if (!list.some(c => c.cid === hostCid)) hostCid = list.length ? list[0].cid : 0;
}

// Bots for the next match: at least one if only one person is in the room, and never past the cap.
function matchBots() {
  const humans = joined().length;
  return Math.max(humans >= 2 ? 0 : 1, Math.min(room.bots, MAX_TOTAL - humans));
}

function roomInfo(c) {
  return {
    t: 'room',
    you: c.cid,
    host: hostCid,
    state,
    players: joined().map(h => ({ cid: h.cid, name: h.name, char: h.char, lv: h.lo ? h.lo.level : 1, team: h.team || 0, spec: state === 'playing' && h.spectator ? 1 : 0 })),
    bots: room.bots,
    effBots: matchBots(),
    diff: room.diff,
    mode: room.mode,
    max: MAX_TOTAL,
    tl: AUTOSTART ? Math.max(0, lobbyTimer) : -1,
    match: matchNo
  };
}

function broadcastRoom() {
  for (const c of clients) if (c.joined) c.send(roomInfo(c));
}

function startMatch() {
  const humans = joined();
  if (!humans.length) return;
  matchNo++;
  // Bots play at the people's average character level.
  const avgLevel = humans.reduce((a, c) => a + (c.lo ? c.lo.level : 1), 0) / humans.length;
  sim = new Sim({ difficulty: room.diff, teamMode: room.mode, botLevel: avgLevel });
  for (const c of humans) {
    c.pid = sim.addPlayer(c.name, false, Object.assign({ char: c.char, team: room.mode === 'teams' ? c.team || 0 : 0 }, c.lo));
    sim.setAspect(c.pid, c.aspect);
    c.spec = 0;
    c.spectator = false;
  }
  sim.fillBots(humans.length + matchBots());
  sim.setupTeams();
  // Everyone starts with the same math problem; bots wait until the last person has solved it.
  sim.startQuiz((Math.random() * 4294967296) >>> 0);
  mapData = sim.getMapData();
  for (const c of humans) c.send({ t: 'welcome', id: c.pid, map: mapData, match: matchNo });
  state = 'playing';
  endTimer = 0;
  broadcastRoom();
  console.log('Match ' + matchNo + ' started: ' + humans.length + ' player(s), ' + (sim.players.length - humans.length) + ' bot(s), difficulty ' + room.diff + ', mode ' + room.mode);
}

function lateJoin(c) {
  if (sim.time < 40) {
    c.pid = sim.addPlayer(c.name, false, Object.assign({ char: c.char, team: room.mode === 'teams' ? c.team || 0 : 0 }, c.lo));
    sim.joinTeam(sim.playerMap.get(c.pid));
    sim.giveQuiz(sim.playerMap.get(c.pid));
    sim.setAspect(c.pid, c.aspect);
    c.spectator = false;
  } else {
    const alive = sim.players.filter(p => p.alive);
    c.pid = alive.length ? alive[0].id : sim.players[0].id;
    c.spectator = true;
  }
  c.spec = 0;
  c.send({ t: 'welcome', id: c.pid, map: mapData, match: matchNo, spectator: c.spectator });
}

function aliveIds() {
  return sim.players.filter(p => p.alive).map(p => p.id);
}

function nextAlive(after) {
  const ids = aliveIds();
  if (!ids.length) return 0;
  const i = ids.indexOf(after);
  return ids[(i + 1) % ids.length];
}

function backToLobby(reason) {
  state = 'lobby';
  lobbyTimer = AUTOSTART;
  for (const c of clients) {
    c.pid = 0;
    c.spec = 0;
    c.spectator = false;
  }
  console.log(reason);
  broadcastRoom();
}

function onMessage(c, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join' && !c.joined) {
    c.joined = true;
    c.cid = nextCid++;
    c.name = String(m.name || 'Player').slice(0, 16);
    c.char = D.CHARS[m.char] ? m.char : 'yunwang';
    c.lo = D.validLoadout(c.char, m.level, m.gadget, m.perk);
    c.aspect = Number(m.aspect) || 1.7;
    ensureHost();
    console.log('Player joined: ' + c.name + ' (' + c.addr + ')' + (c.cid === hostCid ? ' [host]' : ''));
    if (state === 'playing') lateJoin(c);
    broadcastRoom();
    return;
  }
  if (!c.joined) return;
  if (m.t === 'cfg') {
    if (c.cid !== hostCid || state !== 'lobby') return;
    const bots = Math.floor(Number(m.bots));
    if (Number.isFinite(bots)) room.bots = Math.max(0, Math.min(MAX_TOTAL - 1, bots));
    const lv = D.diffLevel(m.diff);
    if (lv) room.diff = lv;
    if (D.TEAM_MODES.indexOf(m.mode) >= 0) room.mode = m.mode;
    broadcastRoom();
    return;
  }
  if (m.t === 'start') {
    if (c.cid === hostCid && state === 'lobby') startMatch();
    return;
  }
  if (m.t === 'team') {
    const team = Number(m.team);
    if (state !== 'lobby' || [0, 1, 2].indexOf(team) < 0) return;
    c.team = team;
    broadcastRoom();
    return;
  }
  if (m.t === 'char') {
    if (state !== 'lobby' || !D.CHARS[m.char]) return;
    c.char = m.char;
    c.lo = D.validLoadout(c.char, m.level, m.gadget, m.perk);
    broadcastRoom();
    return;
  }
  if (!sim || !c.pid || state !== 'playing') return;
  if (m.t === 'in') {
    if (c.spectator) return;
    sim.setInput(c.pid, m.i);
    if (Array.isArray(m.a)) {
      for (const a of m.a.slice(0, 10)) sim.pushAction(c.pid, a);
    }
  } else if (m.t === 'aspect') {
    c.aspect = Number(m.a) || 1.7;
    if (!c.spectator) sim.setAspect(c.pid, c.aspect);
  } else if (m.t === 'spec') {
    const id = Number(m.id);
    if (sim.playerMap.has(id) && sim.playerMap.get(id).alive) {
      if (c.spectator) c.pid = id;
      else c.spec = id;
    }
  } else if (m.t === 'specnext') {
    if (c.spectator) c.pid = nextAlive(c.pid) || c.pid;
    else c.spec = nextAlive(c.spec || c.pid);
  }
}

function onClose(c) {
  if (!clients.has(c)) return;
  clients.delete(c);
  if (!c.joined) return;
  console.log('Player left: ' + c.name);
  if (sim && c.pid && !c.spectator && state === 'playing') sim.removePlayer(c.pid);
  ensureHost();
  broadcastRoom();
}

function tick() {
  const dt = 1 / D.TICK_RATE;
  roomTick += dt;
  if (state === 'lobby') {
    const n = joined().length;
    if (AUTOSTART && n > 0) {
      lobbyTimer -= dt;
      if (lobbyTimer <= 0) {
        startMatch();
        return;
      }
    } else {
      lobbyTimer = AUTOSTART;
    }
    if (roomTick >= 1) {
      roomTick = 0;
      broadcastRoom();
    }
    return;
  }
  const t0 = process.hrtime.bigint();
  sim.step(dt);
  for (const c of clients) {
    if (!c.joined || !c.pid) continue;
    if (c.spectator) {
      const p = sim.playerMap.get(c.pid);
      if (!p || !p.alive) c.pid = nextAlive(c.pid) || c.pid;
    } else if (c.spec) {
      const p = sim.playerMap.get(c.spec);
      if (!p || !p.alive) c.spec = nextAlive(c.spec) || 0;
    }
    const snap = sim.snapshotFor(c.pid, c.spec);
    if (!snap) continue;
    if (c.spectator) snap.spec = 1;
    const n = c.sendSnap({ t: 's', s: snap });
    if (n) {
      stats.bytes += n;
      stats.snaps++;
    } else {
      stats.skipped++;
    }
  }
  stats.tickMs += Number(process.hrtime.bigint() - t0) / 1e6;
  stats.ticks++;
  if (STATS && stats.ticks >= D.TICK_RATE * 10) {
    console.log('[stats] ' + joined().length + ' people, ' + sim.players.filter(p => p.alive).length + ' alive: ' + (stats.tickMs / stats.ticks).toFixed(2) + ' ms per tick, ' + (stats.bytes / 10 / 1024).toFixed(0) + ' KB/s sent, ' + (stats.snaps ? (stats.bytes / stats.snaps / 1024).toFixed(1) : 0) + ' KB per snapshot, ' + stats.skipped + ' skipped');
    stats.bytes = 0;
    stats.snaps = 0;
    stats.skipped = 0;
    stats.tickMs = 0;
    stats.ticks = 0;
  }
  if (sim.state === 'ended') {
    endTimer += dt;
    if (endTimer > 8) backToLobby('Match ' + matchNo + ' finished. Winner: ' + (sim.winner ? sim.winner.name || sim.winner.char : 'none'));
  } else if (joined().length === 0) {
    backToLobby('All players left; match ' + matchNo + ' stopped.');
  }
}

const server = http.createServer(serveFile);
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (upgrade !== 'websocket' || !key || req.url !== '/ws' || clients.size >= MAX_CLIENTS) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const c = new WsConn(socket, onMessage, onClose);
  c.addr = socket.remoteAddress;
  c.joined = false;
  c.cid = 0;
  c.pid = 0;
  c.spec = 0;
  c.spectator = false;
  clients.add(c);
});

server.listen(PORT, HOST, () => {
  console.log(D.TITLE + ' ' + D.TITLE_EN + '：區網伺服器已啟動 / LAN server running');
  console.log('  本機 This computer:  http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) console.log('  朋友 Friends:        http://' + n.address + ':' + PORT + '  （遊戲內輸入 / in the game: ' + n.address + ':' + PORT + '）');
    }
  }
  console.log('第一位加入的人是房主 / The first to join is the host. Ctrl+C 結束 / to stop.');
});

setInterval(tick, 1000 / D.TICK_RATE);
