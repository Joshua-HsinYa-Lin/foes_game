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
    sfxOn: true,
    volume: 0.6,
    engine: null,
    music: null,
    musicOn: true,
    musicVolume: 0.42,

    init() {
      this.playMusic();
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
      this.master.gain.value = this.sfxOn ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    // tracks: { theme, quiet }. Outside the lobby they alternate, theme first; the lobby loops the quiet track.
    initMusic(tracks) {
      if (this.music || !tracks || !tracks.theme) return;
      try {
        this.music = new window.Audio();
      } catch (e) {
        this.music = null;
        return;
      }
      this.tracks = tracks;
      this.mode = 'playlist';
      this.current = '';
      this.music.volume = this.musicVolume;
      this.music.preload = 'auto';
      this.music.addEventListener('ended', () => this.onTrackEnded());
      this.setTrack('theme');
    },

    setTrack(name) {
      if (!this.music || !this.tracks[name] || this.current === name) return;
      this.current = name;
      this.music.src = this.tracks[name];
      this.music.loop = false;
    },

    onTrackEnded() {
      if (this.mode === 'lobby' || !this.tracks.quiet) {
        this.music.currentTime = 0;
      } else {
        this.setTrack(this.current === 'theme' ? 'quiet' : 'theme');
      }
      this.playMusic();
    },

    // 'lobby' switches to the quiet track; 'playlist' resumes, and restart starts the theme from the top.
    setMusicMode(mode, restart) {
      if (!this.music) return;
      const prev = this.mode;
      this.mode = mode;
      if (mode === 'lobby' && this.tracks.quiet) this.setTrack('quiet');
      else if (mode === 'playlist' && (restart || prev === 'lobby')) {
        this.setTrack('theme');
        this.music.currentTime = 0;
      }
      this.playMusic();
    },

    playMusic() {
      if (!this.music || !this.musicOn) return;
      const p = this.music.play();
      if (p && p.catch) p.catch(() => {});
    },

    setMusic(on) {
      this.musicOn = on;
      if (!this.music) return;
      if (on) this.playMusic();
      else this.music.pause();
    },

    setSfx(on) {
      this.sfxOn = on;
      if (this.master) this.master.gain.value = on ? this.volume : 0;
    },

    duckMusic(f) {
      if (this.music) this.music.volume = this.musicVolume * f;
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

    noiseBurst(dest, freq, type, dur, q, delay) {
      const t = this.ctx.currentTime + (delay || 0);
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

    tone(dest, f0, f1, dur, type, vol, delay) {
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol == null ? 1 : vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    notes(list, type, vol, step) {
      const d = this.out(vol, 0);
      list.forEach((f, i) => this.tone(d, f, f * 0.999, step * 1.6, type, 0.7, i * step));
    },

    play(type, opts) {
      if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
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
        case 'turret': {
          const d = this.out(0.22 * att, pan);
          this.tone(d, 1600, 900, 0.05, 'square', 0.35);
          this.noiseBurst(d, 3000, 'highpass', 0.04);
          break;
        }
        case 'throwChop':
          this.noiseBurst(this.out(0.28 * att, pan), 3200, 'bandpass', 0.07, 3);
          break;
        case 'throwBowl':
          this.noiseBurst(this.out(0.3 * att, pan), 1200, 'bandpass', 0.18, 2);
          this.tone(this.out(0.12 * att, pan), 500, 900, 0.18, 'sine', 0.4);
          break;
        case 'harpoon': {
          const d = this.out(0.5 * att, pan);
          this.tone(d, 420, 90, 0.35, 'sawtooth', 0.5);
          this.noiseBurst(d, 900, 'lowpass', 0.2);
          break;
        }
        case 'bonk': {
          const d = this.out(0.55 * att, pan);
          this.tone(d, 820, 760, 0.45, 'triangle', 0.7);
          this.tone(d, 1240, 1180, 0.35, 'sine', 0.45);
          this.tone(d, 2050, 1950, 0.2, 'sine', 0.25);
          this.noiseBurst(d, 2500, 'highpass', 0.04);
          break;
        }
        case 'chop': {
          const d = this.out(0.4 * att, pan);
          this.noiseBurst(d, 4200, 'highpass', 0.08);
          this.tone(d, 300, 120, 0.1, 'triangle', 0.6);
          break;
        }
        case 'thud': {
          const d = this.out(0.55 * att, pan);
          this.tone(d, 180, 60, 0.2, 'sine', 0.9);
          this.noiseBurst(d, 500, 'lowpass', 0.12);
          break;
        }
        case 'ceramic': {
          const d = this.out(0.3 * att, pan);
          this.tone(d, 2100, 2050, 0.25, 'sine', 0.5);
          this.tone(d, 3150, 3100, 0.18, 'sine', 0.3);
          break;
        }
        case 'explosion': {
          const d = this.out(1.1 * att, pan);
          this.noiseBurst(d, 420, 'lowpass', 1.3);
          this.tone(d, 90, 30, 0.9, 'sine', 0.9);
          break;
        }
        case 'flame': {
          const d = this.out(0.7 * att, pan);
          this.noiseBurst(d, 700, 'lowpass', 0.6);
          this.noiseBurst(d, 2400, 'bandpass', 0.35, 1, 0.05);
          this.tone(d, 140, 60, 0.5, 'sawtooth', 0.25);
          break;
        }
        case 'rush': {
          const d = this.out(0.5 * att, pan);
          this.noiseBurst(d, 1500, 'bandpass', 0.3, 1.5);
          this.tone(d, 200, 600, 0.25, 'triangle', 0.4);
          break;
        }
        case 'boba': {
          const d = this.out(0.4, 0);
          for (let i = 0; i < 4; i++) this.noiseBurst(d, 900 + i * 250, 'bandpass', 0.06, 6, i * 0.08);
          this.tone(d, 600, 1200, 0.3, 'sine', 0.3, 0.32);
          break;
        }
        case 'deploy': {
          const d = this.out(0.35 * att, pan);
          this.tone(d, 300, 900, 0.15, 'square', 0.3);
          this.tone(d, 900, 1400, 0.1, 'square', 0.25, 0.15);
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
        case 'jump':
          this.tone(this.out(0.15 * att, pan), 300, 700, 0.12, 'sine', 0.5);
          break;
        case 'pickup':
          this.tone(this.out(0.22, 0), 620, 980, 0.09, 'sine', 0.8);
          break;
        case 'rare':
          this.notes([784, 988, 1175, 1568], 'triangle', 0.25, 0.06);
          break;
        case 'coldbox':
          this.notes([1047, 1319, 1568, 2093, 2637], 'sine', 0.28, 0.05);
          break;
        case 'reload': {
          const d = this.out(0.25 * att, pan);
          this.tone(d, 1400, 900, 0.04, 'square', 0.3);
          this.tone(d, 1100, 700, 0.05, 'square', 0.3, 0.14);
          break;
        }
        case 'empty':
          this.tone(this.out(0.2, 0), 1800, 1500, 0.03, 'square', 0.3);
          break;
        case 'heal':
          this.tone(this.out(0.25, 0), 520, 780, 0.18, 'sine', 0.7);
          break;
        case 'crash':
          this.noiseBurst(this.out(0.5 * att, pan), 500, 'lowpass', 0.3);
          break;
        case 'kill':
          this.tone(this.out(0.3, 0), 440, 880, 0.15, 'triangle', 0.7);
          break;
        case 'streak':
          this.notes([660, 880, 1320], 'square', 0.18, 0.07);
          break;
        case 'zone':
          this.tone(this.out(0.35, 0), 300, 200, 0.6, 'sawtooth', 0.25);
          break;
        case 'wave':
          this.notes([440, 330, 440, 330], 'sawtooth', 0.18, 0.14);
          break;
        case 'boss':
          this.tone(this.out(0.5, 0), 110, 55, 1.2, 'sawtooth', 0.45);
          this.noiseBurst(this.out(0.3, 0), 300, 'lowpass', 1);
          break;
        case 'win':
          this.notes([523, 659, 784, 1047, 784, 1047, 1319], 'triangle', 0.3, 0.12);
          break;
        case 'lose':
          this.notes([392, 349, 311, 262], 'triangle', 0.3, 0.2);
          break;
        case 'step': {
          const d = this.out((opts.v || 0.07) * att, pan);
          this.noiseBurst(d, opts.alt ? 520 : 440, 'lowpass', 0.07);
          this.tone(d, opts.alt ? 95 : 85, 50, 0.05, 'sine', 0.35);
          break;
        }
        case 'rustle': {
          const d = this.out(0.16 * att, pan);
          this.noiseBurst(d, 2600, 'bandpass', 0.22, 0.8);
          this.noiseBurst(d, 3800, 'bandpass', 0.16, 1.2, 0.07);
          break;
        }
        case 'land': {
          const d = this.out(0.22 * att, pan);
          this.tone(d, 140, 55, 0.12, 'sine', 0.8);
          this.noiseBurst(d, 600, 'lowpass', 0.09);
          break;
        }
        case 'switch': {
          const d = this.out(0.16, 0);
          this.tone(d, 2400, 1900, 0.025, 'square', 0.3);
          this.tone(d, 1500, 1200, 0.03, 'square', 0.25, 0.05);
          break;
        }
        case 'drop': {
          const d = this.out(0.22, 0);
          this.tone(d, 260, 110, 0.12, 'triangle', 0.6);
          this.noiseBurst(d, 900, 'lowpass', 0.08);
          break;
        }
        case 'door': {
          const d = this.out(0.3 * att, pan);
          this.noiseBurst(d, 380, 'lowpass', 0.14);
          this.tone(d, 130, 70, 0.12, 'square', 0.25);
          this.tone(d, 900, 700, 0.03, 'square', 0.15, 0.1);
          break;
        }
        case 'heartbeat': {
          const d = this.out(0.32, 0);
          this.tone(d, 70, 42, 0.13, 'sine', 1);
          this.tone(d, 64, 40, 0.11, 'sine', 0.7, 0.2);
          break;
        }
        case 'sizzle':
          this.noiseBurst(this.out(0.09, 0), 5200, 'highpass', 0.35);
          break;
        case 'breath': {
          const d = this.out(0.2, 0);
          this.noiseBurst(d, 900, 'bandpass', 0.45, 1.5);
          this.noiseBurst(d, 700, 'bandpass', 0.5, 1.5, 0.55);
          break;
        }
        case 'hover':
          this.tone(this.out(0.05, 0), 2100, 1900, 0.025, 'triangle', 0.5);
          break;
        case 'gong': {
          const d = this.out(0.4, 0);
          for (const [f, v] of [[174, 1], [263, 0.55], [392, 0.35], [607, 0.2], [861, 0.12]]) this.tone(d, f, f * 0.985, 2.6, 'sine', v);
          this.noiseBurst(d, 1200, 'lowpass', 0.08);
          break;
        }
        case 'secret':
          this.notes([1047, 1319, 1568, 1976, 2349, 3136], 'sine', 0.24, 0.07);
          this.notes([523, 784], 'triangle', 0.12, 0.2);
          break;
        case 'meow': {
          const t = this.ctx.currentTime;
          const d = this.out(0.3 * att, pan);
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(620, t);
          o.frequency.linearRampToValueAtTime(980, t + 0.12);
          o.frequency.linearRampToValueAtTime(560, t + 0.45);
          const flt = this.ctx.createBiquadFilter();
          flt.type = 'bandpass';
          flt.frequency.setValueAtTime(1300, t);
          flt.frequency.linearRampToValueAtTime(1800, t + 0.15);
          flt.frequency.linearRampToValueAtTime(1000, t + 0.45);
          flt.Q.value = 3;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.9, t + 0.04);
          g.gain.setValueAtTime(0.9, t + 0.25);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          o.connect(flt);
          flt.connect(g);
          g.connect(d);
          o.start(t);
          o.stop(t + 0.55);
          break;
        }
        case 'plane': {
          const t = this.ctx.currentTime;
          const d = this.out(0.22, 0);
          const flt = this.ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = 420;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.8, t + 1.8);
          g.gain.setValueAtTime(0.8, t + 3.2);
          g.gain.exponentialRampToValueAtTime(0.001, t + 7);
          flt.connect(g);
          g.connect(d);
          for (const f of [68, 71.5, 136]) {
            const o = this.ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(f * 1.04, t);
            o.frequency.linearRampToValueAtTime(f * 0.96, t + 7);
            o.connect(flt);
            o.start(t);
            o.stop(t + 7.1);
          }
          break;
        }
        case 'landDrop': {
          const d = this.out(0.45 * att, pan);
          this.tone(d, 120, 40, 0.35, 'sine', 1);
          this.noiseBurst(d, 420, 'lowpass', 0.3);
          this.noiseBurst(d, 2400, 'bandpass', 0.25, 0.8, 0.05);
          break;
        }
        case 'unlock': {
          const d = this.out(0.3 * att, pan);
          this.tone(d, 900, 600, 0.05, 'square', 0.3);
          this.tone(d, 1200, 800, 0.05, 'square', 0.3, 0.08);
          this.notes([784, 1047, 1319], 'triangle', 0.18 * att, 0.06);
          break;
        }
        case 'paper': {
          const d = this.out(0.22, 0);
          this.noiseBurst(d, 3000, 'bandpass', 0.12, 1);
          this.noiseBurst(d, 4200, 'bandpass', 0.1, 1, 0.1);
          break;
        }
        case 'blip':
          this.tone(this.out(0.12, 0), 880, 760, 0.05, 'square', 0.3);
          break;
        case 'click':
          this.tone(this.out(0.15, 0), 1200, 900, 0.04, 'triangle', 0.5);
          break;
      }
    },

    setEngine(on, speedFrac) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (!on) {
        if (this.engine) this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
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
