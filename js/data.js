(function () {
  'use strict';
  const D = {};

  D.TITLE = 'Pinefall';
  D.MAP_SIZE = 5600;
  D.PLAYER_R = 22;
  D.PLAYER_SPEED = 265;
  D.MAX_HP = 100;
  D.LOOT_R = 18;
  D.PICKUP_RANGE = 75;
  D.TICK_RATE = 30;

  D.SCOPES = [1, 2, 4, 8];
  D.VIEW_H = [900, 1150, 1450, 1800];
  D.MAX_ASPECT = 2.6;

  D.RARITY = ['#cfcfcf', '#62c454', '#3f92e6', '#ab5cf0', '#f2a531'];

  D.AMMO = {
    light: { name: '9mm', color: '#e3b23c', cap: [120, 180, 240, 300], stack: 30 },
    medium: { name: '5.56mm', color: '#4a90d9', cap: [90, 150, 210, 270], stack: 30 },
    shells: { name: '12 gauge', color: '#d9463e', cap: [20, 35, 50, 70], stack: 10 },
    heavy: { name: '.308', color: '#3c9a52', cap: [15, 25, 40, 55], stack: 10 }
  };

  // spread is the max half-angle in degrees; reload for shell weapons is per shell
  D.WEAPONS = {
    pistol: { name: 'Pistol', ammo: 'light', mag: 15, dmg: 15, delay: 0.18, spread: 3, speed: 1800, range: 800, reload: 1.4, move: 1.0, pellets: 1, len: 24, wid: 7, rarity: 0, recoil: 1.0, maxBloom: 4, color: '#2b2b2b', snd: 0 },
    smg: { name: 'SMG', ammo: 'light', mag: 30, dmg: 10, delay: 0.075, spread: 5, speed: 1800, range: 700, reload: 1.8, move: 0.97, pellets: 1, len: 36, wid: 8, rarity: 1, recoil: 0.5, maxBloom: 5, color: '#3a3f44', snd: 1 },
    shotgun: { name: 'Shotgun', ammo: 'shells', mag: 5, dmg: 10, delay: 0.85, spread: 9, speed: 1500, range: 430, reload: 0.55, shell: true, move: 0.95, pellets: 8, fall: 0.55, len: 46, wid: 9, rarity: 1, recoil: 0, maxBloom: 0, color: '#5a3a22', snd: 2 },
    rifle: { name: 'Assault Rifle', ammo: 'medium', mag: 30, dmg: 15, delay: 0.1, spread: 2.5, speed: 2300, range: 1100, reload: 2.2, move: 0.94, pellets: 1, len: 48, wid: 8, rarity: 2, recoil: 0.45, maxBloom: 5, color: '#2e3a2a', snd: 3 },
    dmr: { name: 'Marksman Rifle', ammo: 'medium', mag: 10, dmg: 36, delay: 0.32, spread: 1.2, speed: 2700, range: 1500, reload: 2.4, move: 0.92, pellets: 1, len: 56, wid: 8, rarity: 3, recoil: 1.5, maxBloom: 3, color: '#4a4030', snd: 4 },
    sniper: { name: 'Sniper Rifle', ammo: 'heavy', mag: 5, dmg: 85, delay: 1.25, spread: 0.3, speed: 3300, range: 2100, reload: 3.0, move: 0.88, pellets: 1, len: 66, wid: 8, rarity: 4, recoil: 0, maxBloom: 0, color: '#2c3238', snd: 5 },
    lmg: { name: 'Light Machine Gun', ammo: 'medium', mag: 75, dmg: 13, delay: 0.085, spread: 4, speed: 2100, range: 1000, reload: 4.2, move: 0.85, pellets: 1, len: 54, wid: 10, rarity: 3, recoil: 0.35, maxBloom: 6, color: '#3b3b2b', snd: 3 }
  };

  D.MELEE = {
    fists: { name: 'Fists', dmg: 22, delay: 0.32, range: 48, obj: 1.0, rarity: 0 },
    hatchet: { name: 'Hatchet', dmg: 36, delay: 0.42, range: 58, obj: 2.2, rarity: 1 }
  };

  D.HEALS = {
    bandage: { name: 'Bandage', time: 3, heal: 15, max: 75, cap: [5, 10, 15, 30], rarity: 0, key: '5' },
    medkit: { name: 'Med Kit', time: 6, heal: 100, max: 100, cap: [1, 2, 3, 4], rarity: 2, key: '6' },
    soda: { name: 'Energy Drink', time: 3, boost: 50, cap: [2, 3, 4, 5], rarity: 1, key: '7' }
  };

  D.FRAG = { name: 'Frag Grenade', cap: [3, 4, 5, 6], fuse: 2.6, radius: 210, dmg: 115, maxThrow: 620, rarity: 1 };

  D.VEST = [0, 0.2, 0.3, 0.4];
  D.HELMET = [0, 0.1, 0.15, 0.2];
  D.GEAR_NAMES = {
    vest: ['', 'Light Vest', 'Tactical Vest', 'Heavy Vest'],
    helmet: ['', 'Cap Helmet', 'Combat Helmet', 'Heavy Helmet'],
    pack: ['', 'Small Pack', 'Field Pack', 'Large Pack'],
    scope: ['1x Sight', '2x Scope', '4x Scope', '8x Scope']
  };

  D.VEHICLES = {
    jeep: { name: 'Jeep', r: 44, len: 118, wid: 68, max: 700, accel: 480, rev: 240, turn: 2.3, hp: 400, ram: 0.11 },
    bike: { name: 'Dirt Bike', r: 26, len: 76, wid: 26, max: 800, accel: 640, rev: 160, turn: 3.1, hp: 160, ram: 0.07 }
  };

  D.ZONE = [
    { wait: 70, shrink: 45, r: 2600, dps: 2 },
    { wait: 50, shrink: 35, r: 1600, dps: 3 },
    { wait: 40, shrink: 28, r: 950, dps: 5 },
    { wait: 32, shrink: 22, r: 520, dps: 8 },
    { wait: 26, shrink: 18, r: 260, dps: 11 },
    { wait: 20, shrink: 16, r: 90, dps: 15 },
    { wait: 15, shrink: 14, r: 0, dps: 20 }
  ];

  D.OBST = {
    tree: { solid: true, blk: true, hp: 0 },
    bush: { solid: false, blk: false, hp: 60 },
    rock: { solid: true, blk: true, hp: 300 },
    crate: { solid: true, blk: true, hp: 90 },
    mcrate: { solid: true, blk: true, hp: 160 },
    barrel: { solid: true, blk: true, hp: 50 },
    wall: { solid: true, blk: true, hp: 0 }
  };

  D.BOT_SKILL = {
    easy: { react: 0.4, aimNoise: 0.16, turn: 5, sight: 650, lead: 0.3, shootAngle: 0.16 },
    normal: { react: 0.27, aimNoise: 0.085, turn: 8, sight: 800, lead: 0.6, shootAngle: 0.12 },
    hard: { react: 0.16, aimNoise: 0.04, turn: 13, sight: 950, lead: 0.9, shootAngle: 0.08 }
  };

  D.SKINS = ['#f2c79b', '#e0a873', '#b97a4a', '#7d4f2e', '#f5dcc0', '#c99068'];
  D.ROOFS = ['#7a3b2e', '#3e5a73', '#5b4636', '#2f6b5e', '#6d6d3a', '#7b4f6b'];
  D.FLOORS = ['#b08a5a', '#9aa3a8', '#a37c58', '#8d8d86'];

  D.BOT_NAMES_A = ['Silent', 'Mossy', 'Rapid', 'Grim', 'Lucky', 'Frosty', 'Rusty', 'Shadow', 'Swift', 'Crimson', 'Lone', 'Iron', 'Wild', 'Dusty', 'Sly', 'Bold', 'Feral', 'Quiet', 'Amber', 'Stormy'];
  D.BOT_NAMES_B = ['Fox', 'Pine', 'Badger', 'Hawk', 'Wolf', 'Otter', 'Raven', 'Moose', 'Lynx', 'Bear', 'Boar', 'Owl', 'Stag', 'Viper', 'Heron', 'Marten', 'Elk', 'Crow', 'Hare', 'Mink'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = D;
  } else {
    globalThis.PF_DATA = D;
  }
})();
