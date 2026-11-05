'use strict';
const path = require('path');
const { Sim } = require(path.join(__dirname, '..', 'js', 'sim.js'));
const D = require(path.join(__dirname, '..', 'js', 'data.js'));

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.log('FAIL: ' + msg);
  } else {
    console.log('ok   ' + msg);
  }
}

function steps(sim, n) {
  for (let i = 0; i < n; i++) sim.step(1 / 30);
}

function clearAround(sim, x, y, r) {
  for (const o of sim.obstacles) {
    if (Math.hypot(o.x - x, o.y - y) < r) o.dead = true;
  }
  for (const it of [...sim.items.values()]) {
    if (Math.hypot(it.x - x, it.y - y) < r) sim.removeItem(it);
  }
  for (const v of sim.vehicles) {
    if (Math.hypot(v.x - x, v.y - y) < r) v.x += 2 * r;
  }
}

// An empty arena with two players facing each other.
function duel(charA, charB, opts) {
  const sim = new Sim({ seed: 99 });
  const a = sim.playerMap.get(sim.addPlayer('A', false, { char: charA }));
  const b = sim.playerMap.get(sim.addPlayer('B', false, { char: charB || 'yunwang' }));
  clearAround(sim, 2000, 2000, 500);
  a.x = 2000;
  a.y = 2000;
  b.x = 2000 + ((opts && opts.dist) || 60);
  b.y = 2000;
  return { sim, a, b };
}

// ---------- map ----------
{
  const sim = new Sim({ seed: 12345 });
  const kinds = {};
  for (const o of sim.obstacles) kinds[o.k] = (kinds[o.k] || 0) + 1;
  console.log('map: ' + JSON.stringify(kinds) + ' buildings=' + sim.buildings.length + ' items=' + sim.items.size + ' vehicles=' + sim.vehicles.length);
  check(sim.buildings.some(b => b.type === 'restaurant'), 'map has Yunwang Tower (restaurant) at the center');
  check(Math.hypot(sim.restaurant.x - 2000, sim.restaurant.y - 2000) < 1, 'restaurant is centered');
  check((kinds.lantern || 0) >= 8 && (kinds.container || 0) >= 4 && (kinds.bamboo || 0) >= 10 && (kinds.table || 0) === 5, 'plaza lanterns, container yard, bamboo and restaurant tables exist');
  check(sim.buildings.some(b => b.type === 'stall'), 'food stalls exist');
  check(sim.vehicles.length >= 4 && sim.items.size > 80, 'vehicles and items spawn');
  const json = JSON.stringify(sim.getMapData());
  check(json.length < 300000, 'map JSON under 300 KB (' + json.length + ')');
  check(JSON.stringify(new Sim({ seed: 12345 }).getMapData()) === json, 'same seed gives the same map');
  const rare = D.LOOT.filter(e => D.WEAPONS[e[0]] && D.WEAPONS[e[0]].rare).map(e => e[0]);
  check(['pan', 'chopsticks', 'bowl'].every(t => rare.indexOf(t) >= 0), 'pan, chopsticks and bowl are rare loot');
}

