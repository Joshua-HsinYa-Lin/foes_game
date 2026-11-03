(function () {
  'use strict';
  const D = globalThis.PF_DATA;
  const SIM = globalThis.PF_SIM;
  const Sound = globalThis.PF_Sound;
  const $ = id => document.getElementById(id);

  const canvas = $('game');
  const renderer = new globalThis.PF_Renderer(canvas);

  const store = {
    get(k, d) {
      try {
        const v = window.localStorage.getItem('pinefall.' + k);
        return v == null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        window.localStorage.setItem('pinefall.' + k, String(v));
      } catch (e) {
        return;
      }
    }
  };

  const ui = { killfeed: [], notices: [], pickups: [], bigMap: false, mouseX: null, mouseY: null, aim: null, noHud: false };
  const keys = new Set();
  let mouseDown = false;
  let lastAim = 0;
  let pendingActions = [];
  let session = null;
  let demo = null;
  let mapKey = '';
  let sessionSeq = 0;
  let lastWheel = 0;
  let gameOver = { shown: false, deathAt: 0, startAt: 0, spectating: false };
  let lastOpts = null;

  function weaponName(w) {
    if (D.WEAPONS[w]) return D.WEAPONS[w].name;
    if (D.MELEE[w]) return D.MELEE[w].name;
    if (w === 'frag') return 'a grenade';
    if (w === 'barrel') return 'an exploding barrel';
    if (w === 'explosion') return 'an explosion';
    if (w === 'vehicle') return 'a vehicle';
    return w || '';
  }

  // ---------- sessions ----------

  class OfflineSession {
    constructor(o) {
      this.kind = 'offline';
      this.id = ++sessionSeq;
      this.demo = !!o.demo;
      this.opts = o;
      this.sim = new SIM.Sim({ difficulty: o.difficulty });
      if (this.demo) {
        this.sim.fillBots(o.bots);
        this.myId = this.sim.players[0].id;
      } else {
        this.myId = this.sim.addPlayer(o.name, false, o.skin);
        this.sim.fillBots(o.bots + 1);
      }
      this.map = this.sim.getMapData();
      this.mapVersion = 1;
      this.spec = 0;
      this.paused = false;
      this.events = [];
      this.endT = 0;
      this.sim.setAspect(this.myId, window.innerWidth / window.innerHeight);
    }

    update(dt, input, actions) {
      if (this.paused) return;
      const sim = this.sim;
      if (!this.demo) {
        sim.setInput(this.myId, input);
        for (const a of actions) sim.pushAction(this.myId, a);
      }
      let rem = Math.min(dt, 0.1);
      while (rem > 1e-6) {
        const st = Math.min(rem, 1 / 30);
        sim.step(st);
        rem -= st;
        const ev = sim.eventsFor(this.myId, this.spec);
        for (const e of ev) this.events.push(e);
      }
      if (this.demo) {
        const me = sim.playerMap.get(this.myId);
        if (!me.alive) {
          const alive = sim.players.filter(p => p.alive);
          if (alive.length) {
            this.myId = alive[Math.floor(Math.random() * alive.length)].id;
            sim.setAspect(this.myId, window.innerWidth / window.innerHeight);
          }
        }
        if (sim.state === 'ended') {
          if (!this.endT) this.endT = sim.time;
          if (sim.time - this.endT > 6) return 'restart';
        }
      }
      return null;
    }

    view() {
      const v = this.sim.snapshotFor(this.myId, this.spec);
      v.ev = this.events;
      this.events = [];
      return v;
    }

    setAspect(a) {
      this.sim.setAspect(this.myId, a);
    }

    spectate(id) {
      this.spec = id;
    }

    spectateNext() {
      const alive = this.sim.players.filter(p => p.alive);
      if (!alive.length) return;
      const idx = alive.findIndex(p => p.id === this.spec);
      this.spec = alive[(idx + 1) % alive.length].id;
    }

    destroy() {
      this.sim = null;
    }
  }

  function lerpSnap(a, b, f) {
    if (a === b) return Object.assign({}, b);
    const out = Object.assign({}, b);
    const list = (la, lb, angle) => {
      const m = new Map();
      for (const e of la) m.set(e.i, e);
      return lb.map(e => {
        const p = m.get(e.i);
        if (!p) return e;
        const o = Object.assign({}, e);
        o.x = p.x + (e.x - p.x) * f;
        o.y = p.y + (e.y - p.y) * f;
        if (angle) o.a = p.a + SIM.angleDiff(p.a, e.a) * f;
        return o;
      });
    };
    out.pl = list(a.pl, b.pl, true);
    out.ve = list(a.ve, b.ve, true);
    out.bu = list(a.bu, b.bu, false);
    out.gr = list(a.gr, b.gr, false);
    if (a.cam === b.cam) {
      out.cx = a.cx + (b.cx - a.cx) * f;
      out.cy = a.cy + (b.cy - a.cy) * f;
    }
    out.zo = Object.assign({}, b.zo, { x: a.zo.x + (b.zo.x - a.zo.x) * f, y: a.zo.y + (b.zo.y - a.zo.y) * f, r: a.zo.r + (b.zo.r - a.zo.r) * f });
    return out;
  }

  class OnlineSession {
    constructor(o, handlers) {
      this.kind = 'online';
      this.id = ++sessionSeq;
      this.opts = o;
      this.snaps = [];
      this.offset = null;
      this.map = null;
      this.mapVersion = 0;
      this.myId = 0;
      this.lastSend = 0;
      this.lobby = null;
      this.closed = false;
      this.handlers = handlers;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(proto + '//' + window.location.host + '/ws');
      this.ws.onopen = () => this.send({ t: 'join', name: o.name, skin: o.skin, aspect: window.innerWidth / window.innerHeight });
      this.ws.onmessage = m => {
        let msg;
        try {
          msg = JSON.parse(m.data);
        } catch (e) {
          return;
        }
        this.onMsg(msg);
      };
      this.ws.onclose = () => {
        this.closed = true;
        if (this.handlers.onClose) this.handlers.onClose(this);
      };
      this.ws.onerror = () => {};
    }

    send(o) {
      if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
    }

    onMsg(msg) {
      if (msg.t === 'welcome') {
        this.map = msg.map;
        for (const ob of this.map.obstacles) ob.dead = !!ob.dead;
        this.mapVersion++;
        this.myId = msg.id;
        this.snaps = [];
        this.offset = null;
        this.lobby = null;
        if (this.handlers.onWelcome) this.handlers.onWelcome(this);
      } else if (msg.t === 'lobby') {
        this.lobby = msg;
      } else if (msg.t === 's') {
        const s = msg.s;
        const now = performance.now() / 1000;
        const off = now - s.t;
        if (this.offset === null || off < this.offset || !this.snaps.length) this.offset = off;
        else this.offset += (off - this.offset) * 0.02;
        this.snaps.push(s);
        if (this.snaps.length > 60) this.snaps.shift();
      }
    }

    update(dt, input, actions) {
      const now = performance.now();
      if (actions.length || now - this.lastSend > 33) {
        this.send({ t: 'in', i: input, a: actions });
        this.lastSend = now;
      }
      return null;
    }

    view(nowMs) {
      const s = this.snaps;
      if (!s.length || this.offset === null) return null;
      const rt = nowMs / 1000 - this.offset - 0.075;
      while (s.length > 2 && s[1].t <= rt && s[0]._done) s.shift();
      let s0 = s[0];
      let s1 = s[0];
      let f = 0;
      if (rt >= s[s.length - 1].t) {
        s0 = s[s.length - 1];
        s1 = s0;
      } else {
        for (let k = s.length - 1; k > 0; k--) {
          if (s[k - 1].t <= rt) {
            s0 = s[k - 1];
            s1 = s[k];
            f = SIM.clamp((rt - s0.t) / Math.max(1e-6, s1.t - s0.t), 0, 1);
            break;
          }
        }
      }
      const ev = [];
      for (const sn of s) {
        if (!sn._done && sn.t <= rt) {
          sn._done = true;
          for (const e of sn.ev) ev.push(e);
        }
      }
      const v = lerpSnap(s0, s1, f);
      v.ev = ev;
      return v;
    }

    setAspect(a) {
      this.send({ t: 'aspect', a });
    }

    spectate(id) {
      this.send({ t: 'spec', id });
    }

    spectateNext() {
      this.send({ t: 'specnext' });
    }

    destroy() {
      this.handlers = {};
      try {
        this.ws.close();
      } catch (e) {
        return;
      }
    }
  }

  // ---------- screens ----------

  function show(id, on) {
    $(id).hidden = !on;
  }

  function startDemo() {
    if (demo) demo.destroy();
    demo = new OfflineSession({ demo: true, bots: 18, difficulty: 'normal' });
  }

  function resetUi() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ui.killfeed.length = 0;
    ui.notices.length = 0;
    ui.pickups.length = 0;
    ui.bigMap = false;
    pendingActions = [];
    gameOver = { shown: false, deathAt: 0, startAt: performance.now(), spectating: false };
    show('overlay', false);
    show('pause', false);
    show('specbar', false);
  }

  function menuOptions() {
    const name = $('name').value.trim().slice(0, 16) || 'Player';
    store.set('name', name);
    return { name, skin: currentSkin, bots: Number($('bots').value), difficulty: currentDiff };
  }

  function startSolo(opts) {
    Sound.init();
    if (session) session.destroy();
    if (demo) {
      demo.destroy();
      demo = null;
    }
    lastOpts = opts;
    resetUi();
    session = new OfflineSession(opts);
    show('menu', false);
    show('lobby', false);
    canvas.classList.add('playing');
  }

  function startOnline(opts) {
    Sound.init();
    if (session) session.destroy();
    lastOpts = opts;
    resetUi();
    session = new OnlineSession(opts, {
      onWelcome: () => {
        resetUi();
        show('lobby', false);
        if (demo) {
          demo.destroy();
          demo = null;
        }
      },
      onClose: s => {
        if (session !== s) return;
        session = null;
        backToMenu('Disconnected from the LAN server.');
      }
    });
    show('menu', false);
    show('lobby', true);
    $('lobbyText').textContent = 'Connecting to server...';
    canvas.classList.add('playing');
  }

  function backToMenu(note) {
    if (session) session.destroy();
    session = null;
    resetUi();
    show('lobby', false);
    show('menu', true);
    canvas.classList.remove('playing');
    $('menuNote').textContent = note || '';
    Sound.setEngine(false, 0);
    startDemo();
  }

  function togglePause() {
    if (!session) return;
    const open = $('pause').hidden;
    show('pause', open);
    if (session.kind === 'offline') session.paused = open;
    $('pauseTitle').textContent = session.kind === 'offline' ? 'Paused' : 'Menu';
    $('pauseQuit').textContent = session.kind === 'offline' ? 'Quit to Main Menu' : 'Leave Match';
    $('pauseSound').textContent = Sound.muted ? 'Sound: Off' : 'Sound: On';
  }

  function showGameOver(view, won) {
    const me = view.me;
    gameOver.shown = true;
    const survived = Math.round(((gameOver.deathAt || performance.now()) - gameOver.startAt) / 1000);
    $('ovTitle').textContent = won ? 'Victory - last one standing!' : 'You placed #' + me.plc;
    $('ovTitle').className = won ? 'win' : '';
    let sub = '';
    if (won) sub = 'You outlasted ' + (view.tot - 1) + ' other players.';
    else if (me.killer) sub = 'Eliminated by ' + me.killer + '.';
    $('ovSub').textContent = sub;
    const mm = Math.floor(survived / 60);
    const ss = survived % 60;
    $('ovStats').innerHTML = '';
    const stats = [['Kills', me.k], ['Damage dealt', me.dd], ['Time survived', mm + ':' + (ss < 10 ? '0' : '') + ss], ['Place of ' + view.tot, '#' + (won ? 1 : me.plc)]];
    for (const [k, v] of stats) {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = String(v);
      const sp = document.createElement('span');
      sp.textContent = k;
      d.appendChild(b);
      d.appendChild(sp);
      $('ovStats').appendChild(d);
    }
    $('ovSpectate').hidden = won || view.st === 'ended' || view.al === 0;
    $('ovAgain').textContent = session && session.kind === 'online' ? 'Next Match' : 'Play Again';
    show('overlay', true);
    show('specbar', false);
  }

  // ---------- events ----------

  function handleEvents(view, events) {
    const myId = view.you;
    const cx = view.cx;
    const cy = view.cy;
    for (const e of events) {
      renderer.onEvent(e, myId, cx, cy);
      const dx = e.x != null ? e.x - cx : 0;
      const dy = e.y != null ? e.y - cy : 0;
      const dist = Math.hypot(dx, dy);
      switch (e.e) {
        case 'shot':
          Sound.play('gun', { w: e.w, dist, dx });
          break;
        case 'hit':
          Sound.play(e.ty === 'p' ? 'hitPlayer' : e.ty === 'v' ? 'hitVeh' : 'hitObj', { dist, dx });
          break;
        case 'break':
          Sound.play('break', { dist, dx });
          break;
        case 'exp':
          Sound.play('explosion', { dist, dx });
          break;
        case 'swing':
          Sound.play('swing', { dist, dx });
          break;
        case 'reload':
          if (e.i === myId) Sound.play('reload');
          break;
        case 'heal':
          if (e.i === myId) Sound.play('heal');
          break;
        case 'throw':
          Sound.play('throw', { dist, dx });
          break;
        case 'crash':
          Sound.play('crash', { dist, dx });
          break;
        case 'pick':
          ui.pickups.push({ txt: e.txt, t: renderer.time });
          if (ui.pickups.length > 5) ui.pickups.shift();
          if (e.ok) Sound.play('pickup');
          else Sound.play('empty');
          break;
        case 'msg':
          ui.notices.push({ txt: e.txt, t: renderer.time, col: '#ffb3a8' });
          if (ui.notices.length > 3) ui.notices.shift();
          Sound.play('zone');
          break;
        case 'kill': {
          let txt;
          if (e.k) txt = e.k + ' eliminated ' + e.v + ' with ' + weaponName(e.w);
          else if (e.w === 'fog') txt = e.v + ' was lost in the red fog';
          else if (e.w === 'left') txt = e.v + ' left the match';
          else txt = e.v + ' was eliminated';
          ui.killfeed.push({ txt, t: renderer.time, mine: e.kid === myId || e.vid === myId });
          if (ui.killfeed.length > 6) ui.killfeed.shift();
          if (e.kid === myId && e.vid !== myId) {
            ui.notices.push({ txt: 'You eliminated ' + e.v, t: renderer.time, col: '#ffd75e' });
            Sound.play('kill');
          }
          break;
        }
      }
    }
  }

  // ---------- input ----------

  function buildInput() {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    const cx = renderer.W / 2;
    const cy = renderer.H / 2;
    let aim = lastAim;
    let aimDist = 300;
    if (ui.mouseX != null) {
      aim = Math.atan2(ui.mouseY - cy, ui.mouseX - cx);
      aimDist = Math.hypot(ui.mouseX - cx, ui.mouseY - cy) / (renderer.zoom || 1);
      lastAim = aim;
    }
    return { mx, my, aim, shoot: mouseDown && !ui.bigMap, aimDist, brake: keys.has('Space') };
  }

  function act(a) {
    if (!session) return;
    pendingActions.push(a);
  }

  function inGame() {
    return session && $('menu').hidden && $('pause').hidden;
  }

  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      if (e.code === 'Enter' && !$('menu').hidden) $('playSolo').click();
      return;
    }
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (e.code === 'Escape') {
      if (session && $('overlay').hidden) togglePause();
      return;
    }
    if (!inGame()) return;
    if (e.repeat && e.code !== 'KeyW' && e.code !== 'KeyA' && e.code !== 'KeyS' && e.code !== 'KeyD') return;
    keys.add(e.code);
    switch (e.code) {
      case 'Digit1':
        act({ a: 'slot', i: 0 });
        break;
      case 'Digit2':
        act({ a: 'slot', i: 1 });
        break;
      case 'Digit3':
        act({ a: 'slot', i: 2 });
        break;
      case 'Digit4':
      case 'KeyG':
        act({ a: 'slot', i: 3 });
        break;
      case 'KeyQ':
        act({ a: 'swap' });
        break;
      case 'KeyR':
        act({ a: 'reload' });
        break;
      case 'KeyF':
      case 'KeyE':
        act({ a: 'interact' });
        break;
      case 'Digit5':
        act({ a: 'use', item: 'bandage' });
        break;
      case 'Digit6':
        act({ a: 'use', item: 'medkit' });
        break;
      case 'Digit7':
        act({ a: 'use', item: 'soda' });
        break;
      case 'KeyH':
        act({ a: 'autoheal' });
        break;
      case 'KeyV':
        act({ a: 'scope', i: 1 });
        break;
      case 'KeyX':
        act({ a: 'cancel' });
        break;
      case 'KeyM':
        ui.bigMap = !ui.bigMap;
        break;
    }
  });

  window.addEventListener('keyup', e => {
    keys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });

  canvas.addEventListener('mousemove', e => {
    ui.mouseX = e.clientX;
    ui.mouseY = e.clientY;
  });

  canvas.addEventListener('mousedown', e => {
    Sound.init();
    if (e.button === 0) mouseDown = true;
    if (gameOver.spectating && session) session.spectateNext();
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 0) mouseDown = false;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!inGame()) return;
    const now = performance.now();
    if (now - lastWheel < 90) return;
    lastWheel = now;
    act({ a: 'cycle', i: e.deltaY > 0 ? 1 : -1 });
  }, { passive: false });

  window.addEventListener('resize', () => {
    renderer.resize();
    const a = window.innerWidth / window.innerHeight;
    if (session) session.setAspect(a);
    if (demo) demo.setAspect(a);
  });

  // ---------- menu wiring ----------

  let currentSkin = SIM.clamp(Number(store.get('skin', 1)) || 0, 0, D.SKINS.length - 1);
  let currentDiff = store.get('diff', 'normal');
  if (!D.BOT_SKILL[currentDiff]) currentDiff = 'normal';
  $('name').value = store.get('name', '');
  const botsSaved = Number(store.get('bots', 29));
  $('bots').value = String(SIM.clamp(botsSaved || 29, 1, 49));
  $('botsv').textContent = $('bots').value;
  $('bots').addEventListener('input', () => {
    $('botsv').textContent = $('bots').value;
    store.set('bots', $('bots').value);
  });
  D.SKINS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'skin' + (i === currentSkin ? ' on' : '');
    b.style.background = c;
    b.title = 'Skin ' + (i + 1);
    b.addEventListener('click', () => {
      currentSkin = i;
      store.set('skin', i);
      for (const el of document.querySelectorAll('.skin')) el.classList.remove('on');
      b.classList.add('on');
    });
    $('skins').appendChild(b);
  });
  for (const b of document.querySelectorAll('#diff button')) {
    if (b.dataset.v === currentDiff) b.classList.add('on');
    else b.classList.remove('on');
    b.addEventListener('click', () => {
      currentDiff = b.dataset.v;
      store.set('diff', currentDiff);
      for (const el of document.querySelectorAll('#diff button')) el.classList.remove('on');
      b.classList.add('on');
    });
  }
  $('playSolo').addEventListener('click', () => startSolo(menuOptions()));
  const served = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (served && window.PINEFALL_SERVER !== false) {
    $('playLan').hidden = false;
    $('lanNote').textContent = 'Friends on the same network can open ' + window.location.host + ' in their browser and press Join LAN Match.';
  } else {
    $('lanNote').textContent = 'For LAN multiplayer, run "node server.js" and open the address it prints.';
  }
  $('playLan').addEventListener('click', () => startOnline(menuOptions()));
  $('ovAgain').addEventListener('click', () => {
    if (!session) return;
    if (session.kind === 'offline') {
      startSolo(lastOpts);
    } else {
      show('overlay', false);
      show('specbar', false);
      show('lobby', true);
      $('lobbyText').textContent = 'Waiting for the next match...';
      gameOver.spectating = false;
    }
  });
  $('ovMenu').addEventListener('click', () => backToMenu(''));
  $('ovSpectate').addEventListener('click', () => {
    if (!session || !lastView) return;
    const k = lastView.me.killerId;
    const killerAlive = k && lastView.pl.some(p => p.i === k && !p.d);
    if (killerAlive) session.spectate(k);
    else session.spectateNext();
    gameOver.spectating = true;
    show('overlay', false);
    show('specbar', true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  $('specNext').addEventListener('click', () => session && session.spectateNext());
  $('specAgain').addEventListener('click', () => $('ovAgain').click());
  $('specMenu').addEventListener('click', () => backToMenu(''));
  $('pauseResume').addEventListener('click', () => {
    togglePause();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  $('pauseQuit').addEventListener('click', () => backToMenu(''));
  $('pauseSound').addEventListener('click', () => {
    Sound.setMuted(!Sound.muted);
    store.set('muted', Sound.muted ? 1 : 0);
    $('pauseSound').textContent = Sound.muted ? 'Sound: Off' : 'Sound: On';
  });
  $('lobbyLeave').addEventListener('click', () => backToMenu(''));
  Sound.setMuted(store.get('muted', '0') === '1');

  // ---------- main loop ----------

  let lastView = null;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const active = session || demo;
    if (active) {
      const isDemo = !session;
      const input = buildInput();
      const actions = pendingActions;
      pendingActions = [];
      const res = active.update(dt, input, isDemo ? [] : actions);
      if (res === 'restart' && isDemo) startDemo();
      const cur = session || demo;
      const view = cur.map ? cur.view(now) : null;
      if (cur.map) {
        const key = cur.id + ':' + cur.mapVersion;
        if (key !== mapKey) {
          renderer.setMap(cur.map);
          mapKey = key;
        }
      }
      if (view) {
        for (const ob of view.ob) {
          const o = cur.map.obstacles[ob[0]];
          if (o) {
            o.hp = ob[1];
            o.dead = ob[1] <= 0;
          }
        }
        if (view.cam !== view.you) {
          const c = view.pl.find(p => p.i === view.cam);
          view.specName = c ? c.n : '';
        } else if (view.spec) {
          view.specName = view.me && view.pl.find(p => p.i === view.cam) ? view.pl.find(p => p.i === view.cam).n : '';
        }
        if (!isDemo) handleEvents(view, view.ev);
        ui.noHud = isDemo;
        ui.aim = !isDemo && view.me.alive && !view.me.veh ? input.aim : null;
        renderer.draw(view, ui, cur.paused ? 0 : dt);
        if (!isDemo) {
          afterFrame(view);
          lastView = view;
        }
      } else if (!isDemo) {
        const ctx = renderer.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#22331d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (session && session.kind === 'online' && session.lobby && !$('lobby').hidden) {
        const l = session.lobby;
        $('lobbyText').textContent = l.msg || ('Next match starts in ' + Math.ceil(l.tl) + 's - ' + l.n + ' player' + (l.n === 1 ? '' : 's') + ' connected');
      }
    }
    requestAnimationFrame(frame);
  }

  function afterFrame(view) {
    const me = view.me;
    if (me.veh) {
      const v = view.ve.find(q => q.d === view.you);
      Sound.setEngine(true, v ? Math.min(1, Math.abs(v.sp) / D.VEHICLES[v.t].max) : 0);
    } else {
      Sound.setEngine(false, 0);
    }
    if (view.spec) {
      show('specbar', false);
      if (!gameOver.shown) {
        $('lobbyBanner').hidden = false;
        $('lobbyBanner').textContent = 'Match in progress - you will join the next one. Spectating ' + (view.specName || '');
      }
      return;
    }
    $('lobbyBanner').hidden = true;
    if (!me.alive && !gameOver.deathAt) gameOver.deathAt = performance.now();
    const won = view.st === 'ended' && view.winId === view.you;
    if (!gameOver.shown) {
      if (won && renderer.time > 0) {
        if (!gameOver.wonAt) gameOver.wonAt = performance.now();
        if (performance.now() - gameOver.wonAt > 1200) showGameOver(view, true);
      } else if (!me.alive && performance.now() - gameOver.deathAt > 1400) {
        showGameOver(view, false);
      }
    } else if (gameOver.spectating && view.st === 'ended') {
      gameOver.spectating = false;
      showGameOver(view, false);
    }
    if (gameOver.spectating && view.cam !== view.you) {
      const c = view.pl.find(p => p.i === view.cam);
      if (c && c.d) session.spectateNext();
    }
  }

  if (/[?&]debug\b/.test(window.location.search)) {
    window.PF_DEBUG = {
      get session() {
        return session;
      },
      get view() {
        return lastView;
      }
    };
  }

  startDemo();
  requestAnimationFrame(frame);
})();
