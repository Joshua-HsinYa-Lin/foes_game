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

function runMatch(seed, bots, difficulty) {
  const sim = new Sim({ seed, difficulty });
  const humanId = sim.addPlayer('Tester', false, 0);
  sim.fillBots(bots + 1);
  const dt = 1 / D.TICK_RATE;
  let steps = 0;
  let maxBullets = 0;
  let nanFound = false;
  let snapBytes = 0;
  let deaths20 = -1;
  const t0 = Date.now();
  while (sim.state === 'playing' && sim.time < 900) {
    sim.step(dt);
    steps++;
    maxBullets = Math.max(maxBullets, sim.bullets.length);
    if (deaths20 < 0 && sim.time >= 20) deaths20 = sim.players.filter(p => !p.alive).length;
    if (steps % 30 === 0) {
      for (const p of sim.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.a)) nanFound = true;
      }
      snapBytes = Math.max(snapBytes, JSON.stringify(sim.snapshotFor(humanId, 0)).length);
    }
  }
  return { sim, steps, maxBullets, nanFound, ms: Date.now() - t0, snapBytes, deaths20 };
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

const mapSim = new Sim({ seed: 12345 });
console.log('map: obstacles=' + mapSim.obstacles.length + ' buildings=' + mapSim.buildings.length + ' roads=' + mapSim.roads.length + ' vehicles=' + mapSim.vehicles.length + ' items=' + mapSim.items.size);
check(mapSim.buildings.length >= 8, 'map has at least 8 buildings');
check(mapSim.obstacles.length > 600, 'map has more than 600 obstacles');
check(mapSim.vehicles.length >= 4, 'map has at least 4 vehicles');
check(mapSim.items.size > 100, 'map has more than 100 items');
const corners = [[0, 0], [D.MAP_SIZE, 0], [0, D.MAP_SIZE], [D.MAP_SIZE, D.MAP_SIZE]];
check(corners.every(([x, y]) => Math.hypot(x - mapSim.zone.x, y - mapSim.zone.y) < mapSim.zone.r), 'safe area covers the whole map at the start');
const mapJson = JSON.stringify(mapSim.getMapData());
console.log('map json bytes=' + mapJson.length);
check(mapJson.length < 400000, 'map JSON under 400 KB');
check(JSON.stringify(new Sim({ seed: 12345 }).getMapData()) === mapJson, 'same seed gives identical map');

for (const [seed, diff] of [[1, 'normal'], [2, 'hard'], [3, 'easy']]) {
  const r = runMatch(seed, 29, diff);
  const s = r.sim;
  const totalKills = s.players.reduce((a, p) => a + p.kills, 0);
  const alive = s.players.filter(p => p.alive).length;
  console.log('seed ' + seed + ' (' + diff + '): sim time=' + s.time.toFixed(1) + 's wall=' + r.ms + 'ms (' + (r.ms / r.steps).toFixed(3) + ' ms/step) kills=' + totalKills + ' deaths by 20s=' + r.deaths20 + ' winner=' + (s.winner ? s.winner.name : '-') + ' maxBullets=' + r.maxBullets + ' maxSnapBytes=' + r.snapBytes);
  check(s.state === 'ended', 'seed ' + seed + ': match ends');
  check(alive <= 1, 'seed ' + seed + ': at most one survivor');
  check(!r.nanFound, 'seed ' + seed + ': no NaN positions or hp');
  check(totalKills >= 5, 'seed ' + seed + ': bots score kills (' + totalKills + ')');
  check(r.ms / r.steps < 8, 'seed ' + seed + ': step under 8 ms average');
  check(s.players.some(p => p.placement === 1) || alive === 0, 'seed ' + seed + ': a placement of 1 exists');
}