// ---------- difficulty levels ----------
{
  check(D.diffLevel('easy') === 3 && D.diffLevel('normal') === 4 && D.diffLevel('hard') === 5, 'old difficulty names map to levels 3, 4 and 5');
  check(D.diffLevel(1) === 1 && D.diffLevel('2') === 2 && D.diffLevel(0) === 0 && D.diffLevel('7') === 0 && D.diffLevel('x') === 0, 'levels 1 to 5 are accepted and other values are not');
  check(new Sim({ seed: 5 }).difficulty === D.DIFF_DEFAULT && new Sim({ seed: 5, difficulty: 'hard' }).difficulty === 5, 'sim falls back to the default level and reads old names');
  const lv = D.DIFF_LEVELS.map(n => D.BOT_SKILL[n]);
  let ordered = true;
  for (let i = 1; i < lv.length; i++) {
    if (!(lv[i].react <= lv[i - 1].react && lv[i].aimNoise <= lv[i - 1].aimNoise && lv[i].foeDmg >= lv[i - 1].foeDmg && lv[i].foeHp >= lv[i - 1].foeHp && lv[i].botDmg >= lv[i - 1].botDmg)) ordered = false;
  }
  check(ordered, 'each level is at least as hard as the one below it');
  const { sim, a } = duel('yunwang', 'luap', { dist: 200 });
  sim.setDifficulty(1);
  const botId = sim.addPlayer('', true, {});
  const bot = sim.playerMap.get(botId);
  bot.x = 2100;
  bot.y = 2100;
  const hp0 = a.hp;
  sim.damagePlayer(a, 20, botId, 'pistol');
  check(Math.abs(hp0 - a.hp - 20 * D.BOT_SKILL[1].botDmg) < 1e-9, 'level 1 bots deal ' + D.BOT_SKILL[1].botDmg + 'x damage to people in Paradise Brawl');
  sim.setDifficulty(4);
  const hp1 = a.hp;
  sim.damagePlayer(a, 20, botId, 'pistol');
  check(Math.abs(hp1 - a.hp - 20) < 1e-9, 'level 4 bots deal full damage, unchanged from before');
  check(sim.setDifficulty('nonsense') === 4, 'setDifficulty ignores invalid values');
  const st = new Sim({ mode: 'story', chapter: 'ch1', difficulty: 1 });
  const hid = st.startStory('Hero', 'luap');
  const foe = st.players.find(p => p.team === 2);
  check(foe.maxHp === Math.round(D.FOES.thug.hp * D.BOT_SKILL[1].foeHp), 'level 1 story foes have reduced health');
  const hero = st.playerMap.get(hid);
  const h0 = hero.hp;
  st.damagePlayer(hero, 50, foe.id, 'pistol');
  check(Math.abs(h0 - hero.hp - 50 * D.BOT_SKILL[1].foeDmg) < 1e-9, 'level 1 story foes deal ' + D.BOT_SKILL[1].foeDmg + 'x damage');
}

// ---------- hidden details ----------
{
  const sim = new Sim({ seed: 4242 });
  const ids = sim.secrets.map(sc => sc.id);
  check(['notice', 'log', 'recipe'].every(k => ids.indexOf(k) >= 0) && sim.gold && sim.cat, 'notice board, logbook, recipe, golden dumpling and cat are placed');
  check(sim.obstacles.some(o => o.k === 'board') && sim.getMapData().secrets.length === 3, 'notice board is an obstacle and the map data lists the static secrets');
  const kinds = {};
  for (const o of sim.obstacles) kinds[o.k] = (kinds[o.k] || 0) + 1;
  check((kinds.bush || 0) <= 90, 'fewer bushes than before (' + kinds.bush + ', was up to 190)');
  const pid = sim.addPlayer('Finder', false, { char: 'auhsoj' });
  const p = sim.playerMap.get(pid);
  const bid = sim.addPlayer('', true, {});
  const bot = sim.playerMap.get(bid);
  const gotSecret = () => {
    const out = [];
    for (const e of sim.eventsFor(pid, 0)) if (e.e === 'secret') out.push(e.id);
    return out;
  };
  const visit = (x, y) => {
    for (const it of [...sim.items.values()]) {
      if (it.t !== 'drop' && Math.hypot(it.x - x, it.y - y) < 90) sim.removeItem(it);
    }
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    sim.setInput(pid, { mx: 0, my: 0, aim: 0, shoot: false });
  };
  const notice = sim.secrets.find(sc => sc.id === 'notice');
  visit(notice.x, notice.y + 40);
  sim.pushAction(pid, { a: 'interact' });
  sim.step(1 / 30);
  check(gotSecret().indexOf('notice') >= 0, 'pressing F at the notice board reveals it');
  check(sim.promptFor(p) && sim.promptFor(p).k === 'see_notice', 'the notice board shows a read prompt');
  for (const id of ['log', 'recipe']) {
    const sc = sim.secrets.find(q => q.id === id);
    visit(sc.x, sc.y);
    sim.pushAction(pid, { a: 'interact' });
    sim.step(1 / 30);
    check(gotSecret().indexOf(id) >= 0, 'pressing F at the ' + id + ' reveals it');
  }
  const cat = sim.cat;
  cat.sitT = 10;
  visit(cat.x + 30, cat.y);
  sim.pushAction(pid, { a: 'interact' });
  sim.step(1 / 30);
  const catEv = sim.events.filter(e => e.e === 'meow').length;
  check(catEv === 1 && gotSecret().indexOf('cat') >= 0 && cat.petT > 0, 'petting the cat makes it meow and reveals it');
  p.hp = 20;
  visit(sim.gold.x, sim.gold.y);
  sim.step(1 / 30);
  check(sim.gold.taken && p.hp === p.maxHp && gotSecret().indexOf('gold') >= 0, 'the golden dumpling heals fully and reveals it');
  bot.x = 300;
  bot.y = 300;
  sim.planeT = 0;
  let drop = null;
  let msg = 0;
  for (let i = 0; i < 30 * 20 && !drop; i++) {
    sim.step(1 / 30);
    if (sim.events.some(e => e.e === 'msg' && e.k === 'msg_plane')) msg++;
    for (const it of sim.items.values()) if (it.t === 'drop') drop = it;
  }
  check(msg === 1 && drop && drop.land > sim.time, 'the cargo plane announces itself and drops a falling crate');
  visit(drop.x, drop.y);
  sim.pushAction(pid, { a: 'interact' });
  sim.step(1 / 30);
  check(sim.items.has(drop.id), 'a falling crate cannot be opened');
  let landed = 0;
  for (let i = 0; i < 30 * 5; i++) {
    sim.step(1 / 30);
    landed += sim.events.filter(e => e.e === 'land').length;
  }
  visit(drop.x, drop.y);
  const id0 = sim.nextId;
  sim.pushAction(pid, { a: 'interact' });
  sim.step(1 / 30);
  const secretsNow = gotSecret();
  const rareOut = [...sim.items.values()].some(it => D.WEAPONS[it.t] && D.WEAPONS[it.t].rare && Math.hypot(it.x - drop.x, it.y - drop.y) < 80);
  check(landed === 1 && !sim.items.has(drop.id) && sim.nextId - id0 === 3 && rareOut && secretsNow.indexOf('plane') >= 0, 'a landed crate opens into a rare kitchen weapon and two more items');
  const botEvents = sim.eventsFor(bid, 0).filter(e => e.e === 'secret');
  check(botEvents.length === 0, 'bots never get secret events');
  bot.x = notice.x;
  bot.y = notice.y + 40;
  check(!(sim.interactTarget(bot) || {}).secret, 'bots do not use secrets');
  const twin = new Sim({ seed: 4242 });
  check(JSON.stringify(twin.obstacles.map(o => [o.k, o.x, o.y])) === JSON.stringify(new Sim({ seed: 4242 }).obstacles.map(o => [o.k, o.x, o.y])), 'hidden details keep the map deterministic');
}

