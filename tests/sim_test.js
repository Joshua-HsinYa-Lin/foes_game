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
  const t0 = Date.now();
  while (sim.state === 'playing' && sim.time < 900) {
    sim.step(dt);
    steps++;
    maxBullets = Math.max(maxBullets, sim.bullets.length);
    if (steps % 30 === 0) {
      for (const p of sim.players) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.a)) nanFound = true;
      }
      const snap = sim.snapshotFor(humanId, 0);
      snapBytes = Math.max(snapBytes, JSON.stringify(snap).length);
    }
  }
  const ms = Date.now() - t0;
  return { sim, steps, maxBullets, nanFound, ms, snapBytes };
}

const mapSim = new Sim({ seed: 12345 });
console.log('map: obstacles=' + mapSim.obstacles.length + ' buildings=' + mapSim.buildings.length + ' roads=' + mapSim.roads.length + ' bridges=' + mapSim.bridges.length + ' vehicles=' + mapSim.vehicles.length + ' loot=' + mapSim.loot.size);
check(mapSim.buildings.length >= 10, 'map has at least 10 buildings');
check(mapSim.obstacles.length > 1000, 'map has more than 1000 obstacles');
check(mapSim.vehicles.length >= 4, 'map has at least 4 vehicles');
check(mapSim.loot.size > 150, 'map has more than 150 loot items');
const mapJson = JSON.stringify(mapSim.getMapData());
console.log('map json bytes=' + mapJson.length);
check(mapJson.length < 600000, 'map JSON under 600 KB');

const sameSeed = new Sim({ seed: 12345 });
check(JSON.stringify(sameSeed.getMapData()) === mapJson, 'same seed gives identical map');

for (const [seed, diff] of [[1, 'normal'], [2, 'hard'], [3, 'easy']]) {
  const r = runMatch(seed, 29, diff);
  const s = r.sim;
  const totalKills = s.players.reduce((a, p) => a + p.kills, 0);
  const alive = s.players.filter(p => p.alive).length;
  console.log('seed ' + seed + ' (' + diff + '): sim time=' + s.time.toFixed(1) + 's steps=' + r.steps + ' wall=' + r.ms + 'ms (' + (r.ms / r.steps).toFixed(3) + ' ms/step) kills=' + totalKills + ' alive=' + alive + ' winner=' + (s.winner ? s.winner.name : '-') + ' maxBullets=' + r.maxBullets + ' maxSnapBytes=' + r.snapBytes);
  check(s.state === 'ended', 'seed ' + seed + ': match ends');
  check(alive <= 1, 'seed ' + seed + ': at most one survivor');
  check(!r.nanFound, 'seed ' + seed + ': no NaN positions or hp');
  check(totalKills >= 5, 'seed ' + seed + ': bots score kills (' + totalKills + ')');
  check(r.ms / r.steps < 8, 'seed ' + seed + ': step under 8 ms average');
  const placements = s.players.map(p => p.placement).sort((a, b) => a - b);
  check(placements[0] === 1 || alive === 0, 'seed ' + seed + ': a placement of 1 exists');
}

{
  const sim = new Sim({ seed: 77 });
  const id = sim.addPlayer('Solo', false, 1);
  const p = sim.playerMap.get(id);
  sim.spawnLoot(p.x, p.y, 'gun', 'rifle', 1);
  sim.step(1 / 30);
  check(p.slots[0] && p.slots[0].w === 'rifle', 'walking over a gun auto-equips it into an empty slot');
  check(p.act === 0, 'auto-equipped gun becomes active');
  sim.spawnLoot(p.x, p.y, 'ammo', 'medium', 30);
  sim.step(1 / 30);
  check(p.ammo.medium === 30, 'ammo auto pickup');
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: true, aimDist: 300 });
  for (let i = 0; i < 20; i++) sim.step(1 / 30);
  check(p.slots[0].m < 30, 'firing consumes magazine');
  sim.setInput(id, { mx: 0, my: 0, aim: 0, shoot: false, aimDist: 300 });
  sim.pushAction(id, { a: 'reload' });
  for (let i = 0; i < 90; i++) sim.step(1 / 30);
  check(p.slots[0].m === 30, 'reload refills magazine');
  sim.spawnLoot(p.x, p.y, 'heal', 'bandage', 5);
  sim.step(1 / 30);
  p.hp = 40;
  sim.pushAction(id, { a: 'use', item: 'bandage' });
  for (let i = 0; i < 100; i++) sim.step(1 / 30);
  check(p.hp >= 55 && p.items.bandage === 4, 'bandage heals 15 hp and is consumed');
  sim.spawnLoot(p.x, p.y, 'vest', 2, 1);
  sim.step(1 / 30);
  check(p.vest === 2, 'better vest auto-equips');
  const v = sim.vehicles[0];
  p.x = v.x + 70;
  p.y = v.y;
  sim.pushAction(id, { a: 'interact' });
  sim.step(1 / 30);
  check(p.veh === v.id, 'interact enters a nearby vehicle');
  sim.setInput(id, { mx: 0, my: -1, aim: 0, shoot: false, aimDist: 300 });
  const sx = v.x;
  const sy = v.y;
  for (let i = 0; i < 30; i++) sim.step(1 / 30);
  check(Math.hypot(v.x - sx, v.y - sy) > 50, 'vehicle moves under throttle');
  sim.pushAction(id, { a: 'interact' });
  sim.step(1 / 30);
  check(p.veh === 0, 'interact exits the vehicle');
  const snap = sim.snapshotFor(id, 0);
  check(snap && snap.me && Array.isArray(snap.pl) && snap.zo, 'snapshot has expected fields');
}

{
  const sim = new Sim({ seed: 99 });
  const a = sim.addPlayer('A', false, 0);
  const b = sim.addPlayer('B', false, 0);
  const pa = sim.playerMap.get(a);
  const pb = sim.playerMap.get(b);
  pa.x = 2800;
  pa.y = 2800;
  pb.x = 2800 + 40;
  pb.y = 2800;
  for (const o of sim.obstacles) {
    if (Math.hypot(o.x - 2820, o.y - 2800) < 200) o.dead = true;
  }
  sim.setInput(a, { mx: 0, my: 0, aim: 0, shoot: true, aimDist: 300 });
  for (let i = 0; i < 300 && pb.alive; i++) {
    pb.x = 2840;
    pb.y = 2800;
    sim.step(1 / 30);
  }
  check(!pb.alive, 'fists can kill an adjacent player');
  check(pa.kills === 1 && sim.state === 'ended' && sim.winner === pa, 'kill credited and last player wins');
}

console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
