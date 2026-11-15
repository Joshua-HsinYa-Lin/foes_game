(function () {
  'use strict';
  const D = globalThis.PF_DATA;
  const SIM = globalThis.PF_SIM;
  const I = globalThis.YW_I18N;
  const Sound = globalThis.PF_Sound;
  const Renderer = globalThis.PF_Renderer;
  const $ = id => document.getElementById(id);

  const canvas = $('game');
  const renderer = new Renderer(canvas);

  const store = {
    get(k, d) {
      try {
        const v = window.localStorage.getItem('yw.' + k);
        return v == null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        window.localStorage.setItem('yw.' + k, String(v));
      } catch (e) {
        return;
      }
    }
  };

  I.lang = store.get('lang', 'zh') === 'en' ? 'en' : 'zh';
  const prefs = {
    music: store.get('music', '1') === '1',
    sfx: store.get('sfx', '1') === '1',
    char: D.CHARS[store.get('char', 'yunwang')] ? store.get('char', 'yunwang') : 'yunwang',
    diff: D.diffLevel(store.get('diff', '')) || 2,
    bots: SIM.clamp(Number(store.get('bots', 13)) || 13, 1, 29),
    progress: SIM.clamp(Number(store.get('progress', 0)) || 0, 0, D.STORY.length),
    trial: store.get('trial', '0') === '1',
    view3d: store.get('view3d', '1') === '1'
  };
  Sound.initMusic(window.YW_MUSIC || { theme: 'assets/yunwang_theme.mp3', quiet: 'assets/quiet_room.mp3' });
  Sound.initSamples(window.YW_SFX || { win: 'assets/sfx/winner_music.mp3', kill: 'assets/sfx/kill_effect.mp3', dead: 'assets/sfx/dead_effect.mp3' });
  const SERVED = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  Sound.setMusic(prefs.music);
  Sound.setSfx(prefs.sfx);

  const ui = { killSfxAt: 0, killfeed: [], notices: [], pickups: [], bigMap: false, mouseX: null, mouseY: null, aim: null, noHud: false, tip: '' };
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
  let pickMode = 'story';
  let flow = null;
  let dlg = null;
  let lastView = null;
  const SECRET_IDS = ['notice', 'cat', 'gold', 'log', 'recipe', 'plane'];
  const NOTE_IDS = { notice: 1, log: 1, recipe: 1 };
  const found = new Set(String(store.get('secrets', '')).split(',').filter(k => SECRET_IDS.indexOf(k) >= 0));
  let noteAt = null;
  let sfx = {};

  function who(name, nk) {
    if (nk) {
      const [k, id] = nk.split(':');
      if (k === 'foe' && D.FOES[id]) return I.pick(D.FOES[id].name);
      if (k === 'char' && D.CHARS[id]) return I.pick(D.CHARS[id].name);
    }
    return name || '';
  }

  function causeName(w) {
    if (D.WEAPONS[w]) return I.pick(D.WEAPONS[w].name);
    const key = 'cause_' + w;
    const s = I.t(key);
    return s === key ? w : s;
  }

  // ---------- sessions ----------

  class OfflineSession {
    constructor(o) {
      this.kind = 'offline';
      this.id = ++sessionSeq;
      this.demo = !!o.demo;
      this.opts = o;
      if (o.mode === 'story') {
        this.sim = new SIM.Sim({ mode: 'story', chapter: o.chapter, difficulty: o.difficulty });
        this.myId = this.sim.startStory(o.name, o.char, { level: o.level, gadget: o.gadget, perk: o.perk });
      } else {
        this.sim = new SIM.Sim({ difficulty: o.difficulty, botLevel: o.level });
        if (this.demo) {
          this.sim.fillBots(o.bots);
          this.myId = this.sim.players[0].id;
        } else {
          this.myId = this.sim.addPlayer(o.name, false, { char: o.char, level: o.level, gadget: o.gadget, perk: o.perk });
          this.sim.fillBots(o.bots + 1);
        }
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
      if (this.paused) return null;
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
        for (const e of sim.eventsFor(this.myId, this.spec)) this.events.push(e);
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
    out.tu = list(a.tu || [], b.tu || [], false);
    out.bo = list(a.bo || [], b.bo || [], false);
    if (a.cam === b.cam) {
      out.cx = a.cx + (b.cx - a.cx) * f;
      out.cy = a.cy + (b.cy - a.cy) * f;
    }
    out.zo = Object.assign({}, b.zo, { r: a.zo.r + (b.zo.r - a.zo.r) * f });
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
      this.room = null;
      this.everRoom = false;
      this.addr = o.server || window.location.host;
      this.handlers = handlers;
      try {
        this.ws = new WebSocket(wsUrl(o.server));
      } catch (e) {
        this.ws = { readyState: 3, send() {}, close() {} };
        setTimeout(() => this.handlers.onClose && this.handlers.onClose(this), 0);
        return;
      }
      this.ws.onopen = () => this.send(Object.assign({ t: 'join', name: o.name, char: o.char, aspect: window.innerWidth / window.innerHeight }, loadoutOf(o.char)));
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
        if (this.handlers.onWelcome) this.handlers.onWelcome(this);
      } else if (msg.t === 'room') {
        const prev = this.room ? this.room.state : '';
        this.room = msg;
        this.everRoom = true;
        if (this.handlers.onRoom) this.handlers.onRoom(this, prev);
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

    configure(bots, diff, mode) {
      this.send({ t: 'cfg', bots, diff, mode });
    }

    setTeam(team) {
      this.send({ t: 'team', team });
    }

    startMatch() {
      this.send({ t: 'start' });
    }

    setChar(char) {
      this.send(Object.assign({ t: 'char', char }, loadoutOf(char)));
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

  // Accepts "192.168.1.23", "192.168.1.23:8080" or a pasted http:// link; empty means the server that served this page.
  function wsUrl(addr) {
    if (!addr) return (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws';
    let a = addr.trim().replace(/^(https?|wss?):\/\//i, '').replace(/\/.*$/, '');
    if (!/:\d+$/.test(a)) a += ':8080';
    return 'ws://' + a + '/ws';
  }

  // ---------- screens ----------

  const SCREENS = ['title', 'heroes', 'chapters', 'dialogue', 'overlay', 'pause', 'lobby'];

  function show(id, on) {
    $(id).hidden = !on;
  }

  function onlyScreen(id) {
    for (const s of SCREENS) show(s, s === id);
  }

  function blurFocus() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function onOff(on) {
    return on ? I.t('on') : I.t('off');
  }

  function applyI18n() {
    document.documentElement.lang = I.lang === 'zh' ? 'zh-Hant' : 'en';
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = I.t(el.dataset.i18n);
    $('tMusic').textContent = '♪ ' + I.t('music') + ': ' + onOff(prefs.music);
    $('tSfx').textContent = '🔊 ' + I.t('sfx') + ': ' + onOff(prefs.sfx);
    $('pauseMusic').textContent = I.t('music') + ': ' + onOff(prefs.music);
    $('pauseSfx').textContent = I.t('sfx') + ': ' + onOff(prefs.sfx);
    markView();
    const served = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    $('lanNote').textContent = served ? I.t('lanNoteServed', window.location.host) : I.t('lanNoteLocal');
    $('server').placeholder = I.t('serverHint');
    $('diffHint').textContent = I.t('diffHint' + prefs.diff);
    renderSecrets();
    roomKey = '';
    if (!$('lobby').hidden) renderRoom();
    renderHeroCards();
    renderChapters();
  }

  // ---------- character levels and loadouts ----------

  function xpOf(id) {
    return Math.max(0, Number(store.get('xp.' + id, 0)) || 0);
  }

  function levelOf(id) {
    return prefs.trial ? D.LEVELS.max : D.levelForXp(xpOf(id));
  }

  function choiceOf(tbl, key, id) {
    const ids = Object.keys(tbl).filter(k => tbl[k].char === id);
    const saved = store.get(key + id, '');
    return ids.indexOf(saved) >= 0 ? saved : ids[0];
  }

  function loadoutOf(id) {
    const level = levelOf(id);
    return {
      level,
      gadget: level >= D.LEVELS.gadget ? choiceOf(D.GADGETS, 'gad.', id) : '',
      perk: level >= D.LEVELS.perk ? choiceOf(D.PERKS, 'perk.', id) : ''
    };
  }

  // Experience for the character just played. Returns what to show on the result screen.
  function awardXp(id, gain) {
    if (prefs.trial || !D.CHARS[id]) return '';
    const before = D.levelForXp(xpOf(id));
    const xp = xpOf(id) + gain;
    store.set('xp.' + id, xp);
    const after = D.levelForXp(xp);
    let txt = I.t('xpGain', I.pick(D.CHARS[id].name), gain);
    if (after > before) {
      txt += '  ' + I.t('levelUp', after);
      if (before < D.LEVELS.gadget && after >= D.LEVELS.gadget) txt += ' ' + I.t('unlockGadget');
      if (before < D.LEVELS.perk && after >= D.LEVELS.perk) txt += ' ' + I.t('unlockPerk');
      if (before < D.LEVELS.overdrive && after >= D.LEVELS.overdrive) txt += ' ' + I.t('unlockOd');
      Sound.play('rare');
    }
    if (after < D.LEVELS.max) txt += '  (' + I.t('xpToNext', D.xpForLevel(after + 1) - xp, after + 1) + ')';
    renderHeroCards();
    return txt;
  }

  function renderHeroCards() {
    const box = $('heroCards');
    box.innerHTML = '';
    for (const id of D.CHAR_IDS) {
      const C = D.CHARS[id];
      const b = document.createElement('button');
      b.className = 'hero-card' + (prefs.char === id ? ' on' : '');
      const cv = document.createElement('canvas');
      cv.width = 160;
      cv.height = 160;
      renderer.drawPortrait(cv.getContext('2d'), id, 0, 0, 160);
      const name = document.createElement('b');
      name.textContent = I.pick(C.name);
      const lv = document.createElement('span');
      lv.className = 'lv';
      lv.textContent = 'Lv ' + levelOf(id);
      b.appendChild(cv);
      b.appendChild(name);
      b.appendChild(lv);
      b.addEventListener('click', () => {
        prefs.char = id;
        store.set('char', id);
        Sound.play('click');
        renderHeroCards();
      });
      box.appendChild(b);
    }
    renderHeroInfo();
  }

  // The chosen character's details: level, experience, skills, and the gadget and perk choices.
  function renderHeroInfo() {
    const id = prefs.char;
    const C = D.CHARS[id];
    const box = $('heroInfo');
    box.innerHTML = '';
    const el = (tag, cls, txt) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    const level = levelOf(id);
    const head = el('div', 'hi-head');
    head.appendChild(el('b', '', I.pick(C.name)));
    head.appendChild(el('span', 'role', I.pick(C.role)));
    head.appendChild(el('span', 'lv', 'Lv ' + level + ' / ' + D.LEVELS.max));
    box.appendChild(head);
    const bar = el('div', 'xpbar');
    const xp = xpOf(id);
    const lo = D.xpForLevel(Math.min(level, D.LEVELS.max));
    const hi = D.xpForLevel(Math.min(level + 1, D.LEVELS.max));
    const fill = el('i');
    fill.style.width = (level >= D.LEVELS.max || prefs.trial ? 100 : Math.round(((xp - lo) / Math.max(1, hi - lo)) * 100)) + '%';
    bar.appendChild(fill);
    bar.appendChild(el('span', '', prefs.trial ? I.t('trialOn') : level >= D.LEVELS.max ? I.t('maxLevel') : I.t('xpBar', xp - lo, hi - lo, level + 1)));
    box.appendChild(bar);
    const row = (label, txt, cls) => {
      const r = el('div', 'hi-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('em', '', label + '｜'));
      r.appendChild(document.createTextNode(txt));
      box.appendChild(r);
    };
    row(I.t('passive'), I.pick(C.passive));
    row(I.t('skill'), I.pick(C.skillText));
    const pick = (tbl, key, need, label) => {
      const wrap = el('div', 'hi-pick');
      wrap.appendChild(el('span', 'hp-label', label + (level < need ? '  🔒 Lv ' + need : '')));
      const btns = el('div', 'seg');
      const chosen = choiceOf(tbl, key, id);
      for (const k of Object.keys(tbl).filter(q => tbl[q].char === id)) {
        const b = el('button', k === chosen && level >= need ? 'on' : '', I.pick(tbl[k].name));
        b.disabled = level < need;
        b.title = I.pick(tbl[k].text);
        b.addEventListener('click', () => {
          store.set(key + id, k);
          Sound.play('click');
          renderHeroInfo();
        });
        btns.appendChild(b);
      }
      wrap.appendChild(btns);
      wrap.appendChild(el('div', 'hp-text', I.pick(tbl[chosen].text)));
      box.appendChild(wrap);
    };
    pick(D.GADGETS, 'gad.', D.LEVELS.gadget, I.t('gadgetLabel'));
    pick(D.PERKS, 'perk.', D.LEVELS.perk, I.t('perkLabel'));
    const O = D.OVERDRIVE_SKILL[id];
    row(I.t('odLabel') + (level < D.LEVELS.overdrive ? '  🔒 Lv ' + D.LEVELS.overdrive : ''), I.pick(O.name) + (I.lang === 'zh' ? '：' : ': ') + I.pick(O.text) + (I.lang === 'zh' ? '。' : '. ') + I.t('odGeneral'), level < D.LEVELS.overdrive ? 'locked' : 'od');
    $('tTrial').textContent = I.t('trialToggle') + ': ' + onOff(prefs.trial);
  }


  function renderChapters() {
    const box = $('chapterList');
    box.innerHTML = '';
    D.STORY.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'chapter';
      const open = i <= prefs.progress;
      b.disabled = !open;
      const num = document.createElement('div');
      num.className = 'num';
      num.textContent = String(i + 1);
      const txt = document.createElement('div');
      txt.className = 'txt';
      const t = document.createElement('b');
      t.textContent = I.pick(I.STORY.titles[ch.id]);
      const s = document.createElement('span');
      s.textContent = I.pick(I.STORY.blurbs[ch.id]);
      txt.appendChild(t);
      txt.appendChild(s);
      const st = document.createElement('div');
      st.className = 'state' + (i < prefs.progress ? ' done' : '');
      st.textContent = i < prefs.progress ? '✔ ' + I.t('cleared') : open ? '' : '🔒 ' + I.t('locked');
      b.appendChild(num);
      b.appendChild(txt);
      b.appendChild(st);
      b.addEventListener('click', () => {
        Sound.play('click');
        startChapter(i);
      });
      box.appendChild(b);
    });
  }

  function heroOpts() {
    const name = $('name').value.trim().slice(0, 16) || I.pick(D.CHARS[prefs.char].name);
    store.set('name', $('name').value.trim().slice(0, 16));
    return Object.assign({ name, char: prefs.char, difficulty: prefs.diff, bots: prefs.bots }, loadoutOf(prefs.char));
  }

  function openHeroSelect(mode) {
    pickMode = mode;
    $('botsRow').hidden = mode !== 'royale';
    $('serverRow').hidden = !(mode === 'lan' && !SERVED);
    onlyScreen('heroes');
    renderHeroCards();
  }

  // ---------- dialogue ----------

  function playDialogue(lines, done) {
    if (!lines || !lines.length) {
      if (done) done();
      return;
    }
    dlg = { lines, i: 0, done, shown: 0, full: '' , timer: 0 };
    show('dialogue', true);
    Sound.duckMusic(0.6);
    renderLine();
  }

  function renderLine() {
    const L = dlg.lines[dlg.i];
    const speaker = L.who === 'narrator' || L.who === 'captain' ? I.pick(I.STORY.speakers[L.who]) : I.pick(D.CHARS[L.who].name);
    $('speaker').textContent = speaker;
    const pc = $('portrait').getContext('2d');
    pc.clearRect(0, 0, 240, 240);
    renderer.drawPortrait(pc, L.who, 10, 14, 220);
    dlg.full = L[I.lang] || L.en;
    dlg.shown = 0;
    $('line').textContent = '';
    Sound.play('blip');
    clearInterval(dlg.timer);
    dlg.timer = setInterval(() => {
      if (!dlg) return;
      dlg.shown = Math.min(dlg.full.length, dlg.shown + (I.lang === 'zh' ? 1 : 2));
      $('line').textContent = dlg.full.slice(0, dlg.shown);
      if (dlg.shown >= dlg.full.length) clearInterval(dlg.timer);
    }, 28);
  }

  function advanceDialogue() {
    if (!dlg) return;
    if (dlg.shown < dlg.full.length) {
      dlg.shown = dlg.full.length;
      $('line').textContent = dlg.full;
      clearInterval(dlg.timer);
      return;
    }
    dlg.i++;
    if (dlg.i >= dlg.lines.length) endDialogue();
    else renderLine();
  }

  function endDialogue() {
    if (!dlg) return;
    clearInterval(dlg.timer);
    const done = dlg.done;
    dlg = null;
    show('dialogue', false);
    Sound.duckMusic(1);
    blurFocus();
    if (done) done();
  }

  $('dialogue').addEventListener('click', e => {
    if (e.target.id === 'dlgSkip') return;
    advanceDialogue();
  });
  $('dlgSkip').addEventListener('click', () => endDialogue());

  // ---------- game flow ----------

  function startDemo() {
    if (demo) demo.destroy();
    demo = new OfflineSession({ demo: true, bots: 14, difficulty: 'normal' });
  }

  function resetUi() {
    $('ovXp').textContent = '';
    blurFocus();
    ui.killfeed.length = 0;
    ui.notices.length = 0;
    ui.pickups.length = 0;
    ui.bigMap = false;
    ui.tip = '';
    pendingActions = [];
    gameOver = { shown: false, deathAt: 0, startAt: performance.now(), spectating: false };
    show('overlay', false);
    show('pause', false);
    show('specbar', false);
    $('lobbyBanner').hidden = true;
    closeNote();
    sfx = {};
  }

  function startSolo(opts) {
    Sound.init();
    Sound.stopWinner();
    if (session) session.destroy();
    if (demo) {
      demo.destroy();
      demo = null;
    }
    lastOpts = opts;
    resetUi();
    session = new OfflineSession(opts);
    onlyScreen(null);
    canvas.classList.add('playing');
    if (opts.mode !== 'story') Sound.play('gong');
  }

  function startChapter(idx) {
    const ch = D.STORY[idx];
    const opts = Object.assign(heroOpts(), { mode: 'story', chapter: ch.id });
    flow = { idx, endAt: 0, handled: false, result: '' };
    startSolo(opts);
    session.paused = true;
    const lines = (idx === 0 ? I.STORY.prologue : []).concat(I.STORY[ch.id].intro);
    playDialogue(lines, () => {
      if (!session) return;
      session.paused = false;
      renderer.banner(I.pick(I.STORY.titles[ch.id]), '#ffd75e');
      Sound.play('gong');
      if (session.sim.players.some(p => p.kind === 'boss')) Sound.play('boss');
    });
  }

  function startOnline(opts) {
    Sound.init();
    if (session) session.destroy();
    lastOpts = opts;
    flow = null;
    resetUi();
    session = new OnlineSession(opts, {
      onWelcome: () => {
        Sound.stopWinner();
        resetUi();
        show('lobby', false);
        canvas.classList.add('playing');
        Sound.setMusicMode('playlist', true);
        Sound.play('gong');
        if (demo) {
          demo.destroy();
          demo = null;
        }
      },
      onRoom: (s, prev) => {
        if (session !== s) return;
        if (prev === 'playing' && s.room.state === 'lobby') {
          s.map = null;
          s.snaps = [];
          showLobby();
        }
        renderRoom();
      },
      onClose: s => {
        if (session !== s) return;
        session = null;
        backToMenu(s.everRoom ? I.t('disconnected') : I.t('connectFail', s.addr));
      }
    });
    showLobby();
  }

  function showLobby() {
    gameOver = { shown: false, deathAt: 0, startAt: performance.now(), spectating: false };
    $('lobbyBanner').hidden = true;
    show('specbar', false);
    onlyScreen('lobby');
    canvas.classList.remove('playing');
    Sound.setEngine(false, 0);
    Sound.setMusicMode('lobby');
    blurFocus();
    renderRoom();
  }

  let roomKey = '';
  let lastCfgSend = 0;

  function renderRoom() {
    if (!session || session.kind !== 'online') return;
    const r = session.room;
    $('lobbyShare').textContent = I.t('shareAddr', session.addr);
    if (!r) {
      $('lobbyText').textContent = I.t('connecting');
      $('roomPlayers').innerHTML = '';
      $('roomHost').hidden = true;
      $('roomStart').hidden = true;
      $('roomSummary').textContent = '';
      roomKey = '';
      return;
    }
    const isHost = r.you === r.host;
    let status = r.state === 'playing' ? I.t('matchRunning') : isHost ? I.t('youAreHost') : I.t('waitingHost');
    if (r.state === 'lobby' && r.tl >= 0) status += '  ' + I.t('autoStartIn', Math.ceil(r.tl));
    $('lobbyText').textContent = status;
    const key = JSON.stringify([r.players, r.host, r.you, I.lang]);
    if (key !== roomKey) {
      roomKey = key;
      const box = $('roomPlayers');
      box.innerHTML = '';
      for (const pl of r.players) {
        const d = document.createElement('div');
        d.className = 'room-player' + (r.mode === 'teams' && pl.team ? ' team' + pl.team : '');
        const cv = document.createElement('canvas');
        cv.width = 80;
        cv.height = 80;
        renderer.drawPortrait(cv.getContext('2d'), D.CHARS[pl.char] ? pl.char : 'yunwang', 0, 0, 80);
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = pl.name + (pl.lv ? '  Lv' + pl.lv : '');
        d.appendChild(cv);
        d.appendChild(nm);
        for (const [cond, txt, cls] of [[pl.cid === r.host, I.t('hostTag'), 'tag'], [pl.cid === r.you, I.t('youTag'), 'tag you']]) {
          if (!cond) continue;
          const t = document.createElement('span');
          t.className = cls;
          t.textContent = txt;
          d.appendChild(t);
        }
        box.appendChild(d);
      }
      const mine = r.players.find(pl => pl.cid === r.you);
      const chars = $('roomChars');
      chars.innerHTML = '';
      for (const id of D.CHAR_IDS) {
        const b = document.createElement('button');
        b.className = mine && mine.char === id ? 'on' : '';
        b.title = I.pick(D.CHARS[id].name);
        const cv = document.createElement('canvas');
        cv.width = 72;
        cv.height = 72;
        renderer.drawPortrait(cv.getContext('2d'), id, 0, 0, 72);
        b.appendChild(cv);
        b.disabled = r.state !== 'lobby';
        b.addEventListener('click', () => {
          prefs.char = id;
          store.set('char', id);
          Sound.play('click');
          if (session && session.kind === 'online') session.setChar(id);
        });
        chars.appendChild(b);
      }
    }
    $('roomHost').hidden = false;
    const slider = $('roomBots');
    slider.max = String(Math.max(0, r.max - r.players.length));
    slider.disabled = !isHost || r.state !== 'lobby';
    if (document.activeElement !== slider) slider.value = String(Math.min(r.bots, Number(slider.max)));
    $('roomBotsV').textContent = slider.value;
    for (const b of document.querySelectorAll('#roomDiff button')) {
      b.classList.toggle('on', Number(b.dataset.v) === r.diff);
      b.disabled = !isHost || r.state !== 'lobby';
    }
    $('roomDiff').classList.toggle('locked', !isHost);
    for (const b of document.querySelectorAll('#roomMode button')) {
      b.classList.toggle('on', b.dataset.v === r.mode);
      b.disabled = !isHost || r.state !== 'lobby';
    }
    $('roomMode').classList.toggle('locked', !isHost);
    $('roomModeHint').textContent = I.t('modeHint_' + r.mode);
    const mine = r.players.find(pl => pl.cid === r.you);
    $('roomTeamRow').hidden = r.mode !== 'teams';
    for (const b of document.querySelectorAll('#roomTeam button')) {
      b.classList.toggle('on', mine && Number(b.dataset.v) === (mine.team || 0));
      b.disabled = r.state !== 'lobby';
    }
    $('roomSummary').textContent = I.t('roomSummary', r.players.length, r.effBots, r.players.length + r.effBots) + '  ·  ' + I.t('diffNow', I.t('diff' + r.diff)) + '  ·  ' + I.t('mode_' + r.mode);
    $('roomStart').hidden = !isHost || r.state !== 'lobby';
  }

  function backToMenu(note) {
    Sound.stopWinner();
    if (session) session.destroy();
    session = null;
    flow = null;
    if (dlg) {
      clearInterval(dlg.timer);
      dlg = null;
    }
    resetUi();
    onlyScreen('title');
    canvas.classList.remove('playing');
    $('menuNote').textContent = note || '';
    Sound.setEngine(false, 0);
    Sound.duckMusic(1);
    renderChapters();
    Sound.setMusicMode('playlist');
    if (!demo) startDemo();
  }

  function togglePause() {
    if (!session || dlg) return;
    const open = $('pause').hidden;
    show('pause', open);
    if (session.kind === 'offline') session.paused = open;
    $('pauseTitle').textContent = session.kind === 'offline' ? I.t('paused') : I.t('menu');
    $('pauseQuit').textContent = session.kind === 'offline' ? I.t('quit') : I.t('leave');
    $('pauseDiffRow').hidden = session.kind !== 'offline';
    markDiff();
    applyI18n();
  }

  function statCells(rows) {
    $('ovStats').innerHTML = '';
    for (const [k, v] of rows) {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = String(v);
      const sp = document.createElement('span');
      sp.textContent = k;
      d.appendChild(b);
      d.appendChild(sp);
      $('ovStats').appendChild(d);
    }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function teamName(t) {
    return I.t('team_' + t);
  }

  function showGameOver(view, won) {
    const me = view.me;
    gameOver.shown = true;
    if (view.tmode && view.tmode !== 'ffa') {
      const coop = view.tmode === 'coop';
      const ended = view.st === 'ended';
      gameOver.final = ended;
      const survivedT = ((gameOver.deathAt || performance.now()) - gameOver.startAt) / 1000;
      $('ovTitle').textContent = won ? I.t(coop ? 'coopWin' : 'teamWin', teamName(me.tm)) : ended ? I.t(coop ? 'coopLose' : 'teamLose', teamName(me.tm)) : I.t('youDown');
      $('ovTitle').className = won ? 'win' : '';
      $('ovSub').textContent = !ended ? I.t('teamFighting', teamName(me.tm)) : won ? I.t(coop ? 'coopWinSub' : 'teamWinSub') : coop || !view.wt ? '' : I.t('teamWin', teamName(view.wt));
      statCells([[I.t('st_kills'), me.k], [I.t('st_damage'), me.dd], [I.t('st_time'), fmt(survivedT)], [I.t('yourTeam'), coop ? I.t('family') : teamName(me.tm)]]);
      if (ended && !gameOver.xpDone) {
        gameOver.xpDone = true;
        $('ovXp').textContent = awardXp(prefs.char, 25 + me.k * 15 + (won ? 60 : 15));
      }
      $('ovSpectate').hidden = ended || view.al === 0;
      $('ovAgain').textContent = session && session.kind === 'online' ? I.t('backToLobby') : I.t('playAgain');
      show('overlay', true);
      show('specbar', false);
      return;
    }
    const survived = ((gameOver.deathAt || performance.now()) - gameOver.startAt) / 1000;
    $('ovTitle').textContent = won ? I.t('victory') : I.t('placed', me.plc);
    $('ovTitle').className = won ? 'win' : '';
    $('ovSub').textContent = won ? I.t('outlasted', view.tot - 1) : me.killerNk === 'zone' ? I.t('zoneDeath') : me.killer || me.killerNk ? I.t('eliminatedBy', who(me.killer, me.killerNk)) : '';
    statCells([[I.t('st_kills'), me.k], [I.t('st_damage'), me.dd], [I.t('st_time'), fmt(survived)], [I.t('st_place', view.tot), '#' + (won ? 1 : me.plc)]]);
    if (!gameOver.xpDone) {
      gameOver.xpDone = true;
      $('ovXp').textContent = awardXp(prefs.char, 25 + me.k * 15 + (won ? 60 : me.plc <= 3 ? 30 : 0));
    }
    $('ovSpectate').hidden = won || view.st === 'ended' || view.al === 0;
    $('ovAgain').textContent = session && session.kind === 'online' ? I.t('backToLobby') : I.t('playAgain');
    show('overlay', true);
    show('specbar', false);
  }

  function showStoryResult(view) {
    const won = view.res === 'win';
    const last = flow.idx === D.STORY.length - 1;
    flow.result = view.res;
    $('ovTitle').textContent = won ? (last ? I.t('storyEnd') : I.t('chapterClear')) : I.t('chapterFail');
    $('ovTitle').className = won ? 'win' : '';
    $('ovSub').textContent = won ? I.pick(I.STORY.titles[D.STORY[flow.idx].id]) : view.why === 'time' ? I.t('fail_time') : I.t('fail_dead');
    statCells([[I.t('st_kills'), view.me.k], [I.t('st_damage'), view.me.dd], [I.t('st_time'), fmt(view.t)], [I.t('heroLabel'), I.pick(D.CHARS[prefs.char].name)]]);
    if (!flow.xpDone) {
      flow.xpDone = true;
      $('ovXp').textContent = awardXp(prefs.char, won ? 70 + view.me.k * 5 : 15);
    }
    $('ovSpectate').hidden = true;
    $('ovAgain').textContent = won ? (last ? I.t('replay') : I.t('next')) : I.t('retry');
    show('overlay', true);
  }

  // ---------- events ----------

  function pickText(e) {
    const a = e.a || [];
    switch (e.k) {
      case 'pick_soup':
        return I.t('pick_soup', a[0], a[1]);
      case 'pick_heal':
        return I.t('pick_heal', a[0]);
      case 'pick_item':
        return Renderer.itemName(a[0]);
      case 'drop':
        return I.t('drop', Renderer.itemName(a[0]));
      case 'driving':
        return I.t('driving', I.pick(D.VEHICLES[a[0]].name));
      default:
        return I.t(e.k);
    }
  }

  function handleEvents(view, events) {
    const myId = view.you;
    const cx = view.cx;
    const cy = view.cy;
    for (const e of events) {
      renderer.onEvent(e, myId, cx, cy);
      const dx = e.x != null ? e.x - cx : 0;
      const dy = e.y != null ? e.y - cy : 0;
      const dist = Math.hypot(dx, dy);
      const W = D.WEAPONS[e.w];
      switch (e.e) {
        case 'shot':
          if (e.w === 'chopsticks') Sound.play('throwChop', { dist, dx });
          else if (e.w === 'bowl') Sound.play('throwBowl', { dist, dx });
          else if (e.w === 'harpoon') Sound.play('harpoon', { dist, dx });
          else if (e.w === 'turret') Sound.play('turret', { dist, dx });
          else Sound.play('gun', { w: e.w, dist, dx });
          break;
        case 'hit':
          if (e.ty === 'p' && (e.w === 'pan' || e.w === 'wok')) Sound.play('bonk', { dist, dx });
          else if (e.ty === 'p' && (e.w === 'cleaver' || e.w === 'swordfish' || e.w === 'knife')) Sound.play('chop', { dist, dx });
          else if (e.ty === 'p' && e.w === 'rollingpin') Sound.play('thud', { dist, dx });
          else if (e.w === 'bowl') Sound.play('ceramic', { dist, dx });
          else if (e.ty === 'o' && e.k === 'plank') Sound.play('woodHit', { dist, dx });
          else Sound.play(e.ty === 'p' ? 'hitPlayer' : e.ty === 'v' ? 'hitVeh' : 'hitObj', { dist, dx });
          break;
        case 'break':
          Sound.play(e.k === 'plank' ? 'woodBreak' : 'break', { dist, dx });
          break;
        case 'collapse':
          Sound.play('collapse', { dist, dx });
          break;
        case 'exp':
          Sound.play('explosion', { dist, dx });
          break;
        case 'swing':
          Sound.play('swing', { dist, dx });
          break;
        case 'jump':
          Sound.play('jump', { dist, dx });
          break;
        case 'skill':
          if (e.s === 'flame') Sound.play('flame', { dist, dx });
          else if (e.s === 'rush') Sound.play('rush', { dist, dx });
          else if (e.s === 'turret') Sound.play('deploy', { dist, dx });
          else if (e.s === 'boba' && e.i === myId) Sound.play('boba');
          break;
        case 'got':
          if (e.i === myId && W && W.rare) {
            renderer.banner('★ ' + Renderer.itemName(e.t) + ' ★', W.legendary ? '#7fd3ff' : '#ffcf3a');
            Sound.play('rare');
          }
          break;
        case 'reload':
          if (e.i === myId) Sound.play('reload');
          break;
        case 'heal':
          if (e.i === myId) Sound.play('heal');
          break;
        case 'crash':
          Sound.play('crash', { dist, dx });
          break;
        case 'secret':
          onSecret(e.id);
          break;
        case 'meow':
          Sound.play('meow', { dist, dx });
          break;
        case 'land':
          Sound.play('landDrop', { dist, dx });
          break;
        case 'open':
          Sound.play('unlock', { dist, dx });
          break;
        case 'pick':
          ui.pickups.push({ txt: pickText(e), t: renderer.time });
          if (ui.pickups.length > 5) ui.pickups.shift();
          Sound.play(e.k === 'drop' ? 'drop' : e.ok ? 'pickup' : 'empty');
          break;
        case 'streak':
          renderer.banner(I.t(e.n >= 4 ? 'streak4' : e.n === 3 ? 'streak3' : 'streak2'), '#ff8a5a');
          Sound.play('streak');
          break;
        case 'msg': {
          const txt = I.t(e.k, ...(e.a || []));
          ui.notices.push({ txt, t: renderer.time, col: e.k === 'msg_box' ? '#9fdcff' : e.k === 'msg_zone' ? '#ffb38a' : '#ffd75e' });
          if (ui.notices.length > 3) ui.notices.shift();
          Sound.play(e.k === 'msg_box' ? 'coldbox' : e.k === 'msg_wave' ? 'wave' : e.k === 'msg_boss' ? 'boss' : e.k === 'msg_plane' ? 'plane' : 'zone');
          break;
        }
        case 'kill': {
          let txt;
          const kn = who(e.k, e.knk);
          const vn = who(e.v, e.vnk);
          if (kn) txt = I.t('kill_by', kn, vn, causeName(e.w));
          else if (e.w === 'zone') txt = I.t('kill_zone', vn);
          else if (e.w === 'left') txt = I.t('kill_left', vn);
          else txt = I.t('kill_other', vn);
          ui.killfeed.push({ txt, t: renderer.time, mine: e.kid === myId || e.vid === myId });
          if (ui.killfeed.length > 6) ui.killfeed.shift();
          if (e.kid === myId && e.vid !== myId) ui.notices.push({ txt: I.t('youKilled', vn), t: renderer.time, col: '#ffd75e' });
          // Recorded effects for the player on screen (yourself, or whoever you are watching).
          if (e.kid && e.kid === view.cam && e.vid !== view.cam && performance.now() - ui.killSfxAt > 150) {
            ui.killSfxAt = performance.now();
            if (!Sound.sample('kill', 0.9)) Sound.play('kill');
          }
          if (e.vid && e.vid === view.cam) Sound.sample('dead', 0.9);
          break;
        }
      }
    }
  }

  function renderSecrets() {
    $('secretsSum').textContent = '✦ ' + I.t('secretsTitle', found.size, SECRET_IDS.length);
    const list = $('secretsList');
    list.innerHTML = '';
    for (const id of SECRET_IDS) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      const has = found.has(id);
      li.className = has ? 'found' : '';
      b.textContent = has ? '✔ ' + I.t('sec_' + id) : I.t('secretsHidden');
      li.appendChild(b);
      if (!has) li.appendChild(document.createTextNode('  ' + I.t('hint_' + id)));
      list.appendChild(li);
    }
  }

  function onSecret(id) {
    if (SECRET_IDS.indexOf(id) < 0) return;
    if (!found.has(id)) {
      found.add(id);
      store.set('secrets', Array.from(found).join(','));
      Sound.play('secret');
      ui.notices.push({ txt: I.t('secretFound', found.size, SECRET_IDS.length, I.t('sec_' + id)), t: renderer.time, col: '#ffe27a' });
      if (ui.notices.length > 3) ui.notices.shift();
      renderSecrets();
    }
    if (NOTE_IDS[id]) openNote(id);
    else renderer.banner(I.t('say_' + id), '#ffe27a');
  }

  function openNote(id) {
    $('noteTitle').textContent = I.t('note_' + id + '_t');
    $('noteBody').textContent = I.t('note_' + id + '_b');
    $('note').hidden = false;
    noteAt = lastView ? { x: lastView.me.x, y: lastView.me.y } : null;
    Sound.play('paper');
  }

  function closeNote() {
    if ($('note').hidden) return;
    $('note').hidden = true;
    noteAt = null;
  }

  // Sounds that follow from the player's own state: steps, bushes, landing, weapon switch,
  // vehicle doors, heartbeat at low health, the thaw zone and running out of stamina.
  function ownSounds(view, dt) {
    const me = view.me;
    const s = sfx;
    if (!me.alive || view.cam !== view.you || view.st !== 'playing') {
      s.x = null;
      return;
    }
    const mp = view.pl.find(p => p.i === view.you);
    if (s.x != null && mp && !me.veh) {
      const d = Math.hypot(me.x - s.x, me.y - s.y);
      if (d < 120) s.acc = (s.acc || 0) + d;
      if (mp.jz > 0) s.acc = 0;
      if (s.acc > 66) {
        s.acc = 0;
        s.alt = !s.alt;
        const fast = d / Math.max(dt, 1e-3) > D.SPEED * 1.2;
        Sound.play(mp.bu ? 'rustle' : 'step', { v: fast ? 0.1 : 0.065, alt: s.alt });
      }
    }
    s.x = me.x;
    s.y = me.y;
    if (mp) {
      if (s.bu === 0 && mp.bu) Sound.play('rustle');
      if (s.jz > 0 && !mp.jz) Sound.play('land');
      s.bu = mp.bu;
      s.jz = mp.jz;
    }
    if (s.act != null && me.act !== s.act && me.sl[me.act]) Sound.play('switch');
    s.act = me.act;
    if (me.veh) {
      const mv = view.ve.find(q => q.d === view.you);
      s.skT = (s.skT || 0) - dt;
      if (mv && mv.sl && s.skT <= 0) {
        Sound.play('skid');
        s.skT = 0.28;
      }
    }
    const inVeh = me.veh ? 1 : 0;
    if (s.veh != null && inVeh !== s.veh) Sound.play('door');
    s.veh = inVeh;
    const hpf = me.hp / me.mhp;
    if (hpf < 0.3) {
      s.beatT = (s.beatT || 0) - dt;
      if (s.beatT <= 0) {
        Sound.play('heartbeat');
        s.beatT = hpf < 0.15 ? 0.62 : 0.9;
      }
    } else {
      s.beatT = 0;
    }
    const zo = view.zo;
    if (zo.on && Math.hypot(me.x - zo.x, me.y - zo.y) > zo.r) {
      s.zT = (s.zT || 0) - dt;
      if (s.zT <= 0) {
        Sound.play('sizzle');
        s.zT = 0.45;
      }
    } else {
      s.zT = 0;
    }
    if (s.st > 0 && me.st <= 0) Sound.play('breath');
    s.st = me.st;
  }

  function tipFor(view) {
    if (view.chap !== 'ch1' || !view.obj || view.st !== 'playing') return '';
    const me = view.me;
    const t = touch.on ? '_t' : '';
    if (view.t < 6) return I.t('tip_move' + t);
    if (!me.sl.some(s => s && D.WEAPONS[s.t])) return I.t('tip_pick' + t);
    if (view.obj.cur === 0) return I.t('tip_attack' + t);
    if (me.su === 0) return I.t('tip_skill' + t);
    if (me.so > 0 && me.hp < me.mhp * 0.8) return I.t('tip_heal' + t);
    return I.t('tip_crate' + t);
  }

  // ---------- input ----------

  function buildInput() {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (touch.on) return touchInput(mx, my);
    let aim = lastAim;
    if (ui.mouseX != null) {
      aim = renderer.aimAt(ui.mouseX, ui.mouseY);
      lastAim = aim;
    }
    const ad = ui.mouseX != null ? renderer.aimDist(ui.mouseX, ui.mouseY) : 380;
    ui.lastAd = ad;
    return { mx, my, aim, ad, shoot: mouseDown && !ui.bigMap, sprint: keys.has('Space'), brake: keys.has('Space') };
  }

  function act(a) {
    if (session) pendingActions.push(a);
  }

  function inGame() {
    return session && !dlg && $('pause').hidden && $('overlay').hidden;
  }

  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') {
      if (e.code === 'Enter' && !$('heroes').hidden) $('heroGo').click();
      return;
    }
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (dlg) {
      if (e.code === 'Space' || e.code === 'Enter') advanceDialogue();
      if (e.code === 'Escape') endDialogue();
      return;
    }
    if (!$('note').hidden && (e.code === 'Escape' || e.code === 'KeyF' || e.code === 'KeyE')) {
      closeNote();
      return;
    }
    if (e.code === 'Escape') {
      if (session && $('overlay').hidden && $('lobby').hidden) togglePause();
      return;
    }
    if (!inGame()) return;
    keys.add(e.code);
    if (e.repeat) return;
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
        act({ a: 'slot', i: 3 });
        break;
      case 'KeyH':
        act({ a: 'heal' });
        break;
      case 'KeyQ':
        act({ a: 'cycle', i: 1 });
        break;
      case 'KeyR':
        act({ a: 'reload' });
        break;
      case 'KeyF':
      case 'KeyE':
        act({ a: 'interact' });
        break;
      case 'KeyC':
        act({ a: 'drop' });
        break;
      case 'KeyX':
        castSkill(lastAim, ui.lastAd || 380);
        break;
      case 'KeyG':
        act({ a: 'gadget' });
        break;
      case 'KeyV':
        act({ a: 'overdrive' });
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        act({ a: 'jump' });
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

  document.addEventListener('pointerdown', () => Sound.init(), { once: false });

  canvas.addEventListener('mousemove', e => {
    ui.mouseX = e.clientX;
    ui.mouseY = e.clientY;
  });

  canvas.addEventListener('mousedown', e => {
    if (touch.on && performance.now() - touch.last < 1000) return;
    Sound.init();
    if (e.button === 0) mouseDown = true;
    if (e.button === 2 && inGame()) ui.skillAim = true;
    if (gameOver.spectating && session && e.button === 0) session.spectateNext();
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2 && ui.skillAim) {
      ui.skillAim = false;
      if (inGame() && ui.mouseX != null) castSkill(renderer.aimAt(ui.mouseX, ui.mouseY), renderer.aimDist(ui.mouseX, ui.mouseY));
    }
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

  // ---------- touch controls ----------

  // Left half of the screen: a movement stick that appears under the thumb (pushed all the way, it runs).
  // Right half: an aim stick that attacks once dragged past a small dead zone, with aim pulled toward a
  // nearby enemy; a quick tap attacks once. Weapon slots (hold to drop), the skill circle, the soup pouch
  // and the minimap are tappable. Buttons on the right: use, reload, jump; pause at the top.
  const touch = { on: false, move: null, aim: null, skill: null, fireUntil: 0, fireAim: 0, fireAd: 380, last: 0, press: null, portraitOk: false, rotatePaused: false };
  const STICK_R = 56;
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function canFullscreen() {
    const el = document.documentElement;
    return !IOS && !!(el.requestFullscreen || el.webkitRequestFullscreen);
  }

  function setTouchMode(on) {
    if (touch.on === on) return;
    touch.on = on;
    ui.touch = on;
    document.body.classList.toggle('touch', on);
    $('tFull').hidden = !on || !canFullscreen();
    if (!on) {
      touch.move = null;
      touch.aim = null;
      touch.skill = null;
      $('touchUI').hidden = true;
    }
  }

  // Android: fullscreen and landscape lock once a game starts. iPhone browsers have no fullscreen for pages;
  // adding the game to the home screen gives the same effect there.
  function goFullscreen() {
    if (!touch.on || !canFullscreen() || document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      const lock = () => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      };
      if (p && p.then) p.then(lock).catch(() => {});
      else lock();
    } catch (e) {
      return;
    }
  }

  function inRect(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function hudTarget(x, y) {
    const h = renderer.hit;
    if (ui.bigMap || inRect(h.mini, x, y)) return { k: 'map' };
    if (inRect(h.od, x, y)) return { k: 'overdrive' };
    if (inRect(h.gadget, x, y)) return { k: 'gadget' };
    if (inRect(h.skill, x, y)) return { k: 'skill' };
    if (inRect(h.heal, x, y)) return { k: 'heal' };
    for (const sl of h.slots) if (inRect(sl, x, y)) return { k: 'slot', i: sl.i };
    return null;
  }

  // The stick's centre follows a thumb that slides past the rim, so it never feels stuck.
  function follow(st) {
    const dx = st.x - st.ox;
    const dy = st.y - st.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R * 1.3) {
      st.ox = st.x - (dx / len) * STICK_R * 1.3;
      st.oy = st.y - (dy / len) * STICK_R * 1.3;
    }
  }

  function stickVec(st) {
    if (!st) return null;
    const dx = st.x - st.ox;
    const dy = st.y - st.oy;
    const len = Math.hypot(dx, dy);
    return { dx, dy, len, k: Math.min(1, len / STICK_R) };
  }

  // Thumbs are less exact than a mouse: an attack within about 22 degrees of a visible enemy goes at that
  // enemy. A quick tap, which has no direction of its own, looks wider (about 60 degrees of where you face).
  // ---------- aiming ----------

  // A quick tap auto-aims: the nearest enemy you can see within reach and not behind a wall.
  function autoAim(range) {
    const v = lastView;
    if (!v || !v.me.alive) return null;
    const me = v.pl.find(p => p.i === v.you) || v.me;
    let best = null;
    let bd = range;
    for (const p of v.pl) {
      if (p.i === v.you || p.d || p.veh) continue;
      if (v.me.tm && p.tm === v.me.tm) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < 1 || d > bd + (p.r || 24) || (p.bu && d > 160)) continue;
      const a = Math.atan2(p.y - me.y, p.x - me.x);
      if (renderer.rayLength(me.x, me.y, a, d) < d - 30) continue;
      bd = d;
      best = { a, d };
    }
    return best;
  }

  function weaponNow() {
    const v = lastView;
    const s = v && v.me.sl[v.me.act];
    return D.WEAPONS[s ? s.t : 'fists'];
  }

  function weaponReach(W) {
    return W.melee ? D.PLAYER_R + W.range + 30 : W.range;
  }

  // How long a released touch attack keeps firing: one shot for slow weapons, a short burst for fast ones.
  function burstFor(W) {
    return W.melee || W.delay >= 0.2 ? 130 : 450;
  }

  function skillReach() {
    const v = lastView;
    const sk = v ? v.me.sk : '';
    return { parcel: 420, coins: 520, rush: 330, turret: 600, flame: 170, freeze: 200, bubble: 240 }[sk] || 0;
  }

  // Casts the skill toward an aim; a tap with no aim goes at the nearest enemy in the skill's reach.
  function castSkill(aim, ad) {
    if (aim == null) {
      const t = autoAim(skillReach());
      aim = t ? t.a : lastAim;
      ad = t ? t.d : ad;
    }
    lastAim = aim;
    act({ a: 'skill', aim, ad: ad || 380 });
  }

  // What the on-ground aim guide shows this frame, or null.
  function aimGuide(view) {
    const me = view.me;
    if (!session || !me.alive || me.veh || view.cam !== view.you || view.st !== 'playing' || ui.bigMap || !inGame()) return null;
    if (touch.on) {
      if (touch.skill) {
        const v = stickVec(touch.skill);
        const out = v.len >= 18;
        return { mode: 'skill', a: out ? renderer.screenDir(v.dx, v.dy) : lastAim, ad: 80 + Math.min(1, v.len / (STICK_R * 1.3)) * 340, cancel: !out && touch.skill.maxLen >= 18 };
      }
      if (touch.aim) {
        const v = stickVec(touch.aim);
        if (v.len > 10) return { mode: 'attack', a: renderer.screenDir(v.dx, v.dy), strong: true };
        return touch.aim.maxLen > 18 ? { mode: 'attack', a: lastAim, cancel: true } : null;
      }
      return null;
    }
    if (ui.mouseX == null) return null;
    const a = renderer.aimAt(ui.mouseX, ui.mouseY);
    if (ui.skillAim) return { mode: 'skill', a, ad: renderer.aimDist(ui.mouseX, ui.mouseY) };
    return { mode: 'attack', a, strong: mouseDown };
  }

  // Touch attack stick, as in mobile hero shooters: drag to aim (the guide shows where it goes), release
  // to fire; holding at the rim keeps firing; a quick tap auto-aims; dragging back to the middle cancels.
  function touchInput(kx, ky) {
    const now = performance.now();
    let mx = kx;
    let my = ky;
    let sprint = keys.has('Space');
    let shoot = false;
    let aim = lastAim;
    const mv = stickVec(touch.move);
    if (mv && mv.len > 6) {
      mx = (mv.dx / mv.len) * mv.k;
      my = (mv.dy / mv.len) * mv.k;
      sprint = mv.k >= 0.96;
    }
    const av = stickVec(touch.aim);
    if (av && av.len > 10) {
      aim = renderer.screenDir(av.dx, av.dy);
      if (av.k >= 0.85) {
        if (!touch.aim.rimAt) touch.aim.rimAt = now;
        if (now - touch.aim.rimAt > 350) shoot = true;
      } else {
        touch.aim.rimAt = 0;
      }
    } else if (!av && (mx || my) && now > touch.fireUntil) {
      aim = Math.atan2(my, mx);
    }
    if (now < touch.fireUntil) {
      shoot = true;
      if (!(av && av.len > 10)) aim = touch.fireAim;
    }
    lastAim = aim;
    // A full drag of the aim stick throws as far as possible.
    const ad = av ? 80 + Math.min(1, av.len / (STICK_R * 1.3)) * 340 : touch.fireAd || 380;
    ui.lastAd = ad;
    return { mx, my, aim, ad, shoot: shoot && !ui.bigMap, sprint, brake: false };
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    setTouchMode(true);
    touch.last = performance.now();
    if (!inGame()) {
      if (gameOver.spectating && session) session.spectateNext();
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    const hit = hudTarget(x, y);
    if (hit) {
      if (hit.k === 'map') ui.bigMap = !ui.bigMap;
      else if (hit.k === 'skill') {
        const r = renderer.hit.skill;
        touch.skill = { id: e.pointerId, ox: r.x + r.w / 2, oy: r.y + r.h / 2, x, y, t: performance.now(), maxLen: 0 };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          return;
        }
      }
      else if (hit.k === 'gadget') act({ a: 'gadget' });
      else if (hit.k === 'overdrive') act({ a: 'overdrive' });
      else if (hit.k === 'heal') act({ a: 'heal' });
      else {
        act({ a: 'slot', i: hit.i });
        const id = e.pointerId;
        touch.press = {
          id,
          timer: setTimeout(() => {
            if (touch.press && touch.press.id === id && inGame()) act({ a: 'drop' });
            touch.press = null;
          }, 550)
        };
      }
      return;
    }
    const st = { id: e.pointerId, ox: x, oy: y, x, y, t: performance.now(), maxLen: 0 };
    if (x < renderer.W / 2) {
      if (!touch.move) touch.move = st;
    } else if (!touch.aim) {
      touch.aim = st;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      return;
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      if (touch.on && performance.now() - touch.last > 1500) setTouchMode(false);
      return;
    }
    for (const st of [touch.move, touch.aim, touch.skill]) {
      if (st && st.id === e.pointerId) {
        st.x = e.clientX;
        st.y = e.clientY;
        st.maxLen = Math.max(st.maxLen || 0, Math.hypot(st.x - st.ox, st.y - st.oy));
        if (st !== touch.skill) follow(st);
      }
    }
  });

  const endTouch = e => {
    if (e.pointerType === 'mouse') return;
    touch.last = performance.now();
    if (touch.press && touch.press.id === e.pointerId) {
      clearTimeout(touch.press.timer);
      touch.press = null;
    }
    if (touch.move && touch.move.id === e.pointerId) touch.move = null;
    const now = performance.now();
    if (touch.aim && touch.aim.id === e.pointerId) {
      const a = touch.aim;
      const v = stickVec(a);
      const W = weaponNow();
      if (e.type === 'pointerup' && inGame()) {
        if (now - a.t < 260 && a.maxLen < 18) {
          const t = autoAim(weaponReach(W));
          touch.fireAim = t ? t.a : lastAim;
          touch.fireAd = t ? t.d : 380;
          touch.fireUntil = now + burstFor(W);
        } else if (v.len >= 14 && !(a.rimAt && now - a.rimAt > 350)) {
          touch.fireAim = renderer.screenDir(v.dx, v.dy);
          touch.fireAd = 80 + Math.min(1, v.len / (STICK_R * 1.3)) * 340;
          touch.fireUntil = now + burstFor(W);
        }
      }
      touch.aim = null;
    }
    if (touch.skill && touch.skill.id === e.pointerId) {
      const sk = touch.skill;
      const v = stickVec(sk);
      if (e.type === 'pointerup' && inGame()) {
        if (v.len >= 18) castSkill(renderer.screenDir(v.dx, v.dy), 80 + Math.min(1, v.len / (STICK_R * 1.3)) * 340);
        else if (sk.maxLen < 18) castSkill(null, 380);
      }
      touch.skill = null;
    }
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  const touchButton = (id, fn) => {
    const b = $(id);
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      setTouchMode(true);
      touch.last = performance.now();
      b.classList.add('down');
      fn();
    });
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('click', e => e.preventDefault());
  };
  touchButton('tbUse', () => {
    if (inGame()) act({ a: 'interact' });
  });
  touchButton('tbReload', () => {
    if (inGame()) act({ a: 'reload' });
  });
  touchButton('tbJump', () => {
    if (inGame()) act({ a: 'jump' });
  });
  touchButton('tbPause', () => {
    if (!$('note').hidden) closeNote();
    else if (session && $('overlay').hidden && $('lobby').hidden) togglePause();
  });

  function placeStick(id, st, rx, ry) {
    const el = $(id);
    const knob = el.firstElementChild;
    const x = st ? st.ox : rx;
    const y = st ? st.oy : ry;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.classList.toggle('active', !!st);
    let kx = 0;
    let ky = 0;
    if (st) {
      const v = stickVec(st);
      if (v.len > 0) {
        kx = (v.dx / v.len) * Math.min(v.len, STICK_R);
        ky = (v.dy / v.len) * Math.min(v.len, STICK_R);
      }
    }
    knob.style.transform = 'translate(' + kx.toFixed(1) + 'px,' + ky.toFixed(1) + 'px)';
  }

  function updateTouchUI(view) {
    const show = touch.on && !!session && !!view && !dlg && $('pause').hidden && $('overlay').hidden && $('lobby').hidden && !view.spec;
    $('touchUI').hidden = !show;
    if (!show) {
      touch.move = null;
      touch.aim = null;
      touch.skill = null;
      return;
    }
    const me = view.me;
    const playing = me.alive && view.st === 'playing';
    $('stickL').hidden = !playing;
    $('stickR').hidden = !playing;
    $('tbReload').hidden = !playing || !!me.veh;
    $('tbJump').hidden = !playing || !!me.veh;
    const pr = playing ? me.pr : null;
    const use = $('tbUse');
    if (pr) {
      const name = pr.k === 'drive' ? I.pick(D.VEHICLES[pr.t].name) : pr.t ? Renderer.itemName(pr.t) : '';
      const label = I.t(pr.k, name).trim();
      if (use.textContent !== label) use.textContent = label;
    }
    use.hidden = !pr;
    const W = renderer.W;
    const H = renderer.H;
    placeStick('stickL', touch.move, 96, H - 92);
    placeStick('stickR', touch.aim, W - 220, H - 84);
  }

  // A home-screen icon drawn from the 允望樓 seal, so "Add to Home Screen" on a phone gets a proper icon.
  function homeIcon() {
    try {
      const c = document.createElement('canvas');
      c.width = 180;
      c.height = 180;
      const g = c.getContext('2d');
      g.fillStyle = '#1d2a18';
      g.fillRect(0, 0, 180, 180);
      g.translate(90, 90);
      g.rotate(-0.1);
      g.fillStyle = '#b8322a';
      g.fillRect(-62, -62, 124, 124);
      g.strokeStyle = 'rgba(246,230,200,0.7)';
      g.lineWidth = 6;
      g.strokeRect(-52, -52, 104, 104);
      g.fillStyle = '#f6e6c8';
      g.font = "bold 46px 'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('允望', 0, -18);
      g.fillText('樓', 0, 30);
      const url = c.toDataURL('image/png');
      for (const rel of ['apple-touch-icon', 'icon']) {
        const l = document.createElement('link');
        l.rel = rel;
        l.href = url;
        document.head.appendChild(l);
      }
    } catch (e) {
      return;
    }
  }
  homeIcon();

  // Phones: no pinch zoom, audio unlocks on the first tap (iOS needs a touch end), and the game pauses
  // its music when the app goes to the background.
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchend', () => Sound.init(), { passive: true });
  document.addEventListener('pointerup', () => Sound.init());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Sound.setMusic(false);
      if (session && session.kind === 'offline' && $('pause').hidden && !dlg) togglePause();
    } else {
      Sound.setMusic(prefs.music);
    }
  });
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) setTouchMode(true);
  $('tFull').addEventListener('click', () => goFullscreen());
  $('tTrial').addEventListener('click', () => {
    prefs.trial = !prefs.trial;
    store.set('trial', prefs.trial ? 1 : 0);
    Sound.play('click');
    renderHeroCards();
  });
  $('rotateAnyway').addEventListener('click', () => {
    touch.portraitOk = true;
    $('rotate').hidden = true;
  });
  const onViewport = () => {
    renderer.resize();
    const a = window.innerWidth / window.innerHeight;
    if (session) session.setAspect(a);
    if (demo) demo.setAspect(a);
  };
  window.addEventListener('orientationchange', () => setTimeout(onViewport, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewport);

  // ---------- menu wiring ----------

  $('name').value = store.get('name', '');
  $('bots').value = String(prefs.bots);
  $('botsv').textContent = String(prefs.bots);
  $('bots').addEventListener('input', () => {
    prefs.bots = Number($('bots').value);
    $('botsv').textContent = $('bots').value;
    store.set('bots', prefs.bots);
  });
  for (const id of ['diff', 'roomDiff', 'pauseDiff']) {
    for (const n of D.DIFF_LEVELS) {
      const b = document.createElement('button');
      b.dataset.v = String(n);
      b.dataset.i18n = 'diff' + n;
      $(id).appendChild(b);
    }
  }
  function markDiff() {
    for (const b of document.querySelectorAll('#diff button, #pauseDiff button')) b.classList.toggle('on', Number(b.dataset.v) === prefs.diff);
    $('diffHint').textContent = I.t('diffHint' + prefs.diff);
  }
  function setDiff(n) {
    prefs.diff = n;
    store.set('diff', n);
    markDiff();
    Sound.play('click');
  }
  for (const b of document.querySelectorAll('#diff button')) b.addEventListener('click', () => setDiff(Number(b.dataset.v)));
  for (const b of document.querySelectorAll('#pauseDiff button')) {
    b.addEventListener('click', () => {
      setDiff(Number(b.dataset.v));
      if (session && session.kind === 'offline') session.sim.setDifficulty(prefs.diff);
    });
  }
  markDiff();
  $('noteClose').addEventListener('click', () => {
    closeNote();
    blurFocus();
  });
  let hoverEl = null;
  let hoverAt = 0;
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target && e.target.closest ? e.target.closest('button, summary') : null;
    if (b === hoverEl) return;
    hoverEl = b;
    const now = performance.now();
    if (!b || b.disabled || now - hoverAt < 45) return;
    hoverAt = now;
    Sound.play('hover');
  });
  $('server').value = store.get('server', '');
  $('roomBots').addEventListener('input', () => {
    $('roomBotsV').textContent = $('roomBots').value;
    const now = performance.now();
    if (session && session.kind === 'online' && session.room && now - lastCfgSend > 120) {
      lastCfgSend = now;
      session.configure(Number($('roomBots').value), session.room.diff, session.room.mode);
    }
  });
  $('roomBots').addEventListener('change', () => {
    if (session && session.kind === 'online' && session.room) session.configure(Number($('roomBots').value), session.room.diff, session.room.mode);
  });
  for (const b of document.querySelectorAll('#roomMode button')) {
    b.addEventListener('click', () => {
      if (session && session.kind === 'online' && session.room) session.configure(Number($('roomBots').value), session.room.diff, b.dataset.v);
    });
  }
  for (const b of document.querySelectorAll('#roomTeam button')) {
    b.addEventListener('click', () => {
      Sound.play('click');
      if (session && session.kind === 'online' && session.room) session.setTeam(Number(b.dataset.v));
    });
  }
  for (const b of document.querySelectorAll('#roomDiff button')) {
    b.addEventListener('click', () => {
      if (session && session.kind === 'online' && session.room) session.configure(Number($('roomBots').value), Number(b.dataset.v), session.room.mode);
    });
  }
  $('roomStart').addEventListener('click', () => {
    Sound.play('click');
    if (session && session.kind === 'online') session.startMatch();
  });
  $('btnStory').addEventListener('click', () => {
    Sound.init();
    Sound.play('click');
    openHeroSelect('story');
  });
  $('btnRoyale').addEventListener('click', () => {
    Sound.init();
    Sound.play('click');
    openHeroSelect('royale');
  });
  $('btnLan').addEventListener('click', () => {
    Sound.init();
    Sound.play('click');
    openHeroSelect('lan');
  });
  $('heroBack').addEventListener('click', () => onlyScreen('title'));
  $('heroGo').addEventListener('click', () => {
    Sound.play('click');
    goFullscreen();
    if (pickMode === 'story') {
      onlyScreen('chapters');
      renderChapters();
    } else if (pickMode === 'royale') {
      flow = null;
      startSolo(Object.assign(heroOpts(), { mode: 'royale' }));
    } else {
      const addr = SERVED ? '' : $('server').value.trim();
      if (!SERVED && !addr) {
        $('server').placeholder = I.t('needServer');
        $('server').focus();
        return;
      }
      store.set('server', addr);
      startOnline(Object.assign(heroOpts(), { server: addr }));
    }
  });
  $('chapBack').addEventListener('click', () => openHeroSelect('story'));
  $('tLang').addEventListener('click', () => {
    I.lang = I.lang === 'zh' ? 'en' : 'zh';
    store.set('lang', I.lang);
    applyI18n();
  });
  const toggleMusic = () => {
    prefs.music = !prefs.music;
    store.set('music', prefs.music ? 1 : 0);
    Sound.setMusic(prefs.music);
    applyI18n();
  };
  const toggleSfx = () => {
    prefs.sfx = !prefs.sfx;
    store.set('sfx', prefs.sfx ? 1 : 0);
    Sound.setSfx(prefs.sfx);
    applyI18n();
  };
  // The view is only how this screen draws the game; the match itself is the same for everyone.
  function markView() {
    for (const b of document.querySelectorAll('.view-seg button')) b.classList.toggle('on', (b.dataset.v === '25d') === prefs.view3d);
  }
  renderer.mode3d = prefs.view3d;
  for (const b of document.querySelectorAll('.view-seg button')) {
    b.addEventListener('click', () => {
      prefs.view3d = b.dataset.v === '25d';
      store.set('view3d', prefs.view3d ? 1 : 0);
      renderer.mode3d = prefs.view3d;
      renderer.zoom = 0;
      Sound.play('click');
      markView();
    });
  }
  $('tMusic').addEventListener('click', toggleMusic);
  $('tSfx').addEventListener('click', toggleSfx);
  $('pauseMusic').addEventListener('click', toggleMusic);
  $('pauseSfx').addEventListener('click', toggleSfx);
  $('ovAgain').addEventListener('click', () => {
    if (!session) return;
    if (flow) {
      const next = flow.result === 'win' && flow.idx < D.STORY.length - 1 ? flow.idx + 1 : flow.idx;
      startChapter(next);
    } else if (session.kind === 'offline') {
      startSolo(lastOpts);
    } else {
      showLobby();
    }
  });
  $('ovMenu').addEventListener('click', () => backToMenu(''));
  $('ovSpectate').addEventListener('click', () => {
    if (!session || !lastView) return;
    const k = lastView.me.killerId;
    if (k && lastView.pl.some(p => p.i === k && !p.d)) session.spectate(k);
    else session.spectateNext();
    gameOver.spectating = true;
    show('overlay', false);
    show('specbar', true);
    $('specAgain').textContent = session.kind === 'online' ? I.t('backToLobby') : I.t('playAgain');
    blurFocus();
  });
  $('specNext').addEventListener('click', () => session && session.spectateNext());
  $('specAgain').addEventListener('click', () => $('ovAgain').click());
  $('specMenu').addEventListener('click', () => backToMenu(''));
  $('pauseResume').addEventListener('click', () => {
    togglePause();
    blurFocus();
  });
  $('pauseQuit').addEventListener('click', () => backToMenu(''));
  $('lobbyLeave').addEventListener('click', () => backToMenu(''));

  // ---------- main loop ----------

  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    // Phones held upright get a prompt to turn sideways; a solo game waits meanwhile.
    const portrait = touch.on && !!session && window.innerHeight > window.innerWidth && !touch.portraitOk;
    if ($('rotate').hidden === portrait) $('rotate').hidden = !portrait;
    if (session && session.kind === 'offline') {
      if (portrait && !session.paused) {
        session.paused = true;
        touch.rotatePaused = true;
      } else if (!portrait && touch.rotatePaused) {
        touch.rotatePaused = false;
        if ($('pause').hidden && !dlg) session.paused = false;
      }
    }
    const isDemo = !session || (session.kind === 'online' && !session.map);
    if (isDemo && !demo) startDemo();
    const active = isDemo ? demo : session;
    if (active) {
      const input = buildInput();
      const actions = pendingActions;
      pendingActions = [];
      const res = active.update(dt, input, isDemo || dlg ? [] : actions);
      if (res === 'restart' && isDemo) startDemo();
      const cur = isDemo ? demo : session;
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
        for (const id of view.bk || []) {
          const b = cur.map.buildings[id];
          if (b) b.broken = 1;
        }
        if (view.cam !== view.you || view.spec) {
          const c = view.pl.find(p => p.i === view.cam);
          view.specName = c ? Renderer.nameOf(c) : '';
        }
        if (!isDemo) handleEvents(view, view.ev);
        ui.noHud = isDemo;
        ui.aim = !isDemo && view.me.alive && !view.me.veh ? input.aim : null;
        ui.tip = isDemo ? '' : tipFor(view);
        ui.guide = isDemo ? null : aimGuide(view);
        renderer.draw(view, ui, cur.paused ? 0 : dt);
        if (!isDemo) updateTouchUI(view);
        else $('touchUI').hidden = true;
        if (!isDemo) {
          afterFrame(view);
          if (!cur.paused && $('lobby').hidden) ownSounds(view, dt);
          if (noteAt && Math.hypot(view.me.x - noteAt.x, view.me.y - noteAt.y) > 170) closeNote();
          lastView = view;
        }
      } else if (!isDemo) {
        const ctx = renderer.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#1d2a18';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(frame);
  }

  function afterFrame(view) {
    if (session && session.kind === 'online' && !$('lobby').hidden) return;
    const me = view.me;
    if (me.veh) {
      const v = view.ve.find(q => q.d === view.you);
      Sound.setEngine(true, v ? Math.min(1, Math.abs(v.sp) / D.VEHICLES[v.t].max) : 0);
    } else {
      Sound.setEngine(false, 0);
    }
    if (view.mode === 'story' && flow) {
      if (view.st === 'ended' && !flow.handled) {
        const now = performance.now();
        if (!flow.endAt) {
          flow.endAt = now;
          if (view.res !== 'win') Sound.play('lose');
          else if (!Sound.playWinner()) Sound.play('win');
        }
        if (now - flow.endAt > 1400) {
          flow.handled = true;
          if (view.res === 'win') {
            const chId = D.STORY[flow.idx].id;
            prefs.progress = Math.max(prefs.progress, flow.idx + 1);
            store.set('progress', prefs.progress);
            playDialogue(I.STORY[chId].outro, () => showStoryResult(lastView || view));
          } else {
            showStoryResult(view);
          }
        }
      }
      return;
    }
    if (view.spec) {
      show('specbar', false);
      if (!gameOver.shown) {
        $('lobbyBanner').hidden = false;
        $('lobbyBanner').textContent = I.t('matchInProgress', view.specName || '');
      }
      return;
    }
    $('lobbyBanner').hidden = true;
    const teamGame = view.tmode && view.tmode !== 'ffa';
    if (!me.alive) {
      gameOver.wasDown = true;
    } else if (gameOver.wasDown) {
      gameOver.wasDown = false;
      gameOver.deathAt = 0;
      gameOver.shown = false;
      gameOver.spectating = false;
      show('overlay', false);
      show('specbar', false);
      Sound.play('respawn');
      renderer.banner(I.t('respawned'), '#8fe07a');
    }
    if (!me.alive && me.rsp >= 0) return;
    if (!me.alive && !gameOver.deathAt) gameOver.deathAt = performance.now();
    const won = view.st === 'ended' && (teamGame ? view.wt === me.tm : view.winId === view.you);
    if (teamGame && gameOver.shown && !gameOver.final && view.st === 'ended') {
      gameOver.spectating = false;
      if (!won) Sound.play('lose');
      else if (!Sound.playWinner()) Sound.play('win');
      showGameOver(view, won);
    }
    if (teamGame && !gameOver.shown && me.alive && view.st === 'ended' && !won) {
      if (!gameOver.lostAt) {
        gameOver.lostAt = performance.now();
        Sound.play('lose');
      }
      if (performance.now() - gameOver.lostAt > 1400) showGameOver(view, false);
    }
    if (!gameOver.shown) {
      if (won) {
        if (!gameOver.wonAt) {
          gameOver.wonAt = performance.now();
          if (!Sound.playWinner()) Sound.play('win');
        }
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
      },
      get dialogue() {
        return dlg;
      },
      get renderer() {
        return renderer;
      },
      get touch() {
        return touch;
      },
      startChapter,
      advanceDialogue,
      endDialogue
    };
  }

  applyI18n();
  onlyScreen('title');
  startDemo();
  requestAnimationFrame(frame);
})();