// ---------- royale ----------
for (const [seed, diff] of [[1, 4], [2, 5], [3, 1]]) {
  const sim = new Sim({ seed, difficulty: diff });
  const hid = sim.addPlayer('Tester', false, { char: 'yunwang' });
  sim.autopilot(hid);
  sim.fillBots(14);
  let nan = false;
  let n = 0;
  const t0 = Date.now();
  while (sim.state === 'playing' && sim.time < 900) {
    sim.step(1 / 30);
    n++;
    if (n % 30 === 0) {
      for (const p of sim.players) if (!Number.isFinite(p.x + p.y + p.hp + p.a)) nan = true;
      JSON.stringify(sim.snapshotFor(hid, 0));
    }
  }
  const ms = Date.now() - t0;
  const kills = sim.players.reduce((a, p) => a + p.kills, 0);
  const chars = new Set(sim.players.map(p => p.char));
  console.log('royale ' + seed + ' (level ' + diff + '): ' + sim.time.toFixed(0) + 's, kills=' + kills + ', winner=' + (sim.winner ? sim.winner.name || sim.winner.char : '-') + ', ' + (ms / n).toFixed(3) + ' ms/step');
  check(sim.state === 'ended' && sim.players.filter(p => p.alive).length <= 1, 'royale ' + seed + ': ends with one survivor');
  check(!nan && kills >= 5 && chars.size === 4, 'royale ' + seed + ': no NaN, kills happen, all four characters present');
}

