# Pinefall

A top-down 2D battle royale that runs in the browser. You start with your fists, loot cabins and crates for guns, armor and healing items, drive jeeps and dirt bikes, and try to be the last player alive while a red fog closes in on the map.

It is an original game in the browser battle royale genre: the name, map generator, art, sounds and code are all new. It does not copy any specific existing game.

## Play (no install)

1. Download this repository (green **Code** button on GitHub, then **Download ZIP**) and unzip it, or `git clone` it.
2. Double-click `index.html`. It opens in your browser and runs fully offline.
3. Enter a name, pick a skin, choose the number of bots and their skill, and press **Play vs Bots**.

Chrome, Edge and Firefox are supported. Nothing is installed on your computer, and the game makes no network requests in this mode.

## LAN multiplayer (optional)

Requires [Node.js](https://nodejs.org) 16 or newer. The server uses only Node's built-in modules, so there is no `npm install` step.

```bash
node server.js
```

Or double-click `start-lan-server.bat` (Windows) / run `./start-lan-server.sh` (macOS, Linux).

The server prints two addresses. Open the `Local` one yourself, and give the `Network` one to friends on the same Wi-Fi or LAN. Everyone presses **Join LAN Match**. A match starts 15 seconds after the first player joins, and bots fill the empty slots. People who join during the first 45 seconds of a match are dropped in; later arrivals spectate until the next match.

Server options:

```bash
node server.js --port 8080 --players 30 --difficulty normal --lobby 15
```

`--players` is the total match size (humans plus bots, 2 to 60), `--difficulty` is `easy`, `normal` or `hard`, and `--lobby` is the countdown in seconds. Your operating system may ask whether to allow Node.js through the firewall; allow it on private networks for friends to connect. Playing over the internet needs port forwarding on your router and is not covered here.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Move; in a vehicle W/S is throttle and reverse, A/D steer |
| Mouse | Aim; left click fires, swings or throws |
| 1 2 3 4 (or G) | Primary gun, secondary gun, melee, grenades |
| Q / mouse wheel | Swap to last weapon / cycle weapons |
| R | Reload |
| F or E | Pick up the item under you, swap guns, enter or exit a vehicle |
| 5 6 7 | Bandage, Med Kit, Energy Drink |
| H | Use the most useful heal |
| X | Cancel heal or reload |
| V | Cycle through scopes you own |
| Space | Handbrake while driving |
| M | Full map |
| Esc | Pause (solo) or menu |

Ammo, heals, grenades, scopes and better armor are picked up by walking over them. Guns go into an empty slot automatically; when both slots are full, press F to swap.

## How it plays

- **Map**: procedurally generated each match: 5600 x 5600 units with villages, warehouses, lone cabins, dirt roads, a river with bridges, pine and broadleaf forest, rocks, bushes, crates, military crates and explosive barrels. Roofs turn transparent when you walk inside, and bushes and tree canopies hide players.
- **Guns**: Pistol, SMG, Shotgun, Assault Rifle, Marksman Rifle, Sniper Rifle and Light Machine Gun, using four ammo types (9mm, 5.56mm, 12 gauge, .308). Loot rings are colored by rarity.
- **Melee and throwables**: fists, hatchet, frag grenades with a fuse and bounces.
- **Gear**: vests and helmets (levels 1 to 3) reduce damage; packs (levels 1 to 3) raise ammo and item capacity; 2x, 4x and 8x scopes zoom the view out.
- **Healing**: Bandages heal 15 HP up to 75. Med Kits heal to 100. Energy Drinks fill the boost bar, which regenerates health over time and adds speed above half.
- **Vehicles**: jeeps and dirt bikes. Jeeps protect the driver from bullets, while dirt bike riders take part of the damage. Hitting players at speed damages them, and wrecked vehicles explode.
- **Red fog**: seven phases. The white dashed circle shows the next safe zone, and damage outside the zone rises each phase.
- **Bots**: loot, break crates, pick fights, retreat to heal, throw grenades at players hiding behind cover, and run from the fog. Skill changes reaction time, aim error, turn speed and sight range.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | Page, menus and overlays |
| `js/data.js` | Weapon, item, vehicle, zone and bot tuning tables |
| `js/sim.js` | Game simulation: map generation, physics, combat, vehicles, fog, bots, snapshots. Runs in the browser (solo) and in Node (LAN server) |
| `js/render.js` | Canvas renderer and HUD |
| `js/audio.js` | Sound effects synthesized with the Web Audio API (no audio files) |
| `js/client.js` | Menus, input, solo and LAN sessions, network interpolation |
| `server.js` | LAN server: static files plus a minimal WebSocket implementation, 30 ticks per second |
| `tests/` | Automated checks |

## Tests

Headless simulation test (no dependencies):

```bash
node tests/sim_test.js
```

It generates maps, plays three full 30-player bot matches, and checks pickups, reloads, healing, armor, vehicles, melee kills and win detection.

The browser tests (`tests/browser_test.js`, `tests/scenario_test.js`, `tests/lan_test.js`) drive the real page with Playwright and save screenshots. They are optional and need Playwright, which this project does not install for you.
