# 允望樂園 Yunwang Paradise

A top-down browser shooter set on the opening night of 允望樓 (Yunwang Tower), the restaurant whose signature ingredient 「允望」 is now flown in by full cold-chain air freight, direct to Taiwan. The old sea-freight contractor, 鹹魚船長 (Captain Salted Fish), lost the shipping deal and sends his Brine Gang to ruin the night. Play as the restaurant team, fight through five story chapters, or jump into a last-one-standing brawl.

允望樓開幕夜，鹹水幫來搗亂了！選一位角色，打完五個章節的故事，或是在樂園大亂鬥裡當最後站著的人。

## ⬇ Download and play (no install)

- **One click:** [**yunwang_paradise.zip**](yunwang_paradise.zip?raw=true) downloads straight from GitHub. Unzip it and double-click `yunwang_paradise.html`.
- **Or the HTML itself:** open [yunwang_paradise.html](yunwang_paradise.html) on GitHub and press the **Download raw file** button (⬇) at the top right of the file view, then double-click the saved file.
- **Or the whole repository:** green **Code** button → **Download ZIP**, unzip, double-click `index.html`.

The single HTML file is the whole game, both music tracks included, and runs offline in Chrome, Edge or Firefox. Music and sound start after your first click (browsers block audio until then). The language button on the title screen switches between 中文 and English.

Music: the 允望樓 theme plays first, then 「two halves of a quiet room」, and they keep alternating. The multiplayer waiting room plays 「two halves of a quiet room」.

## 📱 Phones and tablets (Android and iPhone)

The game runs in the phone's browser with on-screen controls. Phones cannot run the downloaded HTML file well (an iPhone only previews it, without running the game), so a phone opens the game from a computer on the same Wi-Fi:

1. On a computer, start the server (see Multiplayer below): `node server.js`, or double-click `start-lan-server.bat`. It prints an address such as `192.168.1.23:8080`.
2. On the phone, connected to the same Wi-Fi, open Chrome (Android) or Safari (iPhone) and go to `http://192.168.1.23:8080` (your address). Story mode, Paradise Brawl and LAN battles all work from there.
3. Hold the phone sideways. On Android the game goes fullscreen when a match starts. On iPhone, tap Share → **Add to Home Screen** and start the game from the new icon to get the full screen without the browser bars.

Touch controls:

| Where | What it does |
| --- | --- |
| Left half of the screen | Drag to move; push all the way to run |
| Right half of the screen | Drag toward where you want to aim; past a short distance you attack. Aim snaps to an enemy within about 20 degrees |
| Quick tap on the right half | Attack once where you face |
| Weapon slots | Tap to switch, hold to drop |
| Skill circle, soup pouch, minimap | Tap to use the skill, drink soup, open the big map |
| Yellow button | Pick up, swap, drive, read (shows what it will do) |
| ⟳ / ⤒ / ☰ | Reload / jump / pause menu |

Phones zoom in a little compared with a computer screen so characters stay readable, so a phone player sees slightly less of the map. Tested in emulated Android and iPhone browsers (screen sizes, multi-touch, fullscreen, rotation); not yet on a physical device.

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
- **區網對戰 LAN Battle**: Paradise Brawl with friends. Everyone meets in a waiting room where the host picks how many bots join (see Multiplayer below).

## Difficulty

Five levels, picked on the character screen, in the multiplayer waiting room (host), or mid-game from the pause menu (Esc) in solo play:

| Level | Bots | Story enemies |
| --- | --- | --- |
| 1 新手 Beginner | React slowly, aim poorly, deal 55% damage to people in Paradise Brawl | 60% health, 20% damage, fire more slowly |
| 2 輕鬆 Casual | Slower and less accurate, 75% damage to people | 70% health, 27% damage, fire a little more slowly |
| 3 簡單 Easy | The earlier Easy | 80% health, 35% damage |
| 4 普通 Normal | The earlier Normal | 100% health, 42% damage |
| 5 困難 Hard | The earlier Hard | 125% health, 70% damage |

