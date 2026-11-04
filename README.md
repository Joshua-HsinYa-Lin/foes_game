# 允望樂園 Yunwang Paradise

A top-down browser shooter set on the opening night of 允望樓 (Yunwang Tower), the restaurant whose signature ingredient 「允望」 is now flown in by full cold-chain air freight, direct to Taiwan. The old sea-freight contractor, 鹹魚船長 (Captain Salted Fish), lost the shipping deal and sends his Brine Gang to ruin the night. Play as the restaurant team, fight through five story chapters, or jump into a last-one-standing brawl.

允望樓開幕夜，鹹水幫來搗亂了！選一位角色，打完五個章節的故事，或是在樂園大亂鬥裡當最後站著的人。

## Play (no install)

Download `yunwang_paradise.html` (open it on GitHub and use **Download raw file**) and double-click it. It is the whole game in one file, music included, and runs offline in Chrome, Edge or Firefox.

Or download the repository and double-click `index.html`.

Music and sound start after your first click (browsers block audio until then). The language button on the title screen switches between 中文 and English.

## Characters

| Character | Role | Passive | Skill (right click or X) |
| --- | --- | --- | --- |
| 允望 Yunwang | Head chef | All food and healing +50% | Wok Flame Burst: ring of fire, 40 damage, burns foes, heals you |
| Luap | Boxer, the restaurant's bouncer | Double fist damage, faster punches, 125 health | Whirlwind Rush: charge forward, knock foes aside for 45 |
| Auhsoj | Engineer who runs the cold chain | Reloads 40% faster | Sentry Turret: auto-shoots nearby foes for 10 seconds |
| Meibao | Pastry chef | +12% move speed, +50% stamina regeneration | Boba Boost: heal 30, refill stamina, run faster for 5 seconds |

## Modes

- **故事模式 Story Mode**: five chapters with dialogue between them. Progress is saved in your browser.
  1. 後廚試煉 The Kitchen Trial: tutorial, defeat 3 thugs.
  2. 冷鏈告急 Cold Chain Emergency: recover 5 cold-chain crates before they thaw.
  3. 價格風暴 The Price Storm: defend Yunwang Tower for two minutes against waves of fake customers.
  4. 跨越雲海 Across the Sea of Clouds: the cold-chain zone shrinks; take down the whole gang.
  5. 鹹魚翻身？ The Salted Fish Strikes Back?: boss fight against the captain at the container yard, with the whole team.
- **樂園大亂鬥 Paradise Brawl**: free-for-all against bots (13 by default). The shrinking cold-chain zone pushes everyone together.
- **區網對戰 LAN Battle**: Paradise Brawl with friends on the same network (see below).

Difficulty applies to both modes. Easy is the relaxed way through the story; normal makes the finale a real fight.

## Weapons and items

- Common: fists, knife, pistol, uzi, shotgun, assault rifle, sniper, machine gun.
- Rare kitchen weapons (gold ring on the ground, extra damage): 平底鍋 frying pan (big knockback), 菜刀 cleaver, 擀麵棍 rolling pin (huge knockback), 中華炒鍋 wok (sets foes on fire), 飛筷 chopsticks (thrown, pierce one target), 飛碗 flying bowl (thrown, bounces off walls), and the legendary 冷凍旗魚 frozen swordfish (80 damage, slows). The captain drops his 魚叉槍 harpoon gun.
- Everyone carries a backpack with 3 weapon slots. The 保溫外送袋 thermal bag upgrades it to 4 weapon slots.
- Healing items never take a weapon slot. 雞湯 chicken soup goes into a separate medical pouch when you walk over it (up to 3, or 5 with the thermal bag); press H to drink one and heal 60. 小籠包 soup dumplings heal 40 on the spot. 「?」 ingredient crates break open for better loot.
- Delivery vans and scooters can be driven, and they hurt anyone they hit.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move; steer when driving |
| Mouse | Aim; left click attacks |
| H | Drink chicken soup from the medical pouch (press again to cancel) |
| Right click / X | Character skill |
| Space | Run (uses stamina); handbrake when driving |
| Shift | Jump |
| F / E | Pick up or swap items, get in or out of vehicles |
| Q / wheel | Change weapon |
| 1 2 3 4 | Select weapon slot (slot 4 needs a thermal bag) |
| R | Reload |
| C | Drop the held item |
| M | Full map |
| Esc | Pause / menu |

## LAN multiplayer (optional)

Requires [Node.js](https://nodejs.org) 16 or newer. There is no `npm install` step; the server uses only Node's built-in modules.

```bash
node server.js
```

Or double-click `start-lan-server.bat` (Windows) / run `./start-lan-server.sh` (macOS, Linux). Open the `Local` address it prints, give the `Network` address to friends on the same Wi-Fi, and everyone picks **區網對戰 LAN Battle**. Options: `--port 8080 --players 14 --difficulty normal --lobby 15`.

## Prototype

`prototype/pinefall.html` is the earlier Foes.io-style prototype (Pinefall), kept as a single playable file. The `main` branch holds that prototype's full source.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `css/style.css` | Page, menus, dialogue box and overlays |
| `js/data.js` | Characters, weapons, items, enemies, zone, bot skill and story chapter tables |
| `js/i18n.js` | Chinese and English text, including the story script |
| `js/sim.js` | Game simulation: map, combat, skills, vehicles, zone, bots, story objectives. Runs in the browser and in the LAN server |
| `js/render.js` | Canvas renderer, HUD and character portraits |
| `js/audio.js` | Background music player and synthesized sound effects |
| `js/client.js` | Menus, story flow, dialogue, input, solo and LAN sessions |
| `assets/yunwang_theme.mp3` | 允望樓 theme, the background music |
| `assets/bgm.mp3` | Earlier soundtrack, kept for a future feature (not played yet) |
| `server.js` | LAN server: static files plus a minimal WebSocket implementation |
| `tools/build_single.js` | Builds `yunwang_paradise.html` with everything inlined |
| `tests/` | Automated checks |

After changing anything in `js/`, `css/`, `assets/` or `index.html`, rebuild the single-file version:

```bash
node tools/build_single.js
```

## Tests

```bash
node tests/sim_test.js
```

Runs without dependencies. It checks the map, three full Paradise Brawl rounds, every character skill and passive, the kitchen weapon effects (knockback, burn, slow, bounce, pierce), the backpack slots and medical pouch, pickups, friendly fire, and plays each story chapter with an AI-controlled hero to confirm each chapter can be won.

The browser tests (`tests/browser_test.js`, `tests/scenario_test.js`, `tests/lan_test.js`) drive the real page with Playwright and save screenshots. They are optional and need Playwright, which this project does not install.
