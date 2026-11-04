(function () {
  'use strict';
  const D = {};

  D.TITLE = 'Pinefall';
  D.MAP_SIZE = 4000;
  D.PLAYER_R = 24;
  D.MAX_HP = 100;
  D.TICK_RATE = 30;

  D.SPEED = 250;
  D.SPRINT_MUL = 1.45;
  D.STAMINA_DRAIN = 30;
  D.STAMINA_REGEN = 22;
  D.JUMP_TIME = 0.36;
  D.JUMP_MUL = 2.3;
  D.JUMP_COOL = 1.4;

  D.ITEM_R = 22;
  D.PICKUP_RANGE = 70;
  D.SLOTS = 2;
  D.SLOTS_BACKPACK = 3;

  D.VIEW_H = 1000;
  D.MAX_ASPECT = 2.6;

  // Melee weapons have no magazine. Guns reload from an unlimited reserve.
  D.WEAPONS = {
    fists: { name: 'Fists', melee: true, dmg: 16, delay: 0.35, range: 46, arc: 0.9 },
    knife: { name: 'Knife', melee: true, dmg: 30, delay: 0.32, range: 56, arc: 0.85, color: '#c9d1d6' },
    sword: { name: 'Sword', melee: true, dmg: 45, delay: 0.55, range: 82, arc: 1.2, color: '#dfe6ea' },
    pistol: { name: 'Pistol', mag: 12, dmg: 18, delay: 0.22, spread: 3, speed: 1700, range: 750, reload: 1.2, move: 1.0, pellets: 1, len: 26, wid: 9, color: '#4a4a4a' },
    uzi: { name: 'Uzi', mag: 25, dmg: 11, delay: 0.08, spread: 7, speed: 1700, range: 600, reload: 1.5, move: 1.0, pellets: 1, len: 32, wid: 10, color: '#3f4650' },
    shotgun: { name: 'Shotgun', mag: 6, dmg: 9, delay: 0.8, spread: 10, speed: 1450, range: 380, reload: 2.0, move: 0.95, pellets: 8, len: 50, wid: 10, color: '#7a4b2a' },
    rifle: { name: 'Assault Rifle', mag: 30, dmg: 16, delay: 0.11, spread: 3.5, speed: 2100, range: 950, reload: 2.0, move: 0.95, pellets: 1, len: 54, wid: 10, color: '#3e4a36' },
    sniper: { name: 'Sniper', mag: 5, dmg: 75, delay: 1.2, spread: 0.3, speed: 3000, range: 1600, reload: 2.6, move: 0.9, pellets: 1, len: 70, wid: 9, color: '#2f3a44' },
    minigun: { name: 'Machine Gun', mag: 60, dmg: 13, delay: 0.075, spread: 6, speed: 2000, range: 850, reload: 3.4, move: 0.82, pellets: 1, len: 58, wid: 14, color: '#55504a' }
  };

  D.SYRINGE = { name: 'Syringe', heal: 60, time: 1.6 };
  D.MEDPACK = { name: 'Health Pack', heal: 40 };
  D.BACKPACK = { name: 'Backpack' };

  // weight of each item in a normal spawn and in a mystery crate
  D.LOOT = [
    ['pistol', 16, 6],
    ['uzi', 12, 10],
    ['shotgun', 11, 10],
    ['rifle', 9, 13],
    ['sniper', 3, 7],
    ['minigun', 2, 6],
    ['knife', 8, 2],
    ['sword', 5, 3],
    ['syringe', 12, 14],
    ['medpack', 12, 8],
    ['backpack', 3, 6]
  ];

  D.VEHICLES = {
    car: { name: 'Car', r: 46, len: 124, wid: 70, max: 720, accel: 500, rev: 240, turn: 2.3, hp: 350, ram: 0.11 },
    bike: { name: 'Motorbike', r: 26, len: 78, wid: 26, max: 820, accel: 650, rev: 160, turn: 3.1, hp: 150, ram: 0.07 }
  };

  // The safe area shrinks with the share of players still alive, and on a timer once timeStart passes.
  D.ZONE = { startFrac: 0.72, minFrac: 0.04, speed: 40, timeStart: 90, timeDur: 330, dps: 20 };

  D.OBST = {
    tree: { solid: true, blk: true, hp: 0 },
    bush: { solid: false, blk: false, hp: 0 },
    rock: { solid: true, blk: true, hp: 0 },
    crate: { solid: true, blk: true, hp: 70 },
    wall: { solid: true, blk: true, hp: 0 }
  };

  D.BOT_SKILL = {
    easy: { react: 0.4, aimNoise: 0.16, turn: 5, sight: 650, lead: 0.3, shootAngle: 0.16 },
    normal: { react: 0.27, aimNoise: 0.085, turn: 8, sight: 800, lead: 0.6, shootAngle: 0.12 },
    hard: { react: 0.16, aimNoise: 0.04, turn: 13, sight: 950, lead: 0.9, shootAngle: 0.08 }
  };

  D.SKINS = ['#f7c873', '#ef7b6b', '#6bb8ef', '#8fd46f', '#c99bf0', '#f4f1e8', '#f59e57', '#62dcc6'];
  D.ROOFS = ['#d4604c', '#5a8fd8', '#9a74d1', '#e0a63c', '#4fb39a', '#c46aa0'];
  D.FLOORS = ['#d8b07a', '#c9c2b2', '#c79a6c'];

  D.BOT_NAMES_A = ['Silent', 'Mossy', 'Rapid', 'Grim', 'Lucky', 'Frosty', 'Rusty', 'Shadow', 'Swift', 'Crimson', 'Lone', 'Iron', 'Wild', 'Dusty', 'Sly', 'Bold', 'Feral', 'Quiet', 'Amber', 'Stormy'];
  D.BOT_NAMES_B = ['Fox', 'Pine', 'Badger', 'Hawk', 'Wolf', 'Otter', 'Raven', 'Moose', 'Lynx', 'Bear', 'Boar', 'Owl', 'Stag', 'Viper', 'Heron', 'Marten', 'Elk', 'Crow', 'Hare', 'Mink'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = D;
  } else {
    globalThis.PF_DATA = D;
  }
})();
