(function () {
  'use strict';
  const D = {};

  D.TITLE = '允望樂園';
  D.TITLE_EN = 'Yunwang Paradise';
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
  D.SLOTS_BAG = 3;

  D.VIEW_H = 1000;
  D.MAX_ASPECT = 2.6;

  // Playable characters. The skill runs on right click or X.
  D.CHARS = {
    yunwang: {
      name: { zh: '允望', en: 'Yunwang' },
      role: { zh: '主廚', en: 'The Chef' },
      skin: '#f3c99c',
      hp: 100,
      speed: 1,
      skill: { id: 'flame', cd: 12 },
      passive: { zh: '廚神之手：所有食物與治療效果 +50%', en: "Chef's Touch: all food and healing +50%" },
      skillText: { zh: '爆炒烈焰：以鐵鍋爆出一圈火焰，造成 40 傷害並燃燒敵人，同時回復生命', en: 'Wok Flame Burst: a ring of fire deals 40 damage, sets foes on fire and heals you' }
    },
    luap: {
      name: { zh: 'Luap', en: 'Luap' },
      role: { zh: '拳擊手', en: 'The Boxer' },
      skin: '#e8b88a',
      hp: 125,
      speed: 1,
      skill: { id: 'rush', cd: 8 },
      passive: { zh: '鐵拳：空手傷害加倍、出拳更快，生命上限 125', en: 'Iron Fists: double fist damage, faster punches, 125 max health' },
      skillText: { zh: '旋風連打：向前猛衝，撞飛路上的敵人並造成 45 傷害', en: 'Whirlwind Rush: charge forward, knocking foes aside for 45 damage' }
    },
    auhsoj: {
      name: { zh: 'Auhsoj', en: 'Auhsoj' },
      role: { zh: '工程師', en: 'The Engineer' },
      skin: '#f0c495',
      hp: 100,
      speed: 1,
      skill: { id: 'turret', cd: 18 },
      passive: { zh: '快手裝填：換彈速度快 40%', en: 'Quick Hands: reload 40% faster' },
      skillText: { zh: '自動砲台：架設一座砲台，自動射擊附近的敵人 10 秒', en: 'Sentry Turret: deploy a turret that shoots nearby foes for 10 seconds' }
    },
    meibao: {
      name: { zh: 'Meibao', en: 'Meibao' },
      role: { zh: '甜點師', en: 'The Pastry Chef' },
      skin: '#f6d2b0',
      hp: 100,
      speed: 1.12,
      skill: { id: 'boba', cd: 14 },
      passive: { zh: '輕盈步伐：移動速度 +12%，體力回復 +50%', en: 'Light Steps: +12% move speed, +50% stamina regeneration' },
      skillText: { zh: '珍奶補給：喝一杯珍珠奶茶，回復 30 生命、補滿體力並加速 5 秒', en: 'Boba Boost: drink a bubble tea to heal 30, refill stamina and run faster for 5 seconds' }
    }
  };
  D.CHAR_IDS = ['yunwang', 'luap', 'auhsoj', 'meibao'];

  // Enemy types used in story chapters.
  D.FOES = {
    thug: { name: { zh: '鹹水幫嘍囉', en: 'Brine Gang Thug' }, hp: 60, r: 24 },
    elite: { name: { zh: '鹹水幫打手', en: 'Brine Gang Bruiser' }, hp: 100, r: 26 },
    boss: { name: { zh: '鹹魚船長', en: 'Captain Salted Fish' }, hp: 2000, r: 36 }
  };

  // Melee weapons have no magazine. Guns and thrown kitchenware reload from an unlimited reserve.
  // Rare weapons are kitchen tools that hit harder; kb is knockback.
  D.WEAPONS = {
    fists: { name: { zh: '拳頭', en: 'Fists' }, melee: true, dmg: 16, delay: 0.35, range: 46, arc: 0.9, kb: 70 },
    knife: { name: { zh: '小刀', en: 'Knife' }, melee: true, dmg: 28, delay: 0.32, range: 56, arc: 0.85, kb: 60, color: '#c9d1d6' },
    pan: { name: { zh: '平底鍋', en: 'Frying Pan' }, rare: true, melee: true, dmg: 55, delay: 0.5, range: 64, arc: 1.0, kb: 300, snd: 'bonk' },
    cleaver: { name: { zh: '菜刀', en: 'Cleaver' }, rare: true, melee: true, dmg: 46, delay: 0.3, range: 58, arc: 0.85, kb: 90, snd: 'chop' },
    rollingpin: { name: { zh: '擀麵棍', en: 'Rolling Pin' }, rare: true, melee: true, dmg: 40, delay: 0.42, range: 80, arc: 1.25, kb: 400, snd: 'thud' },
    wok: { name: { zh: '中華炒鍋', en: 'Wok' }, rare: true, melee: true, dmg: 60, delay: 0.6, range: 70, arc: 1.3, kb: 220, burn: { dps: 7, t: 3 }, snd: 'bonk' },
    swordfish: { name: { zh: '冷凍旗魚', en: 'Frozen Swordfish' }, rare: true, legendary: true, melee: true, dmg: 80, delay: 0.75, range: 98, arc: 1.0, kb: 260, slow: { mul: 0.55, t: 2.5 }, snd: 'chop' },
    pistol: { name: { zh: '手槍', en: 'Pistol' }, mag: 12, dmg: 18, delay: 0.22, spread: 3, speed: 1700, range: 750, reload: 1.2, move: 1.0, pellets: 1, len: 26, wid: 9, color: '#4a4a4a' },
    uzi: { name: { zh: '衝鋒槍', en: 'Uzi' }, mag: 25, dmg: 11, delay: 0.08, spread: 7, speed: 1700, range: 600, reload: 1.5, move: 1.0, pellets: 1, len: 32, wid: 10, color: '#3f4650' },
    shotgun: { name: { zh: '霰彈槍', en: 'Shotgun' }, mag: 6, dmg: 9, delay: 0.8, spread: 10, speed: 1450, range: 380, reload: 2.0, move: 0.95, pellets: 8, falloff: 0.55, len: 50, wid: 10, color: '#7a4b2a' },
    rifle: { name: { zh: '步槍', en: 'Assault Rifle' }, mag: 30, dmg: 16, delay: 0.11, spread: 3.5, speed: 2100, range: 950, reload: 2.0, move: 0.95, pellets: 1, len: 54, wid: 10, color: '#3e4a36' },
    sniper: { name: { zh: '狙擊槍', en: 'Sniper' }, mag: 5, dmg: 75, delay: 1.2, spread: 0.3, speed: 3000, range: 1600, reload: 2.6, move: 0.9, pellets: 1, len: 70, wid: 9, color: '#2f3a44' },
    minigun: { name: { zh: '機槍', en: 'Machine Gun' }, mag: 60, dmg: 13, delay: 0.075, spread: 6, speed: 2000, range: 850, reload: 3.4, move: 0.82, pellets: 1, len: 58, wid: 14, color: '#55504a' },
    chopsticks: { name: { zh: '飛筷', en: 'Chopsticks' }, rare: true, thrown: true, mag: 24, dmg: 17, delay: 0.09, spread: 3, speed: 1800, range: 720, reload: 1.3, move: 1.0, pellets: 1, proj: 'chop', pierce: 1, len: 30, wid: 6 },
    bowl: { name: { zh: '飛碗', en: 'Flying Bowl' }, rare: true, thrown: true, mag: 6, dmg: 38, delay: 0.42, spread: 1, speed: 1150, range: 950, reload: 1.8, move: 1.0, pellets: 1, proj: 'bowl', bounce: 2, len: 26, wid: 26 },
    harpoon: { name: { zh: '魚叉槍', en: 'Harpoon Gun' }, rare: true, mag: 3, dmg: 34, delay: 0.9, spread: 1, speed: 950, range: 1000, reload: 2.2, move: 0.95, pellets: 1, proj: 'harpoon', kb: 380, len: 64, wid: 12, color: '#5b6b78' },
    turret: { name: { zh: '砲台', en: 'Turret' }, dmg: 12, speed: 1900, range: 650, proj: 'turret' }
  };

  D.ITEMS = {
    soup: { name: { zh: '雞湯', en: 'Chicken Soup' }, heal: 60, time: 1.6 },
    bao: { name: { zh: '小籠包', en: 'Soup Dumplings' }, heal: 40 },
    bag: { name: { zh: '保溫外送袋', en: 'Thermal Bag' } },
    coldbox: { name: { zh: '冷鏈箱', en: 'Cold-Chain Crate' } }
  };

  // item, weight in a normal spawn, weight in an ingredient crate
  D.LOOT = [
    ['pistol', 16, 5],
    ['uzi', 12, 9],
    ['shotgun', 11, 9],
    ['rifle', 9, 12],
    ['sniper', 3, 6],
    ['minigun', 2, 5],
    ['knife', 8, 2],
    ['pan', 2.4, 6],
    ['cleaver', 2.2, 6],
    ['rollingpin', 2, 5],
    ['wok', 1.2, 4],
    ['chopsticks', 2, 5],
    ['bowl', 1.6, 5],
    ['swordfish', 0.3, 1.4],
    ['soup', 12, 14],
    ['bao', 12, 8],
    ['bag', 3, 6]
  ];

  D.VEHICLES = {
    car: { name: { zh: '小貨車', en: 'Delivery Van' }, r: 46, len: 124, wid: 70, max: 720, accel: 500, rev: 240, turn: 2.3, hp: 350, ram: 0.11 },
    bike: { name: { zh: '外送機車', en: 'Delivery Scooter' }, r: 26, len: 78, wid: 26, max: 820, accel: 650, rev: 160, turn: 3.1, hp: 150, ram: 0.07 }
  };

  // The cold-chain zone shrinks with the share of players still alive, and on a timer after timeStart.
  D.ZONE = { startFrac: 0.72, minFrac: 0.04, speed: 40, timeStart: 90, timeDur: 330, dps: 20 };

  D.OBST = {
    tree: { solid: true, blk: true, hp: 0 },
    bamboo: { solid: true, blk: true, hp: 0 },
    bush: { solid: false, blk: false, hp: 0 },
    rock: { solid: true, blk: true, hp: 0 },
    crate: { solid: true, blk: true, hp: 70 },
    wall: { solid: true, blk: true, hp: 0 },
    table: { solid: true, blk: false, hp: 0 },
    stove: { solid: true, blk: true, hp: 0 },
    lantern: { solid: true, blk: false, hp: 0 },
    container: { solid: true, blk: true, hp: 0 }
  };

  D.BOT_SKILL = {
    easy: { react: 0.4, aimNoise: 0.16, turn: 5, sight: 650, lead: 0.3, shootAngle: 0.16 },
    normal: { react: 0.27, aimNoise: 0.085, turn: 8, sight: 800, lead: 0.6, shootAngle: 0.12 },
    hard: { react: 0.16, aimNoise: 0.04, turn: 13, sight: 950, lead: 0.9, shootAngle: 0.08 }
  };

  // Story chapters. Enemies spawn on team 2 (Brine Gang); the hero and allies are team 1.
  D.STORY = [
    {
      id: 'ch1',
      seed: 101,
      start: 'restaurant',
      goal: { type: 'kill', count: 3 },
      enemies: [{ kind: 'thug', n: 3, weapons: ['fists'], dist: [520, 760], stagger: 7 }],
      gifts: [{ t: 'pan', d: 110 }, { t: 'knife', d: 140 }, { t: 'bao', d: 170 }],
      crates: 2,
      hunt: 700,
      tips: true
    },
    {
      id: 'ch2',
      seed: 202,
      start: 'restaurant',
      goal: { type: 'collect', count: 5, time: 170 },
      enemies: [{ kind: 'thug', n: 8, weapons: ['knife', 'pistol', 'uzi', 'fists'], near: 'boxes' }, { kind: 'elite', n: 2, weapons: ['shotgun', 'rifle'], near: 'boxes' }],
      gifts: [{ t: 'pistol', d: 120 }, { t: 'soup', d: 150 }],
      hunt: 450
    },
    {
      id: 'ch3',
      seed: 303,
      start: 'restaurant',
      goal: { type: 'survive', time: 120 },
      waves: { every: 15, n: [2, 2, 3, 3, 4, 4, 5, 5], kinds: [['thug', ['knife', 'pistol', 'uzi']], ['elite', ['shotgun', 'rifle', 'uzi']]] },
      allies: 1,
      gifts: [{ t: 'rifle', d: 120 }, { t: 'soup', d: 150 }, { t: 'bowl', d: 180 }],
      hunt: 99999
    },
    {
      id: 'ch4',
      seed: 404,
      start: 'random',
      goal: { type: 'eliminate' },
      enemies: [{ kind: 'thug', n: 7, weapons: ['pistol', 'uzi', 'knife', 'shotgun'] }, { kind: 'elite', n: 2, weapons: ['rifle', 'shotgun', 'minigun'] }],
      zone: { timeStart: 25, timeDur: 200 },
      gifts: [{ t: 'rifle', d: 110 }, { t: 'soup', d: 140 }, { t: 'pan', d: 170 }],
      hunt: 650
    },
    {
      id: 'ch5',
      seed: 505,
      start: 'yard',
      goal: { type: 'boss' },
      enemies: [{ kind: 'boss', n: 1, weapons: ['harpoon'], near: 'yard' }, { kind: 'thug', n: 2, weapons: ['pistol', 'knife'], near: 'yard' }],
      waves: { first: 14, every: 16, n: [2, 2, 3, 3, 3, 4, 4, 4], kinds: [['thug', ['pistol', 'uzi', 'knife']], ['elite', ['shotgun', 'rifle']]], near: 'yard' },
      allies: 3,
      gifts: [{ t: 'rifle', d: 110 }, { t: 'soup', d: 140 }, { t: 'pan', d: 170 }],
      hunt: 99999
    }
  ];

  D.SKIN_FOE = { thug: '#e9b98c', elite: '#d9a273', boss: '#c79a7a' };
  D.ROOFS = ['#c9533f', '#4f7fc9', '#8a6bc9', '#d89a3a', '#3fa58b', '#b8567f'];
  D.FLOORS = ['#d8b07a', '#c9c2b2', '#c79a6c'];

  D.BOT_NAMES_A = ['Silent', 'Mossy', 'Rapid', 'Grim', 'Lucky', 'Frosty', 'Rusty', 'Shadow', 'Swift', 'Crimson', 'Lone', 'Iron', 'Wild', 'Dusty', 'Sly', 'Bold', 'Feral', 'Quiet', 'Amber', 'Stormy'];
  D.BOT_NAMES_B = ['Dumpling', 'Noodle', 'Tofu', 'Wonton', 'Bao', 'Mango', 'Lychee', 'Sesame', 'Pepper', 'Ginger', 'Radish', 'Taro', 'Melon', 'Scallion', 'Peanut', 'Mochi', 'Lotus', 'Shrimp', 'Squid', 'Kelp'];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = D;
  } else {
    globalThis.PF_DATA = D;
  }
})();
