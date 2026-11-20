(function () {
  'use strict';
  const D = {};

  D.TITLE = '允望樂園';
  D.TITLE_EN = 'Yunwang Paradise';
  D.MAP_SIZE = 4000;
  D.PLAYER_R = 24;
  // A person's mass relative to a delivery van (about 75 kg against 1500 kg).
  D.PLAYER_MASS = 0.05;
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
  // Everyone carries a backpack (3 weapon slots); the thermal bag upgrades it to 4.
  D.SLOTS = 3;
  D.SLOTS_BAG = 4;
  // Chicken soup lives in a separate medical pouch, not in weapon slots: [normal, with thermal bag].
  D.SOUP_CAP = [3, 5];

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
    },
    afeng: {
      name: { zh: '阿風', en: 'Afeng' },
      role: { zh: '外送員', en: 'The Delivery Rider' },
      skin: '#e9be92',
      hp: 95,
      speed: 1.08,
      skill: { id: 'parcel', cd: 10 },
      passive: { zh: '外送達人：開車時快 20%，奔跑耗體力少 30%', en: 'Express Rider: vehicles 20% faster while you drive, running costs 30% less stamina' },
      skillText: { zh: '包裹炸彈：丟出一個包裹，落地爆炸造成 55 傷害', en: 'Parcel Bomb: throw a parcel that explodes where it lands for 55 damage' }
    },
    bubbles: {
      name: { zh: '小泡', en: 'Bubbles' },
      role: { zh: '洗碗工', en: 'The Dishwasher' },
      skin: '#f1c9a5',
      hp: 110,
      speed: 1,
      skill: { id: 'bubble', cd: 14 },
      passive: { zh: '滑溜溜：被擊退的距離減半', en: 'Slippery: knockback on you is halved' },
      skillText: { zh: '泡泡護盾：你和附近隊友獲得能吸收 50 傷害的泡泡，持續 5 秒', en: 'Bubble Guard: you and nearby teammates get a bubble that absorbs 50 damage for 5 seconds' }
    },
    jinjin: {
      name: { zh: '金金', en: 'Jinjin' },
      role: { zh: '收銀員', en: 'The Cashier' },
      skin: '#f5cfa8',
      hp: 90,
      speed: 1.04,
      skill: { id: 'coins', cd: 9 },
      passive: { zh: '找零：擊倒的敵人會多掉一個小籠包', en: 'Keep the Change: foes you knock out drop an extra soup dumpling' },
      skillText: { zh: '零錢雨：扇形丟出 7 枚硬幣，每枚 15 傷害', en: 'Coin Shower: fling 7 coins in a fan, 15 damage each' }
    },
    bing: {
      name: { zh: '冰師傅', en: 'Master Bing' },
      role: { zh: '冷藏庫師傅', en: 'The Cold-Room Master' },
      skin: '#f0d0b4',
      hp: 115,
      speed: 0.96,
      skill: { id: 'freeze', cd: 13 },
      passive: { zh: '耐寒：不會被減速，退冰區傷害 -30%', en: 'Cold Blooded: never slowed, 30% less damage from the thaw zone' },
      skillText: { zh: '急凍霧：放出冷霧，附近敵人受到 20 傷害並減速一半 3 秒', en: 'Flash Freeze: a cold fog deals 20 damage and halves nearby foes\' speed for 3 seconds' }
    }
  };
  D.CHAR_IDS = ['yunwang', 'luap', 'auhsoj', 'meibao', 'afeng', 'bubbles', 'jinjin', 'bing'];
  // The original restaurant crew, who appear as allies in the story.
  D.CORE_IDS = ['yunwang', 'luap', 'auhsoj', 'meibao'];

  // Character levels 1 to 9 come from experience earned in matches. Each level above 1 adds 4% health and
  // damage. Kitchen gadgets unlock at level 4, signature perks at 6, Wok Overdrive at 8.
  D.LEVELS = { max: 9, step: 0.04, gadget: 4, perk: 6, overdrive: 8 };
  // Experience needed to reach a level: 30 * L * (L - 1), so level 9 takes 2160.
  D.levelForXp = function (xp) {
    let L = 1;
    while (L < D.LEVELS.max && 30 * (L + 1) * L <= xp) L++;
    return L;
  };
  D.xpForLevel = function (L) {
    return 30 * L * (L - 1);
  };
  // Keeps only what the character may use at that level (also used by the LAN server on what clients send).
  D.validLoadout = function (char, level, gadget, perk) {
    const lv = Math.max(1, Math.min(D.LEVELS.max, Math.round(Number(level) || 1)));
    const ok = (tbl, id, need) => (tbl[id] && tbl[id].char === char && lv >= need ? id : '');
    return { level: lv, gadget: ok(D.GADGETS, gadget, D.LEVELS.gadget), perk: ok(D.PERKS, perk, D.LEVELS.perk) };
  };

  // Kitchen gadgets: three uses a match, a few seconds apart. Two to choose from per character.
  D.GADGET_USES = 3;
  D.GADGET_CD = 6;
  D.GADGETS = {
    chili: { char: 'yunwang', name: { zh: '辣油潑灑', en: 'Chili Splash' }, text: { zh: '潑出辣油，燒灼身邊的敵人 3 秒', en: 'Splash chili oil that burns nearby foes for 3 seconds' } },
    taste: { char: 'yunwang', name: { zh: '試吃一口', en: 'Taste Test' }, text: { zh: '立刻回復 40 生命', en: 'Heal 40 at once' } },
    guard: { char: 'luap', name: { zh: '護齒', en: 'Mouthguard' }, text: { zh: '3 秒內受到的傷害減少 60%', en: 'Take 60% less damage for 3 seconds' } },
    second: { char: 'luap', name: { zh: '第二回合', en: 'Second Wind' }, text: { zh: '技能冷卻時間立刻減半', en: 'Halve your skill cooldown at once' } },
    mine: { char: 'auhsoj', name: { zh: '遙控地雷', en: 'Remote Mine' }, text: { zh: '放下一顆地雷，敵人靠近就爆炸，造成 70 傷害', en: 'Drop a mine that blows up for 70 when a foe comes near' } },
    overclock: { char: 'auhsoj', name: { zh: '超頻', en: 'Overclock' }, text: { zh: '你的砲台射速加倍', en: 'Your turrets fire twice as fast' } },
    pearls: { char: 'meibao', name: { zh: '珍珠滿地', en: 'Pearl Spill' }, text: { zh: '撒出珍珠，附近敵人減速 3 秒', en: 'Spill tapioca pearls that slow nearby foes for 3 seconds' } },
    sugar: { char: 'meibao', name: { zh: '糖霜衝刺', en: 'Sugar Rush' }, text: { zh: '補滿體力並加速 2.5 秒', en: 'Refill stamina and run faster for 2.5 seconds' } },
    swerve: { char: 'afeng', name: { zh: '急轉彎', en: 'Swerve' }, text: { zh: '朝移動方向快速滑行一段距離', en: 'Slide a long way in the direction you are moving' } },
    extra: { char: 'afeng', name: { zh: '加點小菜', en: 'Extra Order' }, text: { zh: '腳邊掉出一碗雞湯和一籠小籠包', en: 'Drop a chicken soup and soup dumplings at your feet' } },
    soap: { char: 'bubbles', name: { zh: '肥皂滑倒', en: 'Soap Slick' }, text: { zh: '把附近的敵人滑開推遠', en: 'Send nearby foes sliding away' } },
    rinse: { char: 'bubbles', name: { zh: '沖洗乾淨', en: 'Rinse' }, text: { zh: '清除燃燒與減速，回復 25 生命', en: 'Wash off burning and slowing, heal 25' } },
    refund: { char: 'jinjin', name: { zh: '退款', en: 'Refund' }, text: { zh: '所有槍枝立刻裝滿子彈', en: 'Refill every gun you carry at once' } },
    rain: { char: 'jinjin', name: { zh: '撒錢', en: 'Make It Rain' }, text: { zh: '朝四面八方撒出 12 枚硬幣', en: 'Throw 12 coins in every direction' } },
    nova: { char: 'bing', name: { zh: '冰爆', en: 'Frost Nova' }, text: { zh: '身邊的敵人被凍住 1 秒', en: 'Freeze nearby foes in place for 1 second' } },
    icepack: { char: 'bing', name: { zh: '冰敷', en: 'Ice Pack' }, text: { zh: '回復 30 生命並清除燃燒', en: 'Heal 30 and put out burning' } }
  };

  // Signature perks: always-on upgrades. Two to choose from per character.
  D.PERKS = {
    fierce: { char: 'yunwang', name: { zh: '猛火快炒', en: 'Fierce Fire' }, text: { zh: '爆炒烈焰範圍 +30%', en: 'Wok Flame Burst reaches 30% further' } },
    slurp: { char: 'yunwang', name: { zh: '喝湯神速', en: 'Quick Slurp' }, text: { zh: '喝雞湯的時間減半', en: 'Drink chicken soup twice as fast' } },
    chin: { char: 'luap', name: { zh: '鐵下巴', en: 'Iron Chin' }, text: { zh: '生命上限 +20%', en: '+20% max health' } },
    haymaker: { char: 'luap', name: { zh: '重拳', en: 'Haymaker' }, text: { zh: '旋風連打傷害 +50% 並讓敵人減速', en: 'Whirlwind Rush deals 50% more and slows foes' } },
    twin: { char: 'auhsoj', name: { zh: '雙砲台', en: 'Twin Sentries' }, text: { zh: '砲台一次架兩座', en: 'Deploy two turrets at once' } },
    ap: { char: 'auhsoj', name: { zh: '穿甲彈', en: 'AP Rounds' }, text: { zh: '砲台傷害 +40%', en: 'Turrets deal 40% more damage' } },
    double: { char: 'meibao', name: { zh: '雙倍珍珠', en: 'Double Pearls' }, text: { zh: '珍奶補給回復 30 → 60', en: 'Boba Boost heals 60 instead of 30' } },
    feather: { char: 'meibao', name: { zh: '凌波微步', en: 'Featherfoot' }, text: { zh: '移動速度再 +8%', en: 'Another 8% move speed' } },
    bigbox: { char: 'afeng', name: { zh: '大包裹', en: 'Big Box' }, text: { zh: '包裹爆炸範圍 +35%', en: 'Parcel blasts are 35% wider' } },
    tip: { char: 'afeng', name: { zh: '小費', en: 'Tip Jar' }, text: { zh: '每擊倒一個敵人回復 25 生命', en: 'Heal 25 for each foe you knock out' } },
    thick: { char: 'bubbles', name: { zh: '厚泡泡', en: 'Thick Suds' }, text: { zh: '泡泡吸收量 50 → 90', en: 'Bubbles absorb 90 instead of 50' } },
    wide: { char: 'bubbles', name: { zh: '泡泡漫延', en: 'Wide Foam' }, text: { zh: '泡泡護盾範圍擴大 50%', en: 'Bubble Guard reaches 50% further' } },
    bills: { char: 'jinjin', name: { zh: '大鈔', en: 'Big Bills' }, text: { zh: '零錢雨 7 → 11 枚', en: 'Coin Shower throws 11 coins instead of 7' } },
    jackpot: { char: 'jinjin', name: { zh: '發財', en: 'Jackpot' }, text: { zh: '零錢雨每枚 +5 傷害', en: 'Coin Shower coins deal 5 more each' } },
    deep: { char: 'bing', name: { zh: '深度冷凍', en: 'Deep Freeze' }, text: { zh: '急凍霧的減速 3 → 5 秒', en: 'Flash Freeze slows for 5 seconds instead of 3' } },
    brittle: { char: 'bing', name: { zh: '冰脆', en: 'Brittle' }, text: { zh: '對被減速的敵人傷害 +25%', en: '25% more damage to slowed foes' } }
  };

  // Wok Overdrive: dealing damage fills the meter; once full, 6 seconds of more speed and damage, less
  // damage taken, a ready skill, and a stronger version of that skill.
  D.OVERDRIVE = { need: 260, time: 6, speed: 1.2, dmg: 1.15, taken: 0.85 };
  D.OVERDRIVE_SKILL = {
    yunwang: { name: { zh: '滿鍋烈焰', en: 'Wok Inferno' }, text: { zh: '烈焰範圍 +40%，傷害 55', en: 'Flame Burst 40% wider, 55 damage' } },
    luap: { name: { zh: '颶風連打', en: 'Hurricane Rush' }, text: { zh: '衝刺距離與傷害 +40%', en: 'Rush 40% longer and stronger' } },
    auhsoj: { name: { zh: '砲台風暴', en: 'Turret Storm' }, text: { zh: '一次架三座砲台，持續 14 秒', en: 'Three turrets at once, lasting 14 seconds' } },
    meibao: { name: { zh: '全糖派對', en: 'Sugar Party' }, text: { zh: '珍奶也回復附近隊友，加速 7 秒', en: 'Boba Boost also heals nearby teammates, 7 seconds of speed' } },
    afeng: { name: { zh: '連環包裹', en: 'Parcel Barrage' }, text: { zh: '一次丟出三個包裹', en: 'Throw three parcels at once' } },
    bubbles: { name: { zh: '泡泡風暴', en: 'Foam Storm' }, text: { zh: '泡泡吸收 120，並推開附近敵人', en: 'Bubbles absorb 120 and push nearby foes away' } },
    jinjin: { name: { zh: '金庫大開', en: 'Vault Open' }, text: { zh: '一次丟出 14 枚 20 傷害的硬幣', en: '14 coins at 20 damage each' } },
    bing: { name: { zh: '冷鏈全開', en: 'Full Cold Chain' }, text: { zh: '冷霧範圍 +40%，減速 70%', en: 'Fog 40% wider, slows by 70%' } }
  };

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
    turret: { name: { zh: '砲台', en: 'Turret' }, dmg: 12, speed: 1900, range: 650, proj: 'turret' },
    coin: { name: { zh: '零錢雨', en: 'Coin Shower' }, dmg: 15, speed: 1500, range: 560, proj: 'coin' }
  };

  D.ITEMS = {
    soup: { name: { zh: '雞湯', en: 'Chicken Soup' }, heal: 60, time: 1.6 },
    bao: { name: { zh: '小籠包', en: 'Soup Dumplings' }, heal: 40 },
    bag: { name: { zh: '保溫外送袋', en: 'Thermal Bag' } },
    coldbox: { name: { zh: '冷鏈箱', en: 'Cold-Chain Crate' } },
    scope2: { name: { zh: '2倍鏡', en: '2x Scope' }, lv: 2 },
    scope4: { name: { zh: '4倍鏡', en: '4x Scope' }, lv: 4 },
    scope8: { name: { zh: '8倍鏡', en: '8x Scope' }, lv: 8 }
  };

  // Fighting back pays: this share of the damage a fighter deals to opponents comes back as health.
  D.LIFESTEAL = 0.1;

  // A scope widens how much of the map you see: zoom multiplies the view height (and the width with it).
  D.SCOPE_ZOOM = { 1: 1, 2: 1.2, 4: 1.4, 8: 1.65 };

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
    ['bag', 3, 6],
    ['scope2', 8, 5],
    ['scope4', 4.5, 5],
    ['scope8', 1.5, 3.5]
  ];

  // Vehicles: max is top speed (air drag balances the engine there), grip the sideways acceleration the tyres
  // can hold, turnR the tightest turning circle at low speed, mass relative to a van.
  D.VEHICLES = {
    car: { name: { zh: '小貨車', en: 'Delivery Van' }, r: 46, len: 124, wid: 70, max: 720, accel: 500, rev: 240, turn: 2.3, hp: 350, ram: 0.11, mass: 1, grip: 1500, brake: 1000, turnR: 130 },
    bike: { name: { zh: '外送機車', en: 'Delivery Scooter' }, r: 26, len: 78, wid: 26, max: 820, accel: 650, rev: 160, turn: 3.1, hp: 150, ram: 0.07, mass: 0.4, grip: 1700, brake: 1100, turnR: 80 }
  };

  // The cold-chain zone shrinks with the share of players still alive, and on a timer after timeStart.
  D.ZONE = { startFrac: 0.72, minFrac: 0.04, speed: 40, timeStart: 90, timeDur: 330, dps: 20 };

  // Plank wall health: base plus per pixel of wall length (a 100 px piece takes about 170).
  D.PLANK_HP = [80, 0.9];

  D.OBST = {
    tree: { solid: true, blk: true, hp: 0 },
    bamboo: { solid: true, blk: true, hp: 0 },
    bush: { solid: false, blk: false, hp: 0 },
    rock: { solid: true, blk: true, hp: 0 },
    crate: { solid: true, blk: true, hp: 70 },
    wall: { solid: true, blk: true, hp: 0 },
    plank: { solid: true, blk: true, hp: 1 },
    table: { solid: true, blk: false, hp: 0 },
    stove: { solid: true, blk: true, hp: 0 },
    lantern: { solid: true, blk: false, hp: 0 },
    board: { solid: true, blk: false, hp: 0 },
    container: { solid: true, blk: true, hp: 0 }
  };

  // Difficulty levels 1 to 5; 3, 4 and 5 are the earlier easy, normal and hard.
  // foeDmg: story enemy damage to the hero team. foeHp: story enemy health.
  // botDmg: bot damage to people in Paradise Brawl. foeFire: story enemy fire-delay multiplier.
  // botFire: fire-delay multiplier for Paradise Brawl bots.
  D.BOT_SKILL = {
    1: { react: 0.7, aimNoise: 0.32, turn: 3.2, sight: 480, lead: 0, shootAngle: 0.24, foeDmg: 0.2, foeHp: 0.6, botDmg: 0.55, foeFire: 1.35, botFire: 1.6 },
    2: { react: 0.55, aimNoise: 0.24, turn: 4, sight: 560, lead: 0.15, shootAngle: 0.2, foeDmg: 0.27, foeHp: 0.7, botDmg: 0.75, foeFire: 1.15, botFire: 1.3 },
    3: { react: 0.4, aimNoise: 0.16, turn: 5, sight: 650, lead: 0.3, shootAngle: 0.16, foeDmg: 0.35, foeHp: 0.8, botDmg: 1, foeFire: 1, botFire: 1 },
    4: { react: 0.27, aimNoise: 0.085, turn: 8, sight: 800, lead: 0.6, shootAngle: 0.12, foeDmg: 0.42, foeHp: 1, botDmg: 1, foeFire: 1, botFire: 1 },
    5: { react: 0.16, aimNoise: 0.04, turn: 13, sight: 950, lead: 0.9, shootAngle: 0.08, foeDmg: 0.7, foeHp: 1.25, botDmg: 1, foeFire: 1, botFire: 1 }
  };
  D.DIFF_LEVELS = [1, 2, 3, 4, 5];
  D.TEAM_MODES = ['ffa', 'teams', 'coop'];
  // Coop matches: seconds before a fallen person returns next to a family member.
  D.RESPAWN_TIME = 6;
  // In coop every bot is after the family, so bots hit people this much softer than in a free-for-all.
  D.COOP_BOT_DMG = 0.75;
  D.DIFF_DEFAULT = 4;
  // Saved settings and server flags from before the levels used names.
  const DIFF_NAMES = { easy: 3, normal: 4, hard: 5 };
  // Returns the level 1..5 for a level or legacy name, or 0 when it is not one.
  D.diffLevel = function (v) {
    if (typeof v === 'string' && DIFF_NAMES[v]) return DIFF_NAMES[v];
    const n = Number(v);
    return D.BOT_SKILL[n] ? n : 0;
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