// ---------- characters ----------
{
  const { sim, a, b } = duel('yunwang', 'luap', { dist: 120 });
  a.skillCool = 0;
  a.hp = 50;
  sim.pushAction(a.id, { a: 'skill' });
  steps(sim, 1);
  check(b.hp <= b.maxHp - 40 && b.burnT > 0, 'Yunwang flame burst damages and burns a nearby foe');
  check(a.hp >= 50 + 15 * 1.5 - 0.5 && a.skillCool > 10, 'Yunwang skill heals with the chef bonus and goes on cooldown');
}
{
  const { sim, a, b } = duel('luap', 'yunwang', { dist: 200 });
  check(a.maxHp === 125, 'Luap has 125 max health');
  sim.setInput(a.id, { aim: 0 });
  a.skillCool = 0;
  sim.pushAction(a.id, { a: 'skill' });
  const x0 = a.x;
  steps(sim, 8);
  check(a.x - x0 > 150 && b.hp <= 100 - 45, 'Luap rush charges forward and hits for 45');
  const d = duel('luap', 'meibao', { dist: 50 });
  d.sim.setInput(d.a.id, { aim: 0, shoot: true });
  steps(d.sim, 2);
  check(Math.round(d.b.hp) === 100 - 32, 'Luap fists hit for double damage (32)');
}
{
  const { sim, a, b } = duel('auhsoj', 'yunwang', { dist: 300 });
  a.skillCool = 0;
  sim.pushAction(a.id, { a: 'skill' });
  steps(sim, 60);
  check(sim.turrets.length === 1 && b.hp < 100, 'Auhsoj turret deploys and shoots an enemy');
  a.slots[0] = { t: 'rifle', m: 0 };
  sim.pushAction(a.id, { a: 'reload' });
  steps(sim, 1);
  check(Math.abs(a.reload.total - D.WEAPONS.rifle.reload * 0.6) < 1e-9, 'Auhsoj reloads 40% faster');
}
{
  const { sim, a } = duel('meibao', 'yunwang', { dist: 900 });
  a.hp = 40;
  a.stamina = 0;
  a.skillCool = 0;
  sim.pushAction(a.id, { a: 'skill' });
  steps(sim, 1);
  check(a.hp >= 70 && a.stamina > 90 && a.boostT > 4, 'Meibao boba heals 30, refills stamina and boosts speed');
  sim.setInput(a.id, { mx: 1, my: 0, aim: 0 });
  const x0 = a.x;
  steps(sim, 30);
  check(a.x - x0 > D.SPEED * 1.12 * 1.35 * 0.85, 'Meibao boosted run is faster than base speed');
}

// ---------- kitchen weapons ----------
{
  const { sim, a, b } = duel('yunwang', 'auhsoj', { dist: 70 });
  a.slots[0] = { t: 'pan' };
  sim.setInput(a.id, { aim: 0, shoot: true });
  steps(sim, 1);
  sim.setInput(a.id, { aim: 0, shoot: false });
  check(Math.round(b.hp) === 100 - 55 && b.kx > 200, 'frying pan hits for 55 with big knockback');
}
{
  const { sim, a, b } = duel('yunwang', 'auhsoj', { dist: 70 });
  a.slots[0] = { t: 'wok' };
  sim.setInput(a.id, { aim: 0, shoot: true });
  steps(sim, 1);
  check(b.burnT > 0, 'wok sets the target on fire');
  const d = duel('yunwang', 'auhsoj', { dist: 90 });
  d.a.slots[0] = { t: 'swordfish' };
  d.sim.setInput(d.a.id, { aim: 0, shoot: true });
  steps(d.sim, 1);
  check(d.b.slowT > 0 && Math.round(d.b.hp) === 20, 'frozen swordfish hits for 80 and slows');
}
{
  const { sim, a } = duel('yunwang', 'auhsoj', { dist: 900 });
  sim.addObstacle('wall', 'r', 2150, 2000, { hw: 10, hh: 100 });
  a.slots[0] = { t: 'bowl', m: 6 };
  sim.setInput(a.id, { aim: 0, shoot: true });
  steps(sim, 1);
  sim.setInput(a.id, { aim: 0, shoot: false });
  const bowl = sim.bullets.find(q => q.w === 'bowl');
  steps(sim, 8);
  check(bowl && bowl.bounce === 1 && bowl.dx < 0, 'flying bowl bounces off a wall');
}
{
  const sim = new Sim({ seed: 99 });
  const a = sim.playerMap.get(sim.addPlayer('A', false, { char: 'auhsoj' }));
  const b = sim.playerMap.get(sim.addPlayer('B', false, { char: 'luap' }));
  const c = sim.playerMap.get(sim.addPlayer('C', false, { char: 'meibao' }));
  clearAround(sim, 2000, 2000, 500);
  a.x = 2000;
  a.y = 2000;
  b.x = 2150;
  b.y = 2000;
  c.x = 2300;
  c.y = 2000;
  a.slots[0] = { t: 'chopsticks', m: 24 };
  sim.setInput(a.id, { aim: 0, shoot: true });
  steps(sim, 1);
  sim.setInput(a.id, { aim: 0, shoot: false });
  steps(sim, 10);
  check(b.hp < b.maxHp && c.hp < c.maxHp, 'chopsticks pierce through the first target');
}

