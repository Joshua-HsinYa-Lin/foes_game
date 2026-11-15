# 允望樂園 Yunwang Paradise

[繁體中文](README.zh-TW.md)

A browser shooter set on the opening night of 允望樓 (Yunwang Tower). Captain Salted Fish, who lost the shipping deal to cold-chain air freight, sends his Brine Gang to ruin the night. Play the story, brawl against bots, or battle friends on the same Wi-Fi.

## Play

- **Computer:** download [yunwang_paradise.zip](yunwang_paradise.zip?raw=true), unzip, open `yunwang_paradise.html` in Chrome, Edge or Firefox. No install, works offline.
- **Phone or tablet:** open the game from a computer running the server (see LAN below): `http://<address>` in Chrome or Safari, held sideways. On iPhone, Share → Add to Home Screen gives a full screen.

## Modes

- **故事模式 Story:** five chapters with dialogue.
- **樂園大亂鬥 Paradise Brawl:** last one standing against bots.
- **區網對戰 LAN battle:** free-for-all, 紅藍對戰 Red vs Blue, or 全家合作 Family co-op (everyone against bots, fallen players come back).
- Difficulty 1 (beginner) to 5 (hard).

## Characters

| Character | Skill |
| --- | --- |
| 允望 Yunwang, chef | Ring of fire; heals |
| Luap, boxer | Charging rush |
| Auhsoj, engineer | Auto turret |
| Meibao, pastry chef | Bubble tea: heal and speed |
| 阿風 Afeng, delivery rider | Parcel bomb, lobbed to where you aim |
| 小泡 Bubbles, dishwasher | Bubble shields for the team |
| 金金 Jinjin, cashier | Fan of coins |
| 冰師傅 Master Bing, cold room | Freezing fog that slows |

Characters level up from 1 to 9 by playing (+4% health and damage per level). Level 4 unlocks a **kitchen gadget** (G, 3 uses a match), level 6 a **signature perk**, level 8 **Wok Overdrive** (V: fills as you deal damage, then 6 seconds of extra speed, damage and toughness with a stronger skill). Choose them on the character screen; "Trial: unlock all" there sets everything to level 9.

## Controls

| Computer | Action |
| --- | --- |
| WASD / mouse / left click | Move / aim / attack (a guide on the ground shows where it goes) |
| Right click (hold, release) or X | Skill |
| G / V / H | Gadget / Wok Overdrive / drink soup |
| F, Q or wheel, 1-4, R, C | Pick up or drive, switch weapon, reload, drop |
| Space / Shift / M / Esc | Run / jump / map / pause |

**Touch:** left thumb moves; right thumb drags to aim and releases to fire (tap to auto-aim); drag from the skill button to aim a skill; tap the weapon slots, soup, gadget and minimap.

**View:** pick 2D 平面 (flat) or 2.5D 立體 on the title screen or in the pause menu. It only changes how your own screen draws the game, both show the same amount of map, and people using different views can play together.

## LAN multiplayer

1. On one computer, install [Node.js](https://nodejs.org) 16+ and run `node server.js` in this folder (or double-click `start-lan-server.bat` / run `./start-lan-server.sh`). It prints an address such as `192.168.1.23:8080`.
2. Everyone on the same Wi-Fi opens `http://<that address>`, or opens the HTML file and types the address. Pick a character and press LAN battle.
3. The first person in is the host and picks the bots, difficulty and mode, then presses Start.

Tested with 8 people in one room. Options: `node server.js --port 8080 --bots 13 --difficulty 4 --mode coop`; `--autostart 15` starts matches by itself; `--stats` prints load and bandwidth.

## Also in the game

Six hidden details to find (the title screen counts them), breakable wooden buildings, cold-chain airdrops, drivable vans and scooters with a handbrake drift, recorded victory and knockout sounds, and the 允望樓 theme music.

## For developers

| Path | Contents |
| --- | --- |
| `js/data.js` | Characters, weapons, levels, gadgets, perks, chapters |
| `js/sim.js` | Game simulation (browser and server) |
| `js/render.js` | 2D and 2.5D drawing, HUD |
| `js/client.js` | Menus, input, sessions |
| `js/i18n.js`, `js/audio.js` | Text in both languages; music and sounds |
| `server.js` | LAN server, no dependencies |
| `assets/` | Music and recorded sounds (originals in `assets/sfx/original/`) |
| `prototype/pinefall.html` | The earlier prototype |

After changing `js/`, `css/`, `assets/` or `index.html`, rebuild the single file and zip with `node tools/build_single.js`.

Tests: `node tests/sim_test.js` needs nothing else. The browser tests in `tests/` need Playwright; `lan_test.js`, `family_test.js`, `view_modes_test.js` and the LAN part of `mobile_test.js` need `node server.js --port 8099` running.