New players start on level 2. Story allies always fight at level 4 or higher, so an easier level never weakens your own team. A level changed from the pause menu applies at once to bot skill; enemy health applies to enemies that appear afterwards.

## Hidden details

Six things are hidden in every map. The title screen counts how many you have found (saved in your browser) and gives a one-line hint for each one still missing. Some you read or touch with F; one comes from the sky every minute or two.

## Weapons and items

- Common: fists, knife, pistol, uzi, shotgun, assault rifle, sniper, machine gun.
- Rare kitchen weapons (gold ring on the ground, extra damage): 平底鍋 frying pan (big knockback), 菜刀 cleaver, 擀麵棍 rolling pin (huge knockback), 中華炒鍋 wok (sets foes on fire), 飛筷 chopsticks (thrown, pierce one target), 飛碗 flying bowl (thrown, bounces off walls), and the legendary 冷凍旗魚 frozen swordfish (80 damage, slows). The captain drops his 魚叉槍 harpoon gun.
- Everyone carries a backpack with 3 weapon slots. The 保溫外送袋 thermal bag upgrades it to 4 weapon slots.
- Healing items never take a weapon slot. 雞湯 chicken soup goes into a separate medical pouch when you walk over it (up to 3, or 5 with the thermal bag); press H to drink one and heal 60. 小籠包 soup dumplings heal 40 on the spot. 「?」 ingredient crates break open for better loot.
- Delivery vans and scooters can be driven, and they hurt anyone they hit.
- Wooden buildings break: the striped food stalls and the brown-roofed cabins have plank walls that crack and give way after enough hits (bullets, melee, flame bursts, or driving into them). Once half of a building's walls are down, the whole thing collapses into rubble and its roof is gone. Brick houses and 允望樓 itself do not break.
- Every minute or two a cold-chain cargo plane crosses the map and parachutes a crate into the safe area. Press F on the landed crate for a rare kitchen weapon, one more item and something to heal with.

## Sound

Besides weapon sounds: wood knocks, cracks and a crash when a wooden building comes down, footsteps (faster when running), rustling in bushes, a thump on landing a jump, weapon switch clicks, van and scooter doors, a heartbeat below 30% health, a sizzle while standing in the thawing zone, heavy breathing when stamina runs out, a gong when a match or chapter starts, the cargo plane's engines and its crate landing, and a few more for the hidden details. All sounds are generated in the browser; nothing extra is downloaded.

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

## Multiplayer

One computer hosts; everyone else only needs the game.