// ---------- pickups, slots, teams ----------
{
  const { sim, a } = duel('yunwang', 'luap', { dist: 900 });
  check(a.nslots === 3, 'everyone starts with a backpack: 3 weapon slots');
  for (const t of ['cleaver', 'rifle', 'bowl']) {
    sim.spawnItem(a.x, a.y, t);
    sim.pushAction(a.id, { a: 'interact' });
    steps(sim, 1);
  }
  check(a.slots[0].t === 'cleaver' && a.slots[1].t === 'rifle' && a.slots[2].t === 'bowl', 'three weapons fit in the backpack');
  for (let i = 0; i < 4; i++) sim.spawnItem(a.x, a.y, 'soup');
  steps(sim, 1);
  const soupsLeft = [...sim.items.values()].filter(it => it.t === 'soup' && Math.hypot(it.x - a.x, it.y - a.y) < 100).length;
  check(a.soups === 3 && soupsLeft === 1 && a.slots.every(s => !s || s.t !== 'soup'), 'soup goes to the medical pouch (cap 3), not a weapon slot');
  sim.spawnItem(a.x, a.y, 'bag');
  steps(sim, 2);
  check(a.nslots === 4 && sim.soupCap(a) === 5 && a.soups === 4, 'thermal bag gives a 4th weapon slot and room for 5 soups');
  a.hp = 5;
  sim.setInput(a.id, { aim: 0, shoot: true });
  sim.pushAction(a.id, { a: 'heal' });
  steps(sim, 2);
  const firedWhileDrinking = sim.bullets.length > 0;
  steps(sim, 60);
  sim.setInput(a.id, { aim: 0, shoot: false });
  check(Math.round(a.hp) >= 5 + 60 * 1.5 && a.soups === 3, 'H drinks one soup and heals 60 (90 with the chef bonus)');
  check(!firedWhileDrinking, 'attacking is paused while drinking');
  a.hp = 30;
  sim.spawnItem(a.x, a.y, 'bao');
  steps(sim, 1);
  check(Math.round(a.hp) === 30 + 60, 'soup dumplings heal 40, 60 with the chef bonus');
  sim.killPlayer(a, 0, 'zone');
  const drops = [...sim.items.values()].filter(it => Math.hypot(it.x - a.x, it.y - a.y) < 120);
  check(drops.filter(it => it.t === 'soup').length === 3 && drops.some(it => it.t === 'bag'), 'death drops the soups and the thermal bag');
}
{
  const sim = new Sim({ mode: 'story', chapter: 'ch3' });
  const hid = sim.startStory('Hero', 'meibao');
  const hero = sim.playerMap.get(hid);
  const ally = sim.players.find(p => p.team === 1 && p !== hero);
  hero.slots[0] = { t: 'pan' };
  ally.x = hero.x + 50;
  ally.y = hero.y;
  hero.a = 0;
  sim.setInput(hid, { aim: 0, shoot: true });
  sim.swingMelee(hero);
  check(ally && ally.hp === ally.maxHp, 'no friendly fire between story allies');
}

// ---------- story chapters ----------
const storyResults = {};
for (const diff of [1, 2, 3, 4]) {
  for (const ch of D.STORY) {
    let wins = 0;
    const tries = 3;
    const notes = [];
    for (let k = 0; k < tries; k++) {
      const sim = new Sim({ mode: 'story', chapter: ch.id, difficulty: diff });
      const hid = sim.startStory('Hero', D.CHAR_IDS[k % 4]);
      sim.rng = require(path.join(__dirname, '..', 'js', 'sim.js')).mulberry32(1000 + k);
      sim.autopilot(hid);
      while (sim.state === 'playing' && sim.time < 600) sim.step(1 / 30);
      if (sim.result === 'win') wins++;
      notes.push(sim.result + (sim.failReason ? '/' + sim.failReason : '') + '@' + sim.time.toFixed(0) + 's');
    }
    storyResults[diff + ' ' + ch.id] = wins;
    console.log('story ' + diff + ' ' + ch.id + ': autopilot won ' + wins + '/' + tries + '  [' + notes.join(', ') + ']');
  }
}
for (const lvl of [1, 2, 3]) {
  for (const ch of D.STORY) check(storyResults[lvl + ' ' + ch.id] >= 1, 'story ' + ch.id + ' can be won by the autopilot on level ' + lvl);
}
const total = lvl => D.STORY.reduce((a, ch) => a + storyResults[lvl + ' ' + ch.id], 0);
check(total(1) >= total(4), 'level 1 story wins (' + total(1) + ') are at least level 4 wins (' + total(4) + ')');

console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
