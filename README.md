# Spipu-Doom

Doom in the browser, in pure JavaScript — no framework, no build step, no server side.

Spipu-Doom (`index.html`) ships as a PWA and converts **any Doom-format WAD on the fly, entirely in the browser**: WAD files are stored in IndexedDB, parsed in JS (geometry, textures, doors, lifts, switches, monsters, weapons, sounds and music) and turned directly into in-memory engine objects — no server-side conversion, no generated files. Everything game-specific lives in **game profiles** (Doom, Freedoom, **Heretic**…) auto-detected from the WAD content, so other Doom-engine games plug in without touching the converter.

It runs on **Spipu3D** (`js/engine/`), the 3D engine written for it: renderer, FPS physics, entities, inputs and audio, with no knowledge of Doom whatsoever. The demos in `_examples/` drive that same engine on other scenes.

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

## Features

- **WAD list**: stored WADs persist in IndexedDB across sessions and updates; add one by URL or local file, delete with confirmation. Mouse, keyboard, gamepad and touch drive every menu the same way.
- **WAD menu & game flow**: *New game*, *Load game*, *Options*, *About*, *Quit* — then the episodes actually present in the WAD and the five vanilla skills plus a pacifist skill 0 — the normal-skill world, but the monsters never attack — with the original per-skill rules.
- **Save / load**: five slots per WAD; a save captures the full game state and loading rebuilds the level and restores it exactly (transient visuals excepted).
- **Pause menu**: `ESC` freezes the game under a translucent overlay — resume, load, save, options, leave the level.
- **Game profiles** (`js/doom/wad/profile/`): everything game-specific — things, specials, weapons, monsters, progression, skies, sounds, HUD — is profile data, auto-detected from the WAD content. Doom, Freedoom and Heretic are fully playable; unknown WADs fall back to the doom-format baseline.
- **On-the-fly conversion** (`js/doom/wad/convert/`): geometry, textures, animations and movers are instantiated directly into in-memory engine objects — no generated file, no server.
- **Moving elements & triggers**: doors (manual, remote, key-locked, timed), lifts, rising floors, stairs, perpetual platforms, moving ceilings, crushers and the donut, driven by switches, walk-over lines, gunfire, teleporters and boss deaths — behaviours verified against the original sources, including per-side and per-key door activation, and movers that crush, reopen or stall against whoever blocks them.
- **World things**: every non-enemy THING is a camera-facing sprite, lit by its sector and animated like the original; solid decorations block (and follow a moving floor), pickups are reached inside a vanilla-style cylinder.
- **Monsters**: both complete bestiaries with the full vanilla combat loop — blood, pain, deaths and gibs, knockback, item drops, chain-exploding barrels — and the vanilla AI: wake-up by sight or sound, 8-direction chase, door opening, floaters, every attack of both games, infighting, resurrections, complete skill 5, the boss map actions and Doom II's Icon of Sin. Movers press the bodies like they press the player.
- **Player**: vanilla physics (gravity, steps, jump, optional crouch and fall damage, blocking lines), vanilla equipment rules (shared ammo pools, armor classes, keys, timed power-ups with their screen effects and HUD countdowns), and single-player thing filtering by skill.
- **Weapons**: the nine Doom and eight Heretic weapons with faithful behaviour — free-aim hitscans, projectiles with fans, ballistic drops and bounces, persistent impact decals, sector-lit view sprite — every table being profile data from the original sources. Switch with **F**/**G**, gamepad shoulders, or the virtual pad.
- **HUD & automap**: a modern corner HUD (health, armor, ammo, keys, secrets, kills, ARMS panel) adapting to the loaded game, a debug overlay on **H**, an optional crosshair, and a translucent automap (**Tab**) over the running game, revealed like the original.
- **Sector effects**: damaging floors, floor mutations, scrolling walls, dynamic lights, distance shading, secret counting, and the Heretic pushes (wind, conveyors, ice) on player and monsters.
- **Level chaining & story texts**: exits follow the vanilla progression (secret exits included, `UMAPINFO` overrides honoured) through a tally modal — time, enemies, items, secrets — followed by the game's own chapter texts (from the WAD when it tells its own story, else the translated catalog).
- **Sound effects**: the WAD's own sounds decoded on the fly — weapons, pickups, movers, teleports, player, monsters, Heretic ambients — spatialised per game and frozen with the pause. The menus use light synthesized clicks, WAD-independent, with distinct accents for navigation, validation and cancel. Two live volume settings.
- **Music**: the WAD's own songs (MUS or MIDI lumps) synthesized in real time on an OPL3 FM emulator fed with the WAD's own GENMIDI instrument bank — the original Sound Blaster sound, no external asset. Title music on the WAD menu, each level's own song in game (with the vanilla reuse rules), the intermission theme over the tally and story screens.
- **Options & persistent settings**: Display, Game, Sound and Controls pages — full keyboard remapping included, one key per action — persisted in IndexedDB, with a confirmed reset.
- **Inputs**: keyboard+mouse, gamepad (press a button to activate it), or a touch virtual gamepad laid out for a 4-finger claw grip, with per-gesture dead zones and firing sensitivity.
- **Translation (fr / en)**: every user-facing text goes through a translation catalog addressed by code; locale-dependent formats go through `Intl`.
- **Robustness**: a failed level build reports its cause and returns to the WAD list; every menu screen shows the aggregated version, the webapp stats and the copyright.

## Controls

Keyboard defaults below are **physical key positions** (WASD = ZQSD on an AZERTY layout) and every one of them can be remapped in the Options modal (from a WAD's menu), one key per action — except `ESC`, the fixed pause key. The `_examples/world.html` demo answers to the same keys.

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
| Tab | D-pad up | Show / hide the automap over the game |
| Left Alt | — | Walk slowly (sticks do it through partial deflection) |
| IJKL | — | Look around — keyboard fallback when the mouse / Pointer Lock is unavailable |
| O | — | Debug cheat (not remappable): grant the full kit |

The gamepad is only visible to the page after a button has been pressed on it (browser privacy rule); it then takes priority over keyboard+mouse. Touch-only devices select the virtual gamepad (see **Inputs** above). On iOS the touch mapping and the menus stay aligned with the display across device rotation.

## The Spipu3D engine

`js/engine/` is a standalone 3D engine with no external dependency: it renders textured, lit 3D objects entirely in the browser through the HTML5 `<canvas>` API, and carries a full FPS physics engine (collision detection, gravity, jumping, crouching, animated objects). It never depends on `js/doom/`: it exposes parameterisable primitives (depth shading, per-instance light and render offset, external forces, screen sprites…) that the game layer feeds with its own constants.

Four rendering modes are available, selectable via the **Renderer** selector on `_examples/objects.html`:

| Mode | Description |
|---|---|
| `webgl` | WebGL — GPU shaders, z-buffer, texture mapping (default, falls back to `full` if unavailable) |
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading (one colour per face) |
| `fast` | Wireframe — no lighting, canvas 2D paths only |

Whatever the mode, instances are frustum-culled in camera space before any per-vertex work; the static level map is one single object, always drawn whole.

### Demo pages

| Page | Description |
|---|---|
| `_examples/index.html` | Home page — links to all demos |
| `_examples/objects.html` | Object viewer — pick an object, resolution and renderer |
| `_examples/example.html` | Static render of the Lotus F1 |
| `_examples/lights.html` | Coloured light sources demo (arrow keys move lights) |
| `_examples/game.html` | Interactive van — drive it with the arrow keys |
| `_examples/world.html` | First-person navigation inside a 3D labyrinth |

Demo objects (cube, sphere, lotus, van…) and the labyrinth world live in `_examples/assets/`.

## Architecture

The static collision geometry is indexed once per level in a uniform XZ spatial grid, so every floor/wall/ray query only tests the triangles of the cells it touches. Dynamic movers stay on a linear scan.

```
website/
├── index.html                Spipu-Doom shell (PWA)
├── appServiceWorker.js       Service Worker — cache-first, offline (must stay at webroot: SW scope)
├── css/                      Shell + menu styles
├── assets/uzdoom/            UZDoom impact-decal graphics + finale texts (GPL v3 — own LICENSE.md + README.md)
├── _examples/                Spipu3D demos + their assets and bootstrap definitions
└── js/
    ├── webapp/               Generic webapp layer — bootstrap/versioning, IndexedDB wrapper, translation catalog, wake lock
    ├── lib/libadlmidi/       Vendored libADLMIDI-JS OPL3 synthesizer (LGPL v3 — own LICENSE.md + modification README.md)
    ├── doom/                 The Spipu-Doom game
    │   ├── libBootstrap.json    Doom bootstrap definition (version + file lists)
    │   ├── doomGame.js          Level lifecycle, game loop, catalogs, pickups
    │   ├── doomUser.js          Player equipment state
    │   ├── doomSettings.js      Persistent settings (IndexedDB)
    │   ├── doomTranslations.js  Every user-facing text (fr + en)
    │   ├── doomFinaleTexts.js   Finale-text catalogs of the games (loaded from assets/)
    │   ├── main.js              Entry point
    │   ├── save/                Save slots + level snapshot (deterministic rebuild + state patch)
    │   ├── sound/               Game audio: WAD sound loading, logical-name catalog (profile SNDINFO tables), music orchestration
    │   ├── object/              Immutable definitions (weapons, ammo, items, decorations, thing catalog)
    │   ├── monster/             Monster system: defs, 35 Hz driver, locomotion, senses, attacks, damage, boss deaths and the Icon of Sin
    │   ├── automap/             Level map: line model, state, and the vanilla BSP reveal
    │   ├── hud/                 Game HUD + debug overlay + automap layer
    │   ├── menu/                DOM menu screens and modals (WAD list, episodes, options, pause, save slots)
    │   ├── weapon/              Weapon machinery: psprite machine, hitscan, projectiles, effects, decals
    │   └── wad/                 WAD reading + IndexedDB storage, game profiles (profile/), on-the-fly converter (convert/)
    └── engine/               Spipu3D — the game-agnostic 3D engine
        ├── libBootstrap.json    Engine bootstrap definition (version + file lists)
        ├── engine3d.js          Viewport, lights, render loop, frustum culling
        ├── collision.js         FPS physics: spatially indexed triangles, box blockers, mover pressure
        ├── spatialGrid.js       Uniform XZ grid over a static triangle set
        ├── entity/              Object3d, Billboard, Instance (keyframes/triggers/cycles), User, World, external forces
        ├── input/               Unified inputs: keyboard, mouse, gamepad, virtual touch gamepad
        ├── interaction/         Interaction bases (switch modes once/timed/toggle)
        ├── loader/              URL or in-memory loaders (textures, objects, instances, interactions, world)
        ├── sound/               Audio primitives: shared AudioContext with music/effects buses, in-memory PCM samples, tone synthesis, music player over a swappable synth contract
        ├── hud/                 HUD bases (debug overlay, screen flash)
        └── renderer/            webgl / full / flat / fast renderers
```

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

* **Heretic inventory**: the artifact bar and everything it holds (flight, tome of power, morph ovum…) is the last large gap of an otherwise playable game.
* **PWAD compatibility**: the converter understands vanilla specials only, so most community WADs load with dead lines and stock actors — this means DEHACKED and the BOOM generalized specials.
* **Hexen**: the WAD loads under the fallback profile only. It needs its own thing and special semantics, its hub progression, and its script and polyobject machinery.
* **Vanilla polish pass**: the small fidelity gaps knowingly left aside — no fog on a nightmare respawn, blood and late puff frames still fullbright, no silent teleports.
* **Rendering performance & quality options**: the game is hardwired to the WebGL renderer with no quality settings; a face and draw-call budget, plus a resolution or draw-distance option, would decide how well it runs on a phone.

## License

This program is distributed under the MIT License — see the [./LICENSE.md](./LICENSE.md) file — except the `website/assets/uzdoom/` directory (impact-decal graphics and finale texts taken from UZDoom), distributed under the GPL v3, and the `website/js/lib/libadlmidi/` directory (the vendored libADLMIDI-JS music synthesizer), distributed under the LGPL v3 — each with its own LICENSE.md and attribution README. Removing those two directories yields a 100% MIT distribution.