1. **Host:** install [Node.js](https://nodejs.org) 16 or newer (no `npm install` needed), download the repository, and run the server from its folder:

   ```bash
   node server.js
   ```

   Or double-click `start-lan-server.bat` (Windows) / run `./start-lan-server.sh` (macOS, Linux). It prints an address such as `192.168.1.23:8080`. Allow Node.js through the firewall on private networks if your computer asks.
2. **Everyone, including the host:** open the game, either by visiting `http://<that address>` in a browser or by opening the downloaded `yunwang_paradise.html` and typing the address in the **伺服器位址 Server address** box. Pick a character and press **區網對戰 LAN Battle**.
3. **Waiting room:** the first person in is the host. The host picks **how many bots** join (0 to 29, as long as people plus bots stay at 30 or fewer), the bot difficulty and the **match mode**; everyone sees the settings and the player list, and anyone can switch character. The host presses **開始對戰 Start Match**. With only one person in the room at least one bot is added.
4. After a match everyone returns to the waiting room for the next one. If the host leaves, the next person becomes host.

Match modes:

| Mode | How it plays |
| --- | --- |
| 大亂鬥 Free-for-all | Everyone for themselves; last one standing wins. |
| 紅藍對戰 Red vs Blue | Everyone picks 紅隊 red, 藍隊 blue or 自動 auto in the waiting room; bots even out the sides. Teammates cannot hurt each other, and every player wears a ring in their team colour. The last side with anyone standing wins. |
| 全家合作 Family co-op | All people on one team against the bots. A fallen player watches a family member and comes back next to them after 6 seconds, with a pistol and two seconds of shield. The family loses only if everyone is down at the same time. |

### Playing with the whole family (8 people)

This was tested with 8 browsers in one room. Each player received 30 updates a second, the server used 1 to 1.5 ms of each 33 ms tick, and the host sent 0.7 to 1.1 MB/s in total (about 6 to 9 Mbit/s), which home Wi-Fi handles.

- Put the host computer on the same Wi-Fi as everyone, or better, on a cable to the router. Keep it plugged in.
- Everyone else needs only a browser: visit `http://<host address>` (no download needed), or open `yunwang_paradise.html` and type the address.
- Each person can use a computer (keyboard and mouse) or a phone or tablet (touch controls, see Phones and tablets above).
- For mixed ages, 全家合作 Family co-op on level 1 or 2 keeps everyone in the game. Every bot hunts the family in co-op, so start with about 1.5 bots per person (12 bots for 8 people) and add more if it is too easy. For a family rivalry, 紅藍對戰 Red vs Blue with each side picked in the waiting room.
- Several people can play the same character; names and team rings tell them apart.

The address works for anyone on the same Wi-Fi or LAN. Playing across the internet needs the host's router to forward the port, or a virtual LAN tool, and is not covered here.

Server options: `node server.js --port 8080 --bots 13 --difficulty 4 --mode coop` sets the port and the starting bot count, difficulty level 1 to 5 and mode (`ffa`, `teams` or `coop`); the host can still change them. The older difficulty names easy, normal and hard still work and mean 3, 4 and 5. `--autostart 15` starts matches on their own 15 seconds after someone joins, for a server nobody hosts from. `--stats` prints server load and bandwidth every 10 seconds.

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
| `assets/yunwang_theme.mp3` | 允望樓 theme, plays first |
| `assets/quiet_room.mp3` | 「two halves of a quiet room」, plays after the theme and in the multiplayer waiting room |
| `assets/bgm.mp3` | Earlier soundtrack, kept for a future feature (not played yet) |
| `yunwang_paradise.html`, `yunwang_paradise.zip` | Single-file build of the game, and the same file zipped for one-click download |
| `server.js` | LAN server: static files plus a minimal WebSocket implementation |
| `tools/build_single.js` | Builds `yunwang_paradise.html` with everything inlined |
| `tests/` | Automated checks |

After changing anything in `js/`, `css/`, `assets/` or `index.html`, rebuild the single-file version and its zip:

```bash
node tools/build_single.js
```

## Tests

```bash
node tests/sim_test.js
```

Runs without dependencies. It checks the map, the difficulty levels, every hidden detail and the airdrop, breakable buildings, the team and family co-op modes (including full 30-player matches with 8 people and their snapshot sizes), three full Paradise Brawl rounds, every character skill and passive, the kitchen weapon effects (knockback, burn, slow, bounce, pierce), the backpack slots and medical pouch, pickups, friendly fire, and plays each story chapter with an AI-controlled hero on levels 1 to 4 to confirm each chapter can be won on levels 1 to 3.

The browser tests (`tests/browser_test.js`, `tests/scenario_test.js`, `tests/details_test.js`, `tests/mobile_test.js`, `tests/lan_test.js`, `tests/family_test.js`) drive the real page with Playwright and save screenshots. They are optional and need Playwright, which this project does not install. `tests/lan_test.js` and `tests/family_test.js` (8 people in one room) need a server running first: `node server.js --port 8099 --stats`. `tests/playtest.js [shots dir] [level] [character] [rounds]` plays Paradise Brawl rounds through the keyboard and mouse and reports how each went.