{
  const sim = new Sim({ seed: 77 });
  const id = sim.addPlayer('Solo', false, 1);
  const p = sim.playerMap.get(id);
  p.x = 2000;
  p.y = 2000;
  clearAround(sim, 2000, 2000, 300);
  const step = n => {
    for (let i = 0; i < n; i++) sim.step(1 / 30);
  };
  sim.spawnItem(p.x, p.y, 'rifle');
  step(1);
  check(!p.slots[0], 'weapons are not picked up by walking over them');
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.slots[0] && p.slots[0].t === 'rifle' && p.act === 0, 'F picks up a weapon into the held empty slot');
  sim.spawnItem(p.x, p.y, 'shotgun');
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.slots[1] && p.slots[1].t === 'shotgun' && p.act === 0, 'second weapon fills the free slot');
  sim.spawnItem(p.x, p.y, 'sniper');
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.slots[0].t === 'sniper' && [...sim.items.values()].some(it => it.t === 'rifle'), 'with both slots full, F swaps the held weapon and drops the old one');
  sim.pushAction(id, { a: 'cycle', i: 1 });
  step(10);
  check(p.act === 1, 'cycle switches slot');
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: true });
  step(5);
  check(p.slots[1].m < D.WEAPONS.shotgun.mag, 'firing consumes the magazine');
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: false });
  sim.pushAction(id, { a: 'reload' });
  step(80);
  check(p.slots[1].m === D.WEAPONS.shotgun.mag, 'reload refills the magazine');
  sim.spawnItem(p.x, p.y, 'backpack');
  step(1);
  check(p.nslots === 3, 'walking over a backpack unlocks a third slot');
  sim.spawnItem(p.x, p.y, 'syringe');
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.slots[2] && p.slots[2].t === 'syringe', 'syringe goes into the third slot');
  p.hp = 30;
  sim.pushAction(id, { a: 'slot', i: 2 });
  step(8);
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: true });
  step(2);
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: false });
  step(60);
  check(Math.round(p.hp) === 90 && !p.slots[2], 'syringe heals 60 and is used up');
  sim.spawnItem(p.x, p.y, 'medpack');
  step(1);
  check(p.hp === 100, 'health pack heals when walked over');
  sim.pushAction(id, { a: 'slot', i: 0 });
  step(8);
  sim.pushAction(id, { a: 'drop' });
  step(1);
  check(!p.slots[0], 'C drops the held item');
  const s0 = p.stamina;
  sim.setInput(id, { mx: 1, my: 0, aim: 0, shoot: false, sprint: true });
  const x0 = p.x;
  step(15);
  const sprintDist = p.x - x0;
  check(p.stamina < s0 && sprintDist > D.SPEED * 0.5 * 1.2, 'sprinting is faster and drains stamina');
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: false });
  step(30);
  const jx = p.x;
  sim.setInput(id, { mx: 1, my: 0, aim: 0, shoot: false });
  sim.pushAction(id, { a: 'jump' });
  step(1);
  check(p.jumpT > 0 && p.jumpCool > 0, 'jump starts and goes on cooldown');
  step(10);
  check(p.x - jx > 120, 'jump moves the player quickly');
  const v = sim.vehicles[0];
  clearAround(sim, v.x, v.y, 0);
  p.x = v.x + 80;
  p.y = v.y;
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: false });
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.veh === v.id, 'F enters a nearby vehicle');
  sim.setInput(id, { mx: 0, my: -1, aim: 0, shoot: false });
  const vx = v.x;
  const vy = v.y;
  step(30);
  check(Math.hypot(v.x - vx, v.y - vy) > 50, 'vehicle moves under throttle');
  sim.pushAction(id, { a: 'interact' });
  step(1);
  check(p.veh === 0, 'F gets out of the vehicle');
  const snap = sim.snapshotFor(id, 0);
  check(snap && snap.me && Array.isArray(snap.pl) && snap.zo && Array.isArray(snap.it), 'snapshot has expected fields');
}

{
  const sim = new Sim({ seed: 5 });
  sim.fillBots(30);
  for (let i = 0; i < 25; i++) sim.killPlayer(sim.players[i], 0, 'zone');
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  check(sim.zone.tr < sim.zone.r0 * 0.6 && sim.zone.r < sim.zone.r0, 'safe area target shrinks as players are eliminated');
}

{
  const sim = new Sim({ seed: 99 });
  const a = sim.addPlayer('A', false, 0);
  const b = sim.addPlayer('B', false, 0);
  const pa = sim.playerMap.get(a);
  const pb = sim.playerMap.get(b);
  clearAround(sim, 2000, 2000, 300);
  pa.x = 2000;
  pa.y = 2000;
  sim.setInput(a, { mx: 0, my: 0, aim: 0, shoot: true });
  for (let i = 0; i < 400 && pb.alive; i++) {
    pb.x = 2040;
    pb.y = 2000;
    sim.step(1 / 30);
  }
  check(!pb.alive, 'fists can kill an adjacent player');
  check(pa.kills === 1 && sim.state === 'ended' && sim.winner === pa, 'kill is credited and the last player wins');
}

console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
