# Pinefall

A simple top-down shooter that runs in the browser. Everyone spawns with their fists, grabs weapons lying around the map, and fights to be the last one standing while a red zone closes in. When you die, you wait for the next round.

Pinefall is an original game in the same style as the 2017 browser .io shooters: the name, map generator, art, sounds and code are all new, and it does not copy any specific existing game's look or assets.

## Play (no install)

Download `pinefall.html` (open it on GitHub and use the **Download raw file** button) and double-click it. It is the whole game in one file and runs fully offline.

Alternatively, download the repository (green **Code** button, then **Download ZIP**), unzip it, and double-click `index.html`.

Enter a name, pick a color, choose the number of bots (13 by default, so 14 players per round) and their skill, and press **Play vs Bots**.

`pinefall.html` is generated from the source files. After changing anything in `js/`, `css/` or `index.html`, rebuild it with:

```bash
node tools/build_single.js
```

Chrome, Edge and Firefox are supported. Nothing is installed on your computer, and the game makes no network requests in this mode.

## LAN multiplayer (optional)

Requires [Node.js](https://nodejs.org) 16 or newer. The server uses only Node's built-in modules, so there is no `npm install` step.

```bash
node server.js
```

Or double-click `start-lan-server.bat` (Windows) / run `./start-lan-server.sh` (macOS, Linux).

The server prints two addresses. Open the `Local` one yourself, and give the `Network` one to friends on the same Wi-Fi or LAN. Everyone presses **Join LAN Match**. A round starts 15 seconds after the first player joins, and bots fill the empty spots. People who join during the first 40 seconds of a round are dropped in; later arrivals spectate until the next round.

Server options:

```bash
node server.js --port 8080 --players 14 --difficulty normal --lobby 15
```

`--players` is the round size (humans plus bots, 2 to 30), `--difficulty` is `easy`, `normal` or `hard`, and `--lobby` is the countdown in seconds. Your operating system may ask whether to allow Node.js through the firewall; allow it on private networks for friends to connect. Playing over the internet needs port forwarding on your router and is not covered here.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrow keys | Move; in a vehicle W/S is gas and reverse, A/D steer |
| Mouse | Aim; left click attacks, or uses a syringe you are holding |
| Space | Run (drains the blue stamina bar); handbrake while driving |
| Shift | Jump (a quick leap, short cooldown) |
| F or E | Pick up or swap the item you are standing on, get in or out of a vehicle |
| Q / mouse wheel | Change weapon |
| 1 2 3 | Select a slot (slot 3 needs a backpack) |
| R | Reload |
| C | Drop the held item |
| M | Full map |
| Esc | Pause (solo) or menu |

## How it plays

- **Slots**: you carry 2 items, or 3 after picking up a backpack. An empty slot means fists. Picking something up puts it in your held slot if it is empty, then in any empty slot, and otherwise swaps it with what you are holding.
- **Weapons**: Fists, Knife and Sword for close range; Pistol, Uzi, Shotgun, Assault Rifle, Sniper and Machine Gun for range. Guns have magazines and reload automatically when empty; there is no separate ammo to collect.
- **Healing**: Syringes take up a slot and heal 60 when used. Health packs heal 40 as soon as you walk over them.
- **Mystery crates**: the boxes marked "?" break when you hit or shoot them and drop better-than-average loot.
- **Vehicles**: cars and motorbikes. Cars shield the driver from bullets, while motorbike riders take part of the damage. Hitting players at speed hurts them, and wrecked vehicles explode.
- **Red zone**: the safe circle shrinks as players are eliminated, and after 90 seconds it also closes in over time. Standing in the red area costs 20 health per second.
- **Bots**: loot weapons, break crates, fight, heal with syringes when it is safe, jump to dodge, and run from the red zone. Skill changes reaction time, aim error, turn speed and sight range.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | Page, menus and overlays |
| `js/data.js` | Weapon, item, vehicle, zone and bot tuning tables |
| `js/sim.js` | Game simulation: map generation, movement, combat, vehicles, red zone, bots, snapshots. Runs in the browser (solo) and in Node (LAN server) |
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

It generates maps, plays three full bot rounds, and checks pickups, slot swapping, backpacks, syringes, health packs, reloading, running, jumping, vehicles, the shrinking zone, melee kills and win detection.

The browser tests (`tests/browser_test.js`, `tests/scenario_test.js`, `tests/lan_test.js`) drive the real page with Playwright and save screenshots. They are optional and need Playwright, which this project does not install for you.
