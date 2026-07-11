# lib3d_js

A pure-JavaScript 3D rendering engine — no external dependency, just for fun.

Renders 3D objects with lights, textures, and projection entirely in the browser using the HTML5 `<canvas>` API. Includes a full FPS physics engine with collision detection, gravity, jumping, crouching, and animated objects.

The main demo (Spipu-Doom, `index.html`) ships as a PWA and converts **any Doom WAD on the fly, entirely in the browser**: WAD files are stored in IndexedDB, parsed in JS (geometry, textures, doors, lifts, switches, and world things rendered as camera-facing sprites), and turned directly into in-memory engine objects — no server-side conversion, no generated files.

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

Then open `http://localhost:8080` in a browser, add a WAD file (local file or URL), pick a difficulty and a level, and play.

## Spipu-Doom (`index.html`)

- **WAD menu** (1920×1080 letterboxed virtual screen): list of stored WADs, add by URL or local file, delete with confirmation. Binary files persist in IndexedDB (`spipudoom` database) across sessions and app updates.
- **Difficulty selection**: after picking a WAD, a difficulty screen offers the five canonical Doom skills (*I'm too young to die* … *Nightmare!*); the chosen skill drives the single-player thing filtering below and is kept across the level chain.
- **Level list**: the WAD directory is parsed (`WadFile`) and every map marker (ExMy / MAPxx) is listed.
- **On-the-fly conversion** (`js/doom/wad/convert/`): full JS port of the historical Python converter — level lumps, PLAYPAL palette, picture/flat decoding, TEXTURE1/2 composition, ANIMATED sequences, ear-clipping triangulation with hole bridge cuts (plus a robust earcut fallback for complex multi-hole sectors), Doom-accurate doors/lifts/switches with keyframes. Everything is instantiated directly in the engine loaders (textures as `ImageData`, no URL, no fetch).
- **Moving elements & triggers**: doors (local, remote/tagged, fast, key-locked), lifts (switch/walk, fast, lower-to-lowest/highest/+8), rising floors (fixed +24/+32 and computed targets: lowest surrounding ceiling incl. crush variants, next-higher floor — with a deliberate 1 s static pre-frame so the player can step onto the platform), **build-stairs** (specials 7/8/100/127), and teleporters (linedef → thing-14 landing). All behaviour tables (speeds, targets, W1/WR/S1/SR modes, open-stay vs open-wait-close) are aligned with the original linuxdoom source (`p_spec.c`/`p_switch.c`/`p_doors.c`/`p_floor.c`/`p_plats.c`). A generic **trigger → target instances** model drives them: a **switch** (press), a **walk-over zone** (an invisible planar-proximity instance at the linedef — XZ-only so it fires whatever the player's height, e.g. atop a raised lift), or a teleport pad. A **tagged** door is remote — never self-activated: crossing one of its trigger lines opens every door of that tag, so e.g. grabbing a key ringed by trigger lines opens the doors elsewhere (a local, tag-0 door still opens by walking into it). **Switches** sit on a one-sided middle wall *or* on the lower (step riser) / upper of a two-sided line, from either side, and their `SW1`↔`SW2` graphic swaps both ways; a switch line with no `SW` graphic (e.g. an SR lift edge) still works, as an invisible USE zone that fires its targets. Lift risers are self-contained (every perimeter edge, neighbour-then-fallback texture). **Stairs** build a chain of one-way rising steps from the tagged base sector through adjacent same-flat neighbours (cumulated +8 / +16 height); all steps start together and their staggered travel produces the bottom-up ripple — the higher step owns each shared riser. **Closing doors** (close-stay and close-wait-reopen), **perpetual platforms** (with their stop lines, resumable stasis), **moving ceilings** (raise-to-highest with its companion floor lower, lower-to-floor and crush variants), **crushers** (slow/fast/silent, endless loop, stop lines) and the **donut** (tagged pillar lowers while the untagged ring around it rises to the outer level) are all in as well. Things standing on a moving floor ride it (a pickup on the donut pillar comes down with it). The only trigger kinds left are the gun-fired (G1/GR) and monster-crossed lines, pending weapons and enemies.
- **Sky**: a sky-ceiling sector (`F_SKY`) draws no geometry, and no wall is drawn between two adjacent sky ceilings (continuous sky). The level's sky texture (`SKYx`, picked by episode/map) is rendered in a WebGL pre-pass as a **dome**: a full-screen quad whose fragment shader maps each pixel's 3D view ray to the sky by **azimuth** (wrapping ~4× per 360° like vanilla) and **elevation** (so it curves with the camera and converges looking up), shifted slightly down (`EL_DOWN`) so the sky's base dips just below the walls. It fades its top into a flat cap colour — the average of the texture's top row, which also doubles as the scene background — and **below the horizon it cuts sharply to that cap** (no texture stretch, like modern ports). The sky texture is prepared **opaque** (the dead bottom padding rows Doom leaves below the image are cropped, any stray gaps filled horizontally) so it filters smoothly (`LINEAR`) instead of pixelated. The CPU `full` renderer has no dome and just shows the cap-coloured background in the sky holes.
- **World things as sprites**: every non-enemy THING (decorations, obstacles, gore, corpses, pools, animated torches/lamps, ceiling-hung gore, and pickups — weapons, ammo, health/armor, power-ups, keys) is read from the THINGS lump and drawn as a generic **billboard** (`Billboard extends Object3d`) — a cylindrical (Y-axis) sprite that faces the camera and leans naturally in perspective when you look up or down. Lit by its sector brightness, anchored to the floor or ceiling (with the foot floor-clipped so sprites never sink below the floor), with animated frames where Doom animates them. Mapping lives in `DoomThingCatalog`. **Solid** decorations (barrels, pillars, trees, torches…) block the player with a Doom-style **square hitbox** (axis-of-least-penetration slide, height-gated so you can pass under ceiling-hung things); pickups and non-solid props stay walk-through.
- **Single-player thing filtering**: like the real game (`P_SpawnMapThing`), each THING is gated by its `flags` — multiplayer-only things (`0x10`) are dropped, and a thing only appears if the chosen skill's bit is set (skill 1-2 → `0x01`, 3 → `0x02`, 4-5 → `0x04`). This matches what vanilla single-player shows (no co-op/deathmatch-only weapons).
- **Player physics**: Doom metrics verified against the original source — eyes at `VIEWHEIGHT` 41, radius 16, height 56 units shaved by ~1% (vanilla lets the player through an opening of *exactly* 56, our vertical clearance is stricter — the margin restores those tight passages), **vanilla gravity** (1 unit/tic² ≈ 19.14 m/s²), 24-unit steps, and the **GZDoom jump height** (JumpZ 8 → 36-unit peak). Climbing a step keeps the eye at its world height and lets it catch up at 0.6× gravity (**smooth step**, both directions: walking down within step height snaps the body to the lower floor while the camera floats down — a deliberate deviation from vanilla's briefly-airborne stair descent). Falling out of the map (through a geometry hole) hits a **kill plane** at y −100: the body rests there and the player dies.
- **Player equipment & pickups**: the `DoomUser` carries weapons / ammo (shared pool) / keys / power-up effects and armor; weapons, ammo and armor persist between levels while keys and timed effects reset (data-driven via `resetOnNewLevel`). Walking over a pickup applies its catalog effect through `DoomGame.applyPickup` and despawns the sprite — Doom-faithfully: picking up a weapon also hands out ammo (2× the type's clip, doubled on skill 1/5), an item already full (health/armor/ammo) or a key already held is left on the ground, and armor is a single 0→200 counter whose type only sets the absorption (green 100/⅓, blue 200/½). A brief golden screen flash confirms each pickup. **Locked doors** (blue/red/yellow key specials) only open if you hold the matching key. **Invulnerability** blocks all damage while active; the other timed power-ups (radiation suit, invisibility, light visor) are carried as state pending their target systems (sector damage, enemies, full-bright rendering).
- **Level chaining**: an exit — a switch (specials 11/51) or a **walk-over line** (52/124, same invisible zone as the walk triggers, no target) — shows a "level finished" modal, then the next level of the WAD is converted and started; after the last level you are back to the menu. **Secret exits** (51/124) follow the vanilla progression (`G_DoCompleted`) applied to the WAD's level names — the WAD format itself carries no progression data: ExMy → ExM9 (normal exit of ExM9 returns to the episode's map: E1M4/E2M6/E3M7/E4M3), MAPxx → MAP31 (MAP31 → MAP32; leaving 31/32 returns to MAP16), with a sequential fallback when the target level is missing. The rules live in `WadConstants.nextLevelName` (a `UMAPINFO` lump, when supported, would take precedence).
- **Build error modal**: if level generation throws, the cause (message + top of the stack) is shown in a centred modal on top of the console log, then you drop back to the WAD list.
- **Gamepad support**: press any button on a connected gamepad to use it (left stick to move, right stick to look — both analog). The pause button (`P` on the keyboard, button 9 on the gamepad) leaves the level and goes back to the level list of the WAD.
- **Touch controls**: touch-only devices get an on-screen virtual gamepad — two fixed, always-visible analog sticks (left = move, right = look) plus the four action buttons laid out around the right stick like a DualSense face cluster (△ action on top, ○ jump right, □ fire left, ✕ crouch bottom) and a pause button in the top-right corner.
- **Startup footer**: the first menu screen shows the aggregated version and the webapp stats (PWA/classic mode, offline, request counters) below the panel.

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

| Keyboard / mouse | Gamepad | Action |
|---|---|---|
| Arrow keys / ZQSD | Left stick | Move / strafe (analog on the stick) |
| Mouse (click canvas first) | Right stick | Look around |
| Shift | Button 1 | Jump |
| Ctrl | Button 0 | Crouch |
| E | Button 3 | Interact (open door, trigger lift or switch) |
| Left click | Button 2 / right trigger | Fire (reserved — no weapons yet) |
| P | Button 9 | Quit the level, back to the level list |
| Alt | — | Walk slowly (sticks do it through partial deflection) |
| IJKL | — | Look around — keyboard fallback when the mouse / Pointer Lock is unavailable |
| ESC | — | Release mouse |
| O | — | Spipu-Doom debug cheat: grant the full kit (every weapon, all ammo at max, the three keys, full energy and full 200 blue armour) |

The gamepad is only visible to the page after a button has been pressed on it (browser privacy rule); it then takes priority over keyboard+mouse. Touch-only devices (phones, tablets) select the virtual gamepad mode: two fixed, always-visible analog sticks (left = move, right = look) with the action buttons arranged around the right stick at the DualSense face-button positions, plus a pause button in the top-right corner. Each button lights up while it is held. On iOS the touch mapping and the menus stay aligned with the display across device rotation (the residual viewport scroll Safari leaves on rotation is reset to the top).

## Renderer modes

Four rendering modes are available via the **Renderer** selector on `objects.html`:

| Mode | Description |
|---|---|
| `webgl` | WebGL — GPU shaders, z-buffer, texture mapping (default, falls back to `full` if unavailable) |
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading (one colour per face) |
| `fast` | Wireframe — no lighting, canvas 2D paths only |

## Architecture

```
website/
├── index.html                   Spipu-Doom — empty shell (div#screen + progress bar)
├── appServiceWorker.js          Service Worker — cache-first, offline (must stay at webroot: SW scope)
├── manifest.webmanifest         PWA manifest
├── css/
│   ├── main.css                 Shell styles (fullscreen layout, loading bar)
│   └── doomMenu.css             WAD menu styles (em-based, scaled by the virtual screen ratio)
├── _examples/                   Simple demos (example, objects, lights, game, world)
│   └── assets/                  Demo assets + one bootstrap definition JSON per demo
├── js/
│   ├── webapp/                  Generic webapp layer — reusable in any project
│   │   ├── appBootstrap.js      Stacked definitions, aggregate versioning, PWA/classic modes
│   │   ├── appDatabase.js       Generic IndexedDB wrapper (stores, atomic multi-writes)
│   │   └── screenWakeLock.js    Screen wake lock helper
│   ├── doom/
│   │   ├── libBootstrap.json    Doom bootstrap definition (version + css/js lists)
│   │   ├── doomGame.js          DoomGame: level lifecycle, game loop, level chaining, equipment catalogs + loadout + inter-level persistence + pickup application (applyPickup)
│   │   ├── doomUser.js          DoomUser extends User: equipment state (owned weapons, shared ammo pool, keys, timed effects)
│   │   ├── main.js              Entry point: loadApp() → MenuNavigator
│   │   ├── object/             Immutable Doom definitions (shared; never per-player state)
│   │   │   ├── abstractDoomObject.js  Base definition: code, name, sprite, resetOnNewLevel
│   │   │   ├── doomWeapon.js          Weapon definition (ammoType, damage, fire placeholders)
│   │   │   ├── doomAmmo.js            Ammo type definition (clip unit, normal / backpack caps)
│   │   │   ├── doomItem.js            Item definition (key / permanent / timed power-up)
│   │   │   ├── doomDecoration.js      Scenery definition (sprite, solid, radius, ceiling)
│   │   │   └── doomThingCatalog.js    THING type → world descriptor (decorations + pickups)
│   │   ├── hud/
│   │   │   └── hudDoom.js       Doom HUD (debug overlay: level + equipment, temporary)
│   │   ├── menu/
│   │   │   ├── menuDisplay.js   1920×1080 letterboxed virtual screen for DOM menus
│   │   │   ├── menuModal.js     Confirm / loading / message modals
│   │   │   ├── abstractMenuScreen.js  Base menu screen (DOM helpers, status, errors)
│   │   │   ├── wadListScreen.js       WAD list + add (URL / local file) + delete
│   │   │   ├── difficultyScreen.js    Skill (1-5) selection between WAD and levels
│   │   │   ├── levelListScreen.js     Levels of a WAD
│   │   │   └── menuNavigator.js       Screen navigation (WAD → difficulty → level), launches DoomGame
│   │   └── wad/
│   │       ├── wadError.js      Typed errors (storage, fetch, format, quota)
│   │       ├── wadFile.js       Binary WAD reader (header, directory, lumps, level names)
│   │       ├── wadStorage.js    WAD persistence on IndexedDB (meta + binary stores)
│   │       ├── wadRegistry.js   Business facade used by the menu screens
│   │       └── convert/         WAD level → in-memory engine objects
│   │           ├── wadConstants.js        Doom specials tables, flags, player defaults
│   │           ├── wadLevelParser.js      VERTEXES / LINEDEFS / SIDEDEFS / SECTORS / THINGS
│   │           ├── wadPalette.js          PLAYPAL palette
│   │           ├── wadPicture.js          Doom picture / flat decoding → ImageData
│   │           ├── wadSpriteBank.js       Sprite lump decoding (S_START/S_END) → engine textures
│   │           ├── wadTextureBank.js      TEXTURE1/2 composition, flats, opaque sky-texture prep, switch pairs, registry
│   │           ├── wadAnimationBank.js    ANIMATED lump + vanilla fallback, per-object groups
│   │           ├── wadGeometry.js         Doom→world conversion, 2D geometry helpers
│   │           ├── wadTriangulator.js     Ear-clipping + hole merging (bridge cuts); robust earcut fallback for incomplete complex sectors
│   │           ├── wadSectorPolygons.js   Sector boundary chains, outers/holes split
│   │           ├── wadMeshBuilder.js      Wall/flat quads, UV pegging, texture remapping
│   │           ├── wadMapAnalyzer.js      Door/lift/rising-floor/stair/switch/teleport/walk-trigger identification, heights, floor targets (only sectors that can actually descend stay lifts — a tag-shared platform with no lower neighbour keeps its static floor instead of leaving a hole; a door floor is max(own fh, lowest neighbour) so a door on a step keeps its raised threshold — the step's riser is drawn on the door line — while a squished underground door stays clamped up to the walkable level)
│   │           ├── wadStaticMapBuilder.js Static map mesh (walls + flats)
│   │           ├── wadDoorBuilder.js      Door meshes + instances (keyframes)
│   │           ├── wadLiftBuilder.js      Lift meshes + instances (self-contained risers, keyframes)
│   │           ├── wadRisingFloorBuilder.js  Rising-floor meshes + instances (walk-up floors)
│   │           ├── wadStairBuilder.js     Build-stairs: one one-way rising step per chained sector (cumulated height)
│   │           ├── wadSwitchBuilder.js    Switch meshes + instances + interaction specs
│   │           ├── wadWalkTriggerBuilder.js  Invisible walk-over zones (planar proximity) → target instances or level exit (52/124)
│   │           ├── wadTeleportBuilder.js  Invisible teleport pads → thing-14 landing of same tag
│   │           ├── doomSwitchInteraction.js  Runtime switch (SW1↔SW2 swap, targets, exit)
│   │           ├── doomWalkTriggerInteraction.js  Runtime walk trigger (start target instances, exit)
│   │           ├── doomTeleportInteraction.js  Runtime teleport (reposition player + cooldown)
│   │           ├── doomPickupInteraction.js  Runtime pickup (proximity → applyPickup → despawn)
│   │           ├── wadThingBuilder.js     THINGS lump → billboard sprites (decorations + pickups), skill/multiplayer flag filtering
│   │           └── wadWorldBuilder.js     Orchestrator: WadFile + level → loaded world, sector lookup for things
│   └── engine/
│       ├── libBootstrap.json    Engine bootstrap definition (version + js list)
│       ├── engine3d.js          Main engine (viewport, lights, matrix, rendering loop, DEG_TO_RAD)
│       ├── collision.js         FPS physics: floor/ceiling/wall detection (triangles), platform riding, square decoration blockers (Doom box hitbox)
│       ├── loader.js            Global Loader — synchronises all sub-loaders, batch mode
│       ├── matrix.js            4×4 transformation matrices
│       ├── screenManager.js     Creates canvas + HUD overlay in #screen (fullscreen, fixed or virtual size)
│       ├── zBuffer.js           Z-buffer
│       ├── entity/
│       │   ├── abstractLoadedEntity.js  Base class: id, url, setLoaded(), finalizeInit()
│       │   ├── face.js          Face data (vertices, color, texture, UV, flags)
│       │   ├── interaction.js   Interaction entity: wraps AbstractInteraction, proxies triggered/update
│       │   ├── light.js         Point light source
│       │   ├── texture.js       Texture image data + alpha detection
│       │   ├── object3d.js      3D geometry (vertices, faces, normals, projection)
│       │   ├── billboard.js     Camera-facing sprite quad (Object3d subclass: cylindrical Y-axis, leans with pitch, sector-lit, floor/ceiling anchored)
│       │   ├── instance.js      Animated 3D object (keyframes, triggers, start/stop, damage, collisionShape none/faces/box, opaque triggerCondition gate)
│       │   ├── user.js          FPS player (physics, gravity, jump, crouch, energy, armor)
│       │   └── world.js         FPS scene (user, lights, collision, update loop)
│       ├── hud/
│       │   ├── abstractHud.js   Base HUD overlay: init(container), update(), bind helpers, screen-flash tint (damage red / pickup gold)
│       │   └── hudDebug.js      Debug HUD: fps, position, energy + shield, inputs (mode, axes, buttons), font scaled to the display (screen-flash inherited from AbstractHud)
│       ├── input/
│       │   ├── inputs.js        Inputs coordinator: device selection (gamepad > virtual gamepad > keyboard+mouse), unified analog axes + semantic buttons API
│       │   ├── inputKeyboard.js Keyboard input (e.code, Set-based, strict singleton)
│       │   ├── inputMouse.js    Mouse input via Pointer Lock API (rebound to the canvas on each level)
│       │   ├── inputGamepad.js  Physical gamepad: standard mapping preferred, known Sony layout by pad id or rest-pose axis detection on non-standard pads, dead zone
│       │   └── inputVirtualGamepad.js  Virtual touch gamepad: two fixed always-visible sticks + action buttons ringed around the look stick (DualSense positions), shown on touch-only devices
│       ├── interaction/
│       │   ├── abstractInteraction.js  Base interaction: code, triggered(instance), update(dt)
│       │   └── switchInteraction.js    Switch modes: once / timed / toggle
│       ├── loader/
│       │   ├── abstractLoader.js    Base loader: load/loadByCode/loadFromData, registry, callbacks
│       │   ├── textureLoader.js     Loads images by URL or accepts ImageData directly
│       │   ├── object3dLoader.js    Parses .obj.json or in-memory data into Object3d, or builds in-memory Billboards
│       │   ├── instanceLoader.js    Parses .instance.json or in-memory data, links to Object3d, deferred removal (scheduleRemoval/flushRemovals)
│       │   ├── interactionLoader.js Loads interaction JS files async, or registers instances directly
│       │   └── worldLoader.js       Parses definition.json or in-memory data, creates User + lights
│       └── renderer/
│           ├── object3dRendererBase.js   Shared renderer utilities
│           ├── object3dRendererList.js   Selects and instantiates the right renderer
│           ├── object3dRendererFull.js   Per-pixel z-buffer + textures (CPU)
│           ├── object3dRendererFlat.js   Flat shading + Painter's algorithm
│           ├── object3dRendererFast.js   Wireframe (canvas 2D)
│           └── object3dRendererWebGL.js  WebGL renderer (GLSL shaders, GPU z-buffer)
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

## License

This program is distributed under the LGPL License. For more information see the [./LICENSE.md](./LICENSE.md) file.
