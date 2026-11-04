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

// ---------- royale ----------
for (const [seed, diff] of [[1, 'normal'], [2, 'hard'], [3, 'easy']]) {
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
  console.log('royale ' + seed + ' (' + diff + '): ' + sim.time.toFixed(0) + 's, kills=' + kills + ', winner=' + (sim.winner ? sim.winner.name || sim.winner.char : '-') + ', ' + (ms / n).toFixed(3) + ' ms/step');
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
for (const diff of ['easy', 'normal']) {
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
for (const ch of D.STORY) check(storyResults['easy ' + ch.id] >= 1, 'story ' + ch.id + ' can be won by the autopilot on easy');

console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
