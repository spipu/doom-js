# lib3d_js

A pure-JavaScript 3D rendering engine — no external dependency, just for fun.

Renders 3D objects with lights, textures, and projection entirely in the browser using the HTML5 `<canvas>` API. Includes a full FPS physics engine with collision detection, gravity, jumping, crouching, and animated objects.

The main demo (Spipu-Doom, `index.html`) ships as a PWA and converts **any Doom-format WAD on the fly, entirely in the browser**: WAD files are stored in IndexedDB, parsed in JS (geometry, textures, doors, lifts, switches, weapons, and world things rendered as camera-facing sprites), and turned directly into in-memory engine objects — no server-side conversion, no generated files. Everything game-specific lives in **game profiles** (Doom, Freedoom, **Heretic**…) auto-detected from the WAD content, so other Doom-engine games plug in without touching the converter.

## Requirements

- A modern browser (Chrome, Firefox, Edge)
- Any static HTTP server (Apache, Nginx, or `python3 -m http.server`)
- A Doom WAD file (e.g. [Freedoom](https://freedoom.github.io/), BSD licensed)

## Getting started

Serve the `website/` directory with any HTTP server:

```bash
cd website
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser, add a WAD file (local file or URL), select it, start a new game (episode, then difficulty), and play.

## Spipu-Doom (`index.html`)

- **WAD list**: stored WADs persist in IndexedDB across sessions and updates; add one by URL (GitHub page URLs are rewritten to their raw equivalent, download failures are reported by cause) or as a local file, delete with confirmation. A `?` button opens the About page. Every menu screen shares one selection model — mouse, keyboard and gamepad drive the same highlighted entry.
- **WAD menu**: selecting a WAD opens its own menu — *New game*, *Load game*, *Options*, *About* and *Quit*.
- **Save / load**: five save slots per WAD (deleted with the WAD). A save captures the full game state — player, movers mid-travel, consumed triggers, monsters, counters — and loading rebuilds the level and restores it exactly; transient visuals (projectiles in flight, decals…) are not kept, and saving is refused while dead.
- **Episode and difficulty selection** (native Doom flow): the episodes actually present in the WAD are listed with their profile names, then a difficulty screen offers the five vanilla skills plus a skill 0, **No monsters**. The per-skill rules (thing filtering, ammo factor, player damage) follow the original games.
- **Pause menu**: `ESC` (gamepad button 9, `≡` on the virtual pad) freezes the game completely under a translucent overlay — *Resume*, *Load game*, *Save game*, *Options*, *Leave the level*. A click/Enter resume re-grabs the mouse (an `ESC` resume cannot — browser rule; click the canvas to re-aim).
- **Game profiles** (`js/doom/wad/profile/`): thing catalogs, special translations, weapons, monsters, progression, skies, switches, HUD layout — everything game-specific is profile data. `DefaultGameProfile` is the doom-format baseline and the fallback for unknown WADs; the Doom, Freedoom and Heretic profiles only carry their divergences, picked from signature lumps in the WAD. Heretic is fully playable (its own things, specials, skies, progression, 8-weapon arsenal and bestiary).
- **On-the-fly conversion** (`js/doom/wad/convert/`): level lumps, palette, picture/flat/texture decoding, animated sequences, sector floors and ceilings triangulated from the sector's own boundary, falling back to the WAD's own BSP for the sectors whose linedefs do not close (a couple of dozen over the five Doom-format IWADs), movers with keyframes — all instantiated directly into in-memory engine objects.
- **Moving elements & triggers**: doors (local, remote, fast, key-locked, closing, timed), lifts, rising floors, build-stairs, perpetual platforms, moving ceilings, crushers and the donut — every behaviour table verified against the original linuxdoom source. A door answers a press through its own faces, so it opens from the side its linedef declares and with the key that face demands — a door barred from the corridor and free from inside behaves like the original, and one that only a switch drives stays shut under your hand. A generic **trigger → target instances** model drives them: switches (with their `SW1`↔`SW2` swap, even when the graphic sits on a moving face), walk-over lines that fire on a **real crossing** like the original, teleporters, gun-activated lines, monster-crossed lines and **boss deaths** (the tag-666 actions of the boss maps). A door carries one cycle per special aimed at it, so mixed setups (an opener plus a closing line, a crusher on the same tag) behave like vanilla — and so does a lift: a raise special sharing its tag lifts the platform to a new top and the plain lift presses then ride the raised span, like the final arena of Doom II. Movers press back faithfully: crushers deal their 10 hp / 4 tics, a blocked door reopens, a blocked lift retries, and you can always walk out from under a pressing mover.
- **Sky**: rendered as a WebGL dome (azimuth/elevation mapping, vanilla wrap), mirrored below the horizon so sky floors show sky, each side fading into its own cap colour; the CPU renderers show the cap in the sky holes.
- **World things as sprites**: every non-enemy THING is a camera-facing billboard, lit by its sector, animated where Doom animates it, floor- or ceiling-anchored. Solid decorations block with Doom-style square hitboxes; pickups stay walk-through.
- **Monsters**: the full Doom/Doom 2 and Heretic bestiaries (35 definitions transcribed from the UZDoom actors) spawn with their eight vanilla rotation views, block, animate at 35 Hz, and are lit by the sector they currently stand in. They take damage from every player attack channel through a faithful `P_DamageMobj` pipeline — blood, pain, death and gib animations, vanilla kickback that shoves monsters and corpses around, item drops, chain-exploding barrels and pods — and kills are tallied on the HUD (`☠ x/y`). Movers press them like the player (`P_ChangeSector`): a crusher deals its 10 hp / 4 tics and grinds a corpse into a gib pool, a door closing on a monster reopens, and a stall mover waits against the body and resumes when it clears.
- **Monster AI**: vanilla wake-up (sight cone, sound flood through the sector graph, deaf *ambush* flag), vanilla chase (8-direction steps, stair climbing, dropoff refusal, opening manual doors), floaters, BOOM environmental physics (wind/conveyors/ice), complete skill 5 (fast states, instant reaction, nightmare respawn), and render-interpolated motion. Every teleport — player or monster — flashes the vanilla teleport fog at both the departure and the arrival spot. Monsters do not attack yet — their melee and missile states are transcribed but no attack verb fires. The death of the last boss of a map fires its map action (`A_BossDeath`): E1M8's barons lower the final block, MAP07's mancubi and arachnotrons move their floors, E2M8/E3M8 end on the boss's death.
- **Single-player thing filtering**: vanilla flag rules — multiplayer-only things dropped, skill bits honoured.
- **Player physics**: vanilla Doom metrics (gravity, 24-unit steps, GZDoom jump height), smoothed camera on stairs, a kill plane under the map, and `ML_BLOCKING` lines honoured (they stop bodies at any height, never shots or sight).
- **Player equipment & pickups**: weapons / shared ammo pool / keys / timed effects / armor, with the vanilla pickup rules (a full item stays on the ground, weapons hand out ammo, armor classes); weapons, ammo and armor persist across levels, keys and effects reset. Locked doors require their key. Every power-up with a live effect shows a labelled line above the health bar (timed ones with a countdown, berserk permanently) and its own screen feedback: golden wash for invulnerability, green tint for the radiation suit, scene-wide night vision for the light visor and Heretic torch, translucent weapon for partial invisibility — each blinking through the vanilla end-of-effect warning.
- **Weapons**: the nine Doom weapons and the eight Heretic weapons fire through a generic verb machine — every table (states, spreads, puffs, decals, projectiles, fallback order) is profile data from the original sources. Vanilla psprite behaviour (bob, eased switching, refire, Heretic hold loops), free-aim hitscans, projectiles with fans / ballistic drops / bounces (the Firemace is fully alive), persistent impact decals that ride moving walls, and a view sprite shaded by the sector light. On death the weapon drops out of view.
- **HUD**: a modern DOM/CSS HUD in the screen corners — health, armor, ammo, keys, secrets `★ x/y`, kills `☠ x/y`, ARMS panel and active weapon name — adapting to the loaded game. **H** toggles a textual debug overlay; an optional crosshair is settable live.
- **Weapon switching**: **F** / **G** on the keyboard, shoulder buttons 4/5 on a gamepad, or the HUD's top-right tap zone on the virtual pad.
- **Sector effects**: damaging floors (with the E1M8 finale rule), "+change" floor mutations, scrolling walls, the vanilla dynamic light thinkers, UZDoom-style distance light diminishing and a sector light floor (the original never renders absolute black), a live texture-smoothing toggle, secret counting, and the Heretic pushes — winds, conveyors, scrolling lava, inertial ice — applied to the player and every monster.
- **Level chaining**: exits (switch or walk-over) chain to the next level with the vanilla progression rules (secret exits included), overridable by a `UMAPINFO` lump; episode ends, MAP30 and the end of the WAD return to the menu. A finished level freezes on its tally — time spent, enemies, items and secrets, each as *found / total* and a percentage — and waits for you to ask for the next level.
- **Build error modal**: a failed level build shows its cause and drops back to the WAD list.
- **Gamepad support**: press any button on a connected gamepad to use it (left stick to move, right stick to look, both analog).
- **Touch controls**: touch-only devices get a virtual gamepad laid out for a **4-finger claw grip** — a dynamic move stick in the bottom-left quadrant, the whole right half as a floating aim stick split into an *aim* band and an *aim + fire* band (the mode is locked per gesture), jump/crouch and the menu top-left, use bottom-right, and the weapon-switch zone top-right. Each gesture has its own settable dead zone, and the firing gesture a settable aim sensitivity.
- **Menu footer**: every menu screen shows the aggregated version, the webapp stats and the copyright.
- **Options modal & persistent settings**: a Display page (language, crosshair, distance shading, texture smoothing), a Controls page that adapts to the active input device — including **full keyboard remapping**, one key per action — and a confirmed reset; everything persists in IndexedDB.
- **Translation (fr / en)**: every user-facing text goes through a translation catalog addressed by code; locale-dependent formats (sizes, dates, percents) go through `Intl`. The language is a persisted setting defaulting to English; proper nouns are never translated.

## Demo pages

| Page | Description |
|---|---|
| `index.html` | Spipu-Doom — WAD menu + on-the-fly level conversion, PWA, 1920×1080 virtual screen |
| `_examples/index.html` | Home page — links to all demos |
| `_examples/objects.html` | Object viewer — pick an object, resolution and renderer |
| `_examples/example.html` | Static render of the Lotus F1 |
| `_examples/lights.html` | Coloured light sources demo (arrow keys move lights) |
| `_examples/game.html` | Interactive van — drive it with the arrow keys |
| `_examples/world.html` | First-person navigation inside a 3D labyrinth |

## Controls (index.html / _examples/world.html)

Keyboard defaults below are **physical key positions** (WASD = ZQSD on an AZERTY layout) and every one of them can be remapped in the Options modal (from a WAD's menu), one key per action — except `ESC`, the fixed pause key.

| Keyboard / mouse | Gamepad | Action |
|---|---|---|
| WASD | Left stick | Move / strafe (analog on the stick) |
| Mouse (click canvas first) | Right stick | Look around |
| Left Shift | Button 1 | Jump |
| Left Ctrl | Button 0 | Crouch — careful: holding it with the key that types `q` is Ctrl+Q, which quits Firefox (a browser-privileged shortcut); remap if it bites you |
| E | Button 3 | Interact (open door, trigger lift or switch) |
| Left click / Q | Button 2 / right trigger | Fire the active weapon |
| ESC | Button 9 | Pause menu over the frozen game (not remappable) |
| F / G | Buttons 4 / 5 | Previous / next weapon (wrapping) |
| H | — | Toggle the game HUD ↔ debug overlay (keyboard only) |
| Left Alt | — | Walk slowly (sticks do it through partial deflection) |
| IJKL | — | Look around — keyboard fallback when the mouse / Pointer Lock is unavailable |
| O | — | Debug cheat (not remappable): grant the full kit |

The gamepad is only visible to the page after a button has been pressed on it (browser privacy rule); it then takes priority over keyboard+mouse. Touch-only devices select the virtual gamepad (see **Touch controls** above). On iOS the touch mapping and the menus stay aligned with the display across device rotation.

## Renderer modes

Four rendering modes are available via the **Renderer** selector on `objects.html`:

| Mode | Description |
|---|---|
| `webgl` | WebGL — GPU shaders, z-buffer, texture mapping (default, falls back to `full` if unavailable) |
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading (one colour per face) |
| `fast` | Wireframe — no lighting, canvas 2D paths only |

Whatever the mode, instances are frustum-culled in camera space before any per-vertex work; the static level map is one single object, always drawn whole.

## Architecture

The static collision geometry is indexed once per level in a uniform XZ spatial grid, so every floor/wall/ray query only tests the triangles of the cells it touches. Dynamic movers stay on a linear scan.

```
website/
├── index.html                Spipu-Doom shell (PWA)
├── appServiceWorker.js       Service Worker — cache-first, offline (must stay at webroot: SW scope)
├── css/                      Shell + menu styles
├── assets/uzdoom/            UZDoom impact-decal graphics (GPL v3 — own LICENSE.md + README.md)
├── _examples/                Simple demos + their assets and bootstrap definitions
└── js/
    ├── webapp/               Generic webapp layer — bootstrap/versioning, IndexedDB wrapper, translation catalog, wake lock
    ├── doom/                 The Spipu-Doom game
    │   ├── libBootstrap.json    Doom bootstrap definition (version + file lists)
    │   ├── doomGame.js          Level lifecycle, game loop, catalogs, pickups
    │   ├── doomUser.js          Player equipment state
    │   ├── doomSettings.js      Persistent settings (IndexedDB)
    │   ├── doomTranslations.js  Every user-facing text (fr + en)
    │   ├── main.js              Entry point
    │   ├── save/                Save slots + level snapshot (deterministic rebuild + state patch)
    │   ├── object/              Immutable definitions (weapons, ammo, items, decorations, thing catalog)
    │   ├── monster/             Monster system: defs, 35 Hz driver, locomotion, senses, damage, boss deaths
    │   ├── hud/                 Game HUD + debug overlay
    │   ├── menu/                DOM menu screens and modals (WAD list, episodes, options, pause, save slots)
    │   ├── weapon/              Weapon machinery: psprite machine, hitscan, projectiles, effects, decals
    │   └── wad/                 WAD reading + IndexedDB storage, game profiles (profile/), on-the-fly converter (convert/)
    └── engine/               Game-agnostic 3D engine
        ├── libBootstrap.json    Engine bootstrap definition (version + file lists)
        ├── engine3d.js          Viewport, lights, render loop, frustum culling
        ├── collision.js         FPS physics: spatially indexed triangles, box blockers, mover pressure
        ├── spatialGrid.js       Uniform XZ grid over a static triangle set
        ├── entity/              Object3d, Billboard, Instance (keyframes/triggers/cycles), User, World, external forces
        ├── input/               Unified inputs: keyboard, mouse, gamepad, virtual touch gamepad
        ├── interaction/         Interaction bases (switch modes once/timed/toggle)
        ├── loader/              URL or in-memory loaders (textures, objects, instances, interactions, world)
        ├── hud/                 HUD bases (debug overlay, screen flash)
        └── renderer/            webgl / full / flat / fast renderers
```

Demo objects (cube, sphere, lotus, van…) and the labyrinth world live in `_examples/assets/`.

## In-memory loading

The engine loaders accept either URLs (classic flow, used by the demo pages) or in-memory data (used by the WAD converter):

```javascript
loader.reset();
loader.beginBatch();                                    // suspends the global finalize check
const texId = loader.textures().loadFromData(null, imageData);          // ImageData
const objId = loader.objects().loadFromData('map', {textures, points, faces});
loader.instances().loadFromData(null, {...instanceData, object: objId});
loader.interactions().loadFromData(new DoomSwitchInteraction(...));
loader.world().loadFromData(definition);                // user, background, lights
loader.setCallback(init);
loader.endBatch();                                      // finalizes everything once, fires init
```

## Webapp bootstrap

Every page is loaded by the generic `appBootstrap` (global instance). Each library declares its files in a `libBootstrap.json` definition (`{version, files: {assets, css, js}}`); pages stack the definitions they need and register their entry point:

```html
<div id="screen"></div>
<script src="/js/webapp/appBootstrap.js"></script>
<script>
function loadApp()
{
    loader.world().load('./assets/world/definition.json');
    loader.setCallback(init);
}

appBootstrap.disablePwaMode();                                       // demos only — doom keeps PWA mode
appBootstrap.addBootstrapDefinition('/js/engine/libBootstrap.json');
appBootstrap.addBootstrapDefinition('./assets/world.json');
appBootstrap.setReadyCallback(loadApp);
</script>
```

Versions are aggregated (`v2.001|v1.018`): a change in any stacked definition triggers a full update — in PWA mode the Service Worker clears its cache and re-downloads everything; in classic mode the page reloads with `?v=` cache-busted URLs (`appBootstrap.buildUrl`).

## Page pattern

```javascript
function init() {
    const world = loader.world().get();
    screen = new ScreenManager('screen', { fullscreen: true });  // or { width, height }
                                                                 // or { fullscreen: true, virtualWidth: 1920, virtualHeight: 1080 }
    inputs = new Inputs().bindScreen(screen);  // one single instance per page, rebound on each level
    engine = new Engine3d(screen, new Object3dRendererList().getRenderer('webgl'));  // binds itself to the screen
    const hud = new HudDebug(engine)
        .bindUser(world.getUser()).bindInputs(inputs)
        .addDescription('(c)2026 Spipu')
    ;
    screen.bindHud(hud);
    engine.initFromWorld(world);
    requestAnimationFrame(animate);
}

function animate(timestamp) {
    engine.calculateDeltaTime(timestamp);
    world.update(engine.getDeltaTime(), inputs);
    engine.displayWorld(world);
    screen.update(); // updates HUD overlay
    requestAnimationFrame(animate);
}
```

## Versioning

After any file change, increment the `version` field of the `libBootstrap.json` of the modified library (engine, doom, or the demo's definition JSON). This drives both the PWA cache refresh and the classic-mode cache busting.

## Todo - Next steps

* **Automap**: nothing today, which also leaves the two map power-ups sitting inert in the thing catalogs.
* **Episode & game finale screens**: an episode, MAP30 or the end of a WAD currently drops straight back to the menu, without the narrative text screens or the Doom II cast call.
* **Screen melt between levels**: the vanilla wipe, once the tally and finale screens exist to be wiped into.
* **Monster attacks**: monsters chase, hurt nobody and die politely — their melee and missile states are transcribed but no attack verb fires. The pieces they need (damage pipeline, projectiles, line of sight) are already in place, so this is the one gap that turns the world into a game.
* **Sounds & music**: there is no audio at all. Doom's whole feedback loop leans on it — the door you hear open behind you, the growl that tells you a room woke up, the shot that gives your position away.
* **Heretic inventory**: the artifact bar and everything it holds (flight, tome of power, morph ovum…) is the last large gap of an otherwise playable game.
* **PWAD compatibility**: the converter understands vanilla specials only, so most community WADs load with dead lines and stock actors — this means DEHACKED and the BOOM generalized specials.
* **Hexen**: the WAD loads under the fallback profile only. It needs its own thing and special semantics, its hub progression, and its script and polyobject machinery.
* **Vanilla polish pass**: the small fidelity gaps knowingly left aside — no fog on a nightmare respawn, blood and late puff frames still fullbright, no silent teleports.
* **Rendering performance & quality options**: the game is hardwired to the WebGL renderer with no quality settings; a face and draw-call budget, plus a resolution or draw-distance option, would decide how well it runs on a phone.

## License

This program is distributed under the MIT License — see the [./LICENSE.md](./LICENSE.md) file — except the `website/assets/uzdoom/` directory (impact-decal graphics taken from UZDoom), which is distributed under the GPL v3 with its own LICENSE.md and attribution README. Removing that directory yields a 100% MIT distribution.
