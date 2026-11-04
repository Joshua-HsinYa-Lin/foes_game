(function () {
  'use strict';

  const GUN = {
    pistol: { f: 1900, d: 0.12, v: 0.5, thump: 0.25 },
    uzi: { f: 2300, d: 0.08, v: 0.38, thump: 0.15 },
    shotgun: { f: 800, d: 0.32, v: 0.75, thump: 0.6 },
    rifle: { f: 1500, d: 0.13, v: 0.5, thump: 0.35 },
    sniper: { f: 650, d: 0.5, v: 0.8, thump: 0.8 },
    minigun: { f: 1300, d: 0.1, v: 0.45, thump: 0.4 }
  };

  const Sound = {
    ctx: null,
    master: null,
    noise: null,
    muted: false,
    volume: 0.6,
    engine: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        this.ctx = null;
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : this.volume;
    },

    out(vol, pan) {
      const g = this.ctx.createGain();
      g.gain.value = vol;
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan || 0));
        g.connect(p);
        p.connect(this.master);
      } else {
        g.connect(this.master);
      }
      return g;
    },

    noiseBurst(dest, freq, type, dur, q) {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    },

    tone(dest, f0, f1, dur, type, vol) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol == null ? 1 : vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    play(type, opts) {
      if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
      opts = opts || {};
      const dist = opts.dist || 0;
      const att = Math.max(0, 1 - dist / 1700);
      if (att <= 0.01) return;
      const pan = opts.dx ? opts.dx / 900 : 0;
      switch (type) {
        case 'gun': {
          const G = GUN[opts.w] || GUN.pistol;
          const d = this.out(G.v * att * 0.7, pan);
          this.noiseBurst(d, G.f, 'lowpass', G.d);
          this.tone(d, 160, 45, G.d * 0.8, 'sine', G.thump);
          break;
        }
        case 'explosion': {
          const d = this.out(1.1 * att, pan);
          this.noiseBurst(d, 420, 'lowpass', 1.3);
          this.tone(d, 90, 30, 0.9, 'sine', 0.9);
          break;
        }
        case 'hitPlayer':
          this.noiseBurst(this.out(0.35 * att, pan), 700, 'lowpass', 0.07);
          break;
        case 'hitObj':
          this.tone(this.out(0.16 * att, pan), 900, 260, 0.06, 'triangle', 0.8);
          break;
        case 'hitVeh':
          this.tone(this.out(0.18 * att, pan), 2200, 1400, 0.05, 'square', 0.4);
          break;
        case 'break':
          this.noiseBurst(this.out(0.45 * att, pan), 1200, 'bandpass', 0.25, 1.2);
          this.tone(this.out(0.3 * att, pan), 300, 90, 0.2, 'triangle', 0.6);
          break;
        case 'swing':
          this.noiseBurst(this.out(0.18 * att, pan), 1800, 'bandpass', 0.12, 2);
          break;
        case 'pickup':
          this.tone(this.out(0.22, 0), 620, 980, 0.09, 'sine', 0.8);
          break;
        case 'reload': {
          const d = this.out(0.25 * att, pan);
          this.tone(d, 1400, 900, 0.04, 'square', 0.3);
          setTimeout(() => {
            if (this.ctx) this.tone(this.out(0.25 * att, pan), 1100, 700, 0.05, 'square', 0.3);
          }, 140);
          break;
        }
        case 'empty':
          this.tone(this.out(0.2, 0), 1800, 1500, 0.03, 'square', 0.3);
          break;
        case 'heal':
          this.tone(this.out(0.25, 0), 520, 780, 0.18, 'sine', 0.7);
          break;
        case 'throw':
          this.noiseBurst(this.out(0.2 * att, pan), 900, 'bandpass', 0.15, 1.5);
          break;
        case 'crash':
          this.noiseBurst(this.out(0.5 * att, pan), 500, 'lowpass', 0.3);
          break;
        case 'kill':
          this.tone(this.out(0.3, 0), 440, 880, 0.15, 'triangle', 0.7);
          break;
        case 'zone':
          this.tone(this.out(0.35, 0), 300, 200, 0.6, 'sawtooth', 0.25);
          break;
      }
    },

    setEngine(on, speedFrac) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (!on) {
        if (this.engine) {
          this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
        return;
      }
      if (!this.engine) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        o.connect(f);
        f.connect(g);
        g.connect(this.master);
        o.start();
        this.engine = { o, f, g };
      }
      const t = this.ctx.currentTime;
      this.engine.o.frequency.setTargetAtTime(45 + speedFrac * 110, t, 0.08);
      this.engine.g.gain.setTargetAtTime(0.08 + speedFrac * 0.06, t, 0.1);
    }
  };

  globalThis.PF_Sound = Sound;
})();
