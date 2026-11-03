# Spipu-Doom

Doom in the browser, in pure JavaScript — no framework, no build step, no server side.

**Play it: [doom.spipu.net](https://doom.spipu.net/)**

Spipu-Doom (`index.html`) ships as a PWA and converts **any Doom-format WAD on the fly, entirely in the browser**: WAD files are stored in IndexedDB, parsed in JS (geometry, textures, doors, lifts, switches, monsters, weapons, sounds and music) and turned directly into in-memory engine objects — no server-side conversion, no generated files. Everything game-specific lives in **game profiles** (Doom, Freedoom, **Heretic**…) auto-detected from the WAD content, so other Doom-engine games plug in without touching the converter.

It runs on **Spipu3D** (`js/engine/`), the 3D engine written for it: renderer, FPS physics, entities, inputs and audio, with no knowledge of Doom whatsoever. The generic web-app layer (`js/webapp/`: bootstrap, storage, settings, translations, input devices, menu building blocks, network) is shared with the other Spipu PWAs. Both are copied unchanged from their reference repository, [spipu/3d-engine](https://github.com/spipu/3d-engine), which also holds the examples that drive the engine on other scenes.

## Play

Nothing to download and nothing to configure — the game runs in the page.

1. **Install it** — worth doing on mobile, where the browser bars otherwise eat the screen. There is no in-app install button: the browser's own menu does it.
   - **iOS / iPadOS** — use **Safari** (the option is unreliable in the other iOS browsers): tap the *Share* button, scroll down the sheet, *Add to Home Screen*, then *Add*. Launch it from the new icon. iOS ignores the landscape request, so turn the device to landscape yourself.
   - **Android** — use **Chrome** (Edge and Samsung Internet work too): accept the install banner if it appears, otherwise *⋮* → *Install app* (older versions say *Add to Home screen*), then *Install*. It comes up in landscape on its own.
   - **Desktop** — Chrome and Edge: the install icon in the address bar, or *⋮* → *Install*. Firefox has no PWA install; just play in the tab.
2. **Add a WAD.** No game data ships with Spipu-Doom. [Freedoom](https://freedoom.github.io/) is free and BSD licensed: download it, unzip it, then load `freedoom1.wad` or `freedoom2.wad` with *Add a WAD file › Local file*. *By URL* takes any Doom-format WAD reachable over HTTP with CORS enabled. Doom, Doom II and Heretic WADs work the same way, if you own them.
3. **Select the WAD**, then *New game* → episode (skipped when the WAD has only one) → skill, and play.

Once it is installed and a WAD is stored, it needs no network at all: the app files are Service-Worker cached and the WAD lives in IndexedDB.

It also **updates itself**: every launch checks for a new version and, when there is one, re-downloads the app whole before starting — nothing to reinstall, no cache to clear by hand. Stored WADs and saved games are untouched by an update.

## Run it locally

A modern browser (Chrome, Firefox, Edge) and any static HTTP server (Apache, Nginx, `python3 -m http.server`) — no build step, nothing server side:

```bash
python3 -m http.server 8080 --directory website
```

Then open `http://localhost:8080` and follow steps 2 and 3 above.

## Non-regression bench

`node bench/run.js` replays, in Node and without a browser, the conversion of every level of the WADs found in `.source/wad/`, scripted runs of the simulation and the network codecs, and compares their fingerprints to the golden files committed in `bench/golden/`. A difference names the level or scenario that changed; `--update` records a wanted change in the same commit as its cause. `--suite build|simulation|codecs` and `--wad <name>` narrow a run.

## Features

- **WAD list**: stored WADs persist in IndexedDB across sessions and updates; the selected one's detail (version, size, date added) beside the list with a *Play* button — on a touch screen a first tap selects a WAD, a second opens it —; *Add a WAD file* opens a choice between an address and a local file; delete with confirmation. Each WAD is listed under the game, edition and version of the known official releases, recognised by file hash (Doom 1 - Ultimate v1.9, Doom 2 - Plutonia, Freedoom - Phase 2 v0.13.0…), the file name standing in for an unrecognised file; a SHA-256 fingerprint of the file, computed at import, is by which multiplayer devices check they play the same WAD, a refusal naming the host's WAD. Importing a file already stored, or an older release of a stored game, is refused with the reason; a newer release of the same line updates the stored WAD (a re-release such as Unity or BFG is added alongside the original) after a confirmation naming both versions, keeping its saves — those on a level the update changed restart from that level's beginning with their equipment, those on a level it removed are deleted. A Join a game button pairs with a host and finds by itself which stored WAD it plays, saying when it is missing or held in another version. Mouse, keyboard, gamepad and touch drive every menu the same way.
- **WAD menu & game flow**: over the WAD's own title picture, *Continue* (its latest save), *New game*, *Load game*, *Multiplayer*, *Options*, *About*, *Quit*, with *Report a bug* (the GitHub issues page) in the corner — then the episodes actually present in the WAD (the choice skipped for a single one) and the five vanilla skills plus a pacifist skill 0 — the normal-skill world, but the monsters never attack — with the original per-skill rules.
- **Save / load**: five slots per WAD; a save captures the full game state and loading rebuilds the level and restores it exactly (transient visuals excepted). A save made by an earlier version the game can no longer resume as is restarts its level from the beginning, with the saved equipment and keys (health back to full when lower) or with the starting equipment, or can be deleted; one from a version too different keeps only the restart with the starting equipment or the deletion.
- **Pause menu**: `ESC` freezes the game, blurred and darkened under a menu headed by the WAD then the episode, level and level name — resume, restart the level (after a confirmation, solo and cooperative only, from the host), load, save, options, leave the level.
- **Death menu**: a second after the player dies, over the level that keeps running — restart the level with the equipment you entered it with, start a new game, load a save, leave the level. The original's special endings (E1M8) still end the level instead.
- **Game profiles** (`js/doom/wad/profile/`): everything game-specific — things, specials, weapons, monsters, progression, skies, sounds, HUD — is profile data, auto-detected from the WAD content. Doom, Doom II, TNT: Evilution, The Plutonia Experiment, Freedoom and Heretic are recognised and playable, each with its own level names; unknown WADs fall back to the doom-format baseline.
- **On-the-fly conversion** (`js/doom/wad/convert/`): geometry, textures, animations and movers are instantiated directly into in-memory engine objects — no generated file, no server. Middle textures, missing textures and the known defects of the original maps are handled the way the hardware ports do.
- **Moving elements & triggers**: doors (manual, remote, key-locked, timed), lifts, rising floors (a fixed-height raise lifts the floor again at each trigger, up to the ceiling, and every trigger of the same floor aims from wherever the floor and its neighbours currently are — a switch pressed on a busy floor stays unspent), stairs, perpetual platforms, moving ceilings, crushers and the donut, driven by switches, walk-over lines, gunfire, teleporters and boss deaths — behaviours verified against the original sources, including per-side and per-key door activation, and movers that crush, reopen or stall against whoever blocks them. Wall textures stay pegged as the original renders them while floors move: a floor-pegged wall or switch rides its floor, an unpegged riser keeps its texture pinned to the world.
- **World things**: every non-enemy THING is a camera-facing sprite, lit by its sector and animated like the original; solid decorations block (and follow a moving floor), pickups are reached inside a vanilla-style cylinder.
- **Monsters**: both complete bestiaries with the full vanilla combat loop — blood, pain, deaths and gibs, knockback, item drops, chain-exploding barrels — and the vanilla AI: wake-up by sight or sound, 8-direction chase, door opening, floaters, every attack of both games, infighting, resurrections, complete skill 5, the boss map actions and Doom II's Icon of Sin. Movers press the bodies like they press the player.
- **Player**: vanilla physics (gravity, steps, jump, optional crouch and fall damage, blocking lines, and walls under the sky that no jump can clear into the void or the rock behind them), vanilla equipment rules (shared ammo pools, armor classes, keys, timed power-ups with their screen effects and HUD countdowns), and single-player thing filtering by skill.
- **Weapons**: the nine Doom and eight Heretic weapons with faithful behaviour — free-aim hitscans, projectiles with fans, ballistic drops and bounces, persistent impact decals on walls, floors and ceilings (never on liquids or sky), sector-lit view sprite, muzzle flashes that briefly brighten the whole scene like the original — every table being profile data from the original sources. Switch with **F**/**G**, gamepad shoulders, the virtual pad, or a keyboard key per weapon slot.
- **HUD & automap**: a modern corner HUD (health, armor, ammo, keys, secrets, kills, ARMS panel) adapting to the loaded game, a debug overlay on **H**, an optional crosshair, and a translucent automap (**Tab**) over the running game, revealed like the original and titled with the level's name (the WAD's own when it carries one, else the game's).
- **Sector effects**: damaging floors, floor mutations, scrolling walls, dynamic lights, the lines and switches that turn rooms dark, light them up or set them strobing, distance shading, secret counting, and the Heretic pushes (wind, conveyors, ice) on player and monsters.
- **Ground terrain**: the flats a game declares as liquid, and its falls and other liquid walls, take no impact decal, and the liquid flats it gives a splash to answer whatever reaches them — a shot, a shell, a body falling in, a blast going off close by — with the ripple, the piece thrown out of it and the sound of that liquid. Heretic's water, lava and sludge are described this way. A WAD shipping its own TERRAIN lump overrides those tables entry by entry, so a custom level can make any flat splash — or stop one from splashing.
- **Water surfaces**: an optional Display setting, on by default and applied when a level loads, draws a translucent water line over the liquid floors — shots, shells and splashes then meet that line instead of the floor beneath, which shows darker through it. In Heretic, players and everything else stand 10 units below the water line either way, as in the original; in the Doom family the floor is untouched and the line sits above it, wherever the banks around leave room for one. Lifts and floors keep their original course and go through the water line, which stays put over them. In a multiplayer game every device builds the level the way the host set it.
- **Generic splash**: a liquid no game describes still answers, with our own greyscale masks colourised by the average colour of the flat itself — the nukage of Doom splashes green, blood red — mirrored left or right at random, and its flying piece tilted at an angle of its own, so two impacts never stamp the same picture. Silent and always on; not a behaviour any original game had.
- **Level chaining & story texts**: exits follow the vanilla progression (secret exits included, `UMAPINFO` overrides honoured) through a tally modal — time, enemies, items, secrets — followed by the game's own chapter texts (from the WAD when it tells its own story, else the translated catalog).
- **Sound effects**: the WAD's own sounds decoded on the fly — weapons, pickups, movers, teleports, player, monsters, Heretic ambients — spatialised per game and frozen with the pause. The menus use light synthesized clicks, WAD-independent, with distinct accents for navigation, validation and cancel. Two live volume settings.
- **Music**: the WAD's own songs (MUS or MIDI lumps) synthesized in real time on an OPL3 FM emulator fed with the WAD's own GENMIDI instrument bank — the original Sound Blaster sound, no external asset. Title music on the WAD menu, each level's own song in game (with the vanilla reuse rules), the intermission theme over the tally and story screens.
- **Screen sharing**: the pause menu's Multiplayer entry shares the running game — a lobby of up to four players, others joining from the WAD list or a WAD's Multiplayer screen by scanning QR codes both ways, with no server or account; the host can add, remove and stop. Joined devices show the host's game live — view, HUD, monsters, shots, doors, sounds and effects — and follow its level changes, restarts and loaded saves; they see its pause, its death, its tally and chapter texts (in their own language) and are sent back to their menu when its game is over. A device too slow to answer is named on screen while the game waits for it, and dropped if it stays silent; one whose page goes to the background (a phone's locked screen) no longer holds the game, its player standing still, and picks up again on its return, shown as away in the lobby and announced to the others. A player whose link is lost keeps its seat until the end of the level: joining again under the same nickname gives it back its player, equipment and scores. While a new device connects, the host sees whom it is connecting to; a device that cannot reach the host — on another network, such as mobile data against the host's Wi-Fi — is told so at once or within seconds, with what to do about it (the same Wi-Fi, or one device's hotspot). With the fps readout on, every device also shows its ping. A joined device's touch pad keeps only the menu and the map.
- **Cooperative**: the pause menu's Multiplayer entry opens the running game to other players, or turns a screen sharing into one, after a game settings screen (friendly fire); the WAD's Multiplayer screen also starts a new cooperative game, its first level already holding the multiplayer items, the lobby shown over it until Start. Each joined device then plays its own player with its full controls, dropping in at its start during the level, leaving whenever it wants, and following every level change. Every player sees the others in their slot's colour — walking, shooting, hurt, dying, squashed when crouching — and on the map as coloured arrows, and hears their shots, cries and falls from where they stand, while a pickup rings for its taker alone; the lobby shows the colours, and a player who leaves is named on screen for a moment.
  A dead player respawns at its start by pressing use, leaving its corpse behind; placed weapons and keys stay on the ground for everyone. The tally gives each player's kills, items and secrets, and the host saves and loads the game, the other players following it.
- **Deathmatch**: the WAD's Multiplayer screen starts a new deathmatch through the same episode, difficulty, game settings and lobby screens. Every player enters and respawns on a random deathmatch start, holding every key while the map's keys stay out; monsters are there or not as the settings say, every attack hurts the others, and there is no save, load or cheat. The HUD shows the match clock — counting down to the time limit, or up without one — and every player's frags in slot order behind their colours, one's own in bold (a death by nothing counts against oneself); the map never shows the other players. The game settings choose between weapons that stay on the ground (giving extra ammo in Doom) and items that all come back a while after being taken, in a fog and with a sound, except the strongest power-ups.
  A frag limit or a time limit ends the level, whose tally shows every player's frags against every other; each level starts once every player has built it, and the match ends for everyone on the last level, or for the host once nobody is left to play against.
- **Options & persistent settings**: Display, Game, Multiplayer, Sound and Controls pages — full keyboard and gamepad remapping included, one key or button per action — persisted in IndexedDB, with a confirmed reset. The Multiplayer page, offered from a WAD's menu and from the pause's Multiplayer entry, holds the cooperative and deathmatch game settings and the player's nickname, typed on an on-screen keyboard laid out like the interface language's (AZERTY in French, QWERTY otherwise) and walked with the mouse, touch, arrows or gamepad, or on the physical keyboard — never through the OS keyboard.
- **Renderer choice**: the Display page picks one of the four rendering modes (see **The 3D engine** below), WebGL by default. A change applies to the running level without reloading it: the screen, the engine and the HUD are rebuilt on the next live frame, the level and the player carry on untouched.
- **Inputs**: keyboard+mouse, gamepad (press a button to activate it), or a touch virtual gamepad laid out for a 4-finger claw grip, with per-gesture dead zones and firing sensitivity. The devices never reach the simulation directly: a command sampler turns them into one plain-data command per turn — movement axes, look angles in degrees, named buttons (the game's fire, weapon switch and full-kit cheat included), the weapon wheel steps — which the world and the game consume.
- **Translation (en / fr / it / es)**: every user-facing text goes through a translation catalog addressed by code, the finale texts included; locale-dependent formats go through `Intl`.
- **Robustness**: a failed level build reports its cause and returns to the WAD list; a stored setting that no longer matches what its declaration allows is repaired at startup (a text setting keeps what its sanitising accepts, any other falls back to its default); every menu screen shows the aggregated version, the webapp stats and the copyright.

## Controls

Keyboard defaults below are **physical key positions** (WASD = ZQSD on an AZERTY layout) and every one of them can be remapped in the Options modal (from a WAD's menu), one key per action — except `ESC`, the fixed pause key. The gamepad defaults below fit a PlayStation 5 pad; its buttons (pause included) and its four stick axes can be remapped the same way, one button or axis per action.

| Keyboard / mouse | Gamepad | Action |
|---|---|---|
| WASD | Left stick | Move / strafe (analog on the stick) |
| Mouse (click canvas first) | Right stick | Look around |
| Left Shift (hold) | Left stick press, L3 (hold) | Run at the original game's speed; the virtual pad has a run toggle beside the map button |
| Space | Button 1 | Jump |
| C | Button 0 | Crouch |
| E | Button 3 | Interact (open door, trigger lift or switch) |
| Left click / Q | Right trigger (button 7) | Fire the active weapon |
| ESC | Button 9 | Pause menu over the frozen game (`ESC` not remappable) |
| F / G | Buttons 4 / 5 | Previous / next weapon (wrapping) |
| — (to bind: Weapon 1 to 7) | — | Weapon of that slot; pressed again, the next weapon of the same slot (shotgun ↔ super shotgun) |
| H | — | Toggle the game HUD ↔ debug overlay (keyboard only) |
| Tab | D-pad up | Show / hide the automap over the game |
| IJKL | — | Look around — keyboard fallback when the mouse / Pointer Lock is unavailable |
| O | — | Debug cheat (not remappable): grant the full kit |

The gamepad is only visible to the page after a button has been pressed on it (browser privacy rule); it then takes priority over keyboard+mouse. Touch-only devices select the virtual gamepad (see **Inputs** above). The **Device** line of Options > Controls keeps this automatic choice or forces one of the devices available, and lists the settings of the device in use. On iOS the touch mapping and the menus stay aligned with the display across device rotation.

## The Spipu3D engine

`js/engine/` is a standalone 3D engine with no external dependency: it renders textured, lit 3D objects entirely in the browser through the HTML5 `<canvas>` API, and carries a full FPS physics engine (collision detection, gravity, jumping, crouching, animated objects) for one or several users sharing a world, each moved by its own command and blocking the others. It never depends on `js/doom/`: it exposes parameterisable primitives (depth shading, per-instance light and render offset, external forces, screen sprites…) that the game layer feeds with its own constants.

It also animates skeletal characters: models read from glTF 2.0 files (a skeleton, a skinned mesh, clips and their events, sockets for held objects), played with cross-fades from one clip to the next, moved by root motion (the clips' own travel, so the feet do not slide), objects held in a hand following it.

Four rendering modes are available, selectable in the game from the **Display** options page:

| Mode | Description |
|---|---|
| `webgl` | WebGL — GPU shaders, z-buffer, texture mapping (default, falls back to `full` if unavailable) |
| `full` | Per-pixel z-buffer with Gouraud shading and texture mapping |
| `flat` | Painter's algorithm with flat shading — one colour per face, the average colour of its texture dimmed by the sector light — on a neutral grey backdrop without sky |
| `fast` | Wireframe — no lighting, canvas 2D paths only, on the same grey backdrop |

In the two textureless modes the game paints enemies red, every pickup blue — keys included, and the exploding barrel counts as a body — every moving part (doors, lifts, floors, stairs) yellow and the switches magenta, so a scene stays readable without its sprites. Both draw the whole frame in one depth-sorted pass, so a body behind a wall stays behind it instead of being painted over the map.

Whatever the mode, instances are frustum-culled in camera space before any per-vertex work; the static level map is one single object, always drawn whole.

## Architecture

The static collision geometry is indexed once per level in a uniform XZ spatial grid, so every floor/wall/ray query only tests the triangles of the cells it touches. Dynamic movers stay on a linear scan.

```
bench/                        Non-regression bench: Node runner, app context, suites (build, simulation, codecs) and their golden fingerprints
website/
├── index.html                Spipu-Doom shell (PWA)
├── appServiceWorker.js       Service Worker — cache-first, offline (must stay at webroot: SW scope)
├── ping.json                 Install/update/start tracking json — hit only
├── css/                      Shell + doom menu theme; webapp/: the structure of the generic menus
├── assets/uzdoom/            UZDoom impact-decal graphics + finale texts (GPL v3 — own LICENSE.md + README.md)
├── assets/spipu/             Our own graphics: the generic splash masks, colourised at level load
├── lib/libadlmidi/           Vendored libADLMIDI-JS OPL3 synthesizer (LGPL v3 — own LICENSE.md + modification README.md)
├── lib/zxing-wasm/           Vendored zxing-wasm QR code reader and writer (MIT, Apache-2.0, BSD-3 — own LICENSE.md + README.md)
├── lib/oswald/               Vendored Oswald font of the menus (SIL OFL 1.1 — own LICENSE.md + README.md)
└── js/
    ├── libBootstrap.json     The game's bootstrap definition: version + every file it loads (engine, webapp, doom)
    ├── main.js               Entry point
    ├── webapp/               Generic webapp layer — bootstrap/versioning, IndexedDB wrapper with versioned schema upgrades, persistent settings, translation catalog, content hash, wake lock
    │   ├── input/               Raw input devices: keyboard, mouse, gamepad with rebindable actions, virtual touch gamepad laid out by the page
    │   ├── menu/                Building blocks of DOM menus: letterboxed display, list navigation (mouse, keyboard, gamepad), modals, settings pages, on-screen keyboard, their texts
    │   ├── net/                 Peer-to-peer network layer — WebRTC and loopback links, compact signals, pairing codes and flows, messages, ping, star sessions
    │   └── qr/                  QR code writing, camera scanning, camera probe and the pairing view (code shown, code read)
    ├── doom/                 The Spipu-Doom game
    │   ├── doomGame.js          Level lifecycle, game loop, menus of the running game, tally
    │   ├── doomHostedSession.js The session a game hosts for other devices: opened from the pause or the Multiplayer screen, stopped, its lost players' seats
    │   ├── doomFollowedSession.js  A game following another device's session: the levels it sends, its mode changes, its end
    │   ├── doomUser.js          Player equipment state
    │   ├── doomPlayer.js        One player across its levels: its body, its weapon, the equipment it enters and carries
    │   ├── doomPlayerBody.js    A player's visible body in cooperative, as the others see it
    │   ├── doomPlayerBodies.js  The players' bodies of a level and the corpses the dead ones leave
    │   ├── doomPlayerSpawner.js Where a player's body spawns: its own start, a free one, a random deathmatch start
    │   ├── doomInertInstance.js An instance born in play that nothing touches (body replica, shot, effect, decal)
    │   ├── doomSessionNotice.js The message a session shows over the game (waiting, host paused, respawn prompt, player left)
    │   ├── doomPlayerRoster.js  The players of a game, the local one among them
    │   ├── doomLevelLoader.js   The level build every device runs: the converted world and the visual banks it shows
    │   ├── doomSimulation.js    The level's world and the tic that moves it from one command per player: monsters, projectiles, saves
    │   ├── abstractGameRole.js  What a device does with the game it shows: the contract DoomGame drives, one implementation per kind of device
    │   ├── doomMainRole.js      The role of the device that simulates: the simulation and what only that device does
    │   ├── doomSubRole.js       The role of a device that follows another's game: applies each turn state and answers it
    │   ├── doomLevelStats.js    The level's statistics: secrets, kills and items found against their totals, per player too, the frags, level time and match clock
    │   ├── doomTurnEvents.js    Every one-shot event of a turn (sounds, effects, decals, teleports), emitted by the simulation
    │   ├── doomTurnEventPlayer.js  How a device plays those events
    │   ├── doomItemRules.js     What pickups, the starting loadout and the cheat give to a player
    │   ├── doomPickupSpawner.js  Brings a map pickup back into the level, the same on every device
    │   ├── doomItemRespawnQueue.js  The deathmatch items waiting to come back
    │   ├── doomGameRules.js     The mode-dependent questions (things built, spawn spots and keys, death menu or respawn, saves, cheat, screen sharing, cooperative, items staying, friendly fire, frags, players on the map)
    │   ├── doomSinglePlayerRules.js  Their single-player answers
    │   ├── doomCoopRules.js     Their cooperative answers
    │   ├── doomDeathmatchRules.js  Their deathmatch answers
    │   ├── doomPresentation.js  What a device shows of the game through one player: screen, HUD, weapon overlay, view effects, sound
    │   ├── doomDatabaseSchema.js  The versions of the game's database, upgraded at start-up
    │   ├── doomSettings.js      Persistent settings (IndexedDB)
    │   ├── doomTranslations.js  Every user-facing text (en + fr + it + es)
    │   ├── doomFinaleTexts.js   Finale-text catalogs of the games (loaded from assets/)
    │   ├── doomImageAssets.js   Source pixels of every PNG drawn from outside the WAD (decals, splash masks)
    │   ├── save/                Save slots + level snapshot (deterministic rebuild + state patch)
    │   ├── sound/               Game audio: WAD sound loading, logical-name catalog (profile SNDINFO tables), music orchestration
    │   ├── object/              Immutable definitions (weapons, ammo, items, decorations, thing and item catalogs)
    │   ├── monster/             Monster system: defs, 35 Hz driver, locomotion, senses, attacks, damage, boss deaths, the Icon of Sin, and the drawable body views with their renderer
    │   ├── automap/             Level map: line model, state, and the vanilla BSP reveal
    │   ├── hud/                 Game HUD + debug overlay + automap layer
    │   ├── menu/                DOM menu screens and modals of the game (WAD list and its add-a-WAD modal, WAD menu, episodes, difficulty, multiplayer, options and controls, pause and its multiplayer sub-menu, death, tally, save slots; pairing and lobby come from webapp/)
    │   ├── net/                 Multiplayer of the game, over the session of webapp/net/: its protocol and invite (the WAD), its main and sub sessions, the replicated turn state and commands with their binary codecs, the replica applier
    │   ├── weapon/              Weapon machinery: psprite machine, hitscan, projectiles, effects, decals, and the drawable weapon and projectile views with their renderers
    │   └── wad/                 WAD reading + IndexedDB storage, game profiles (profile/), on-the-fly converter (convert/)
    └── engine/               Spipu3D — the game-agnostic 3D engine
        ├── engine3d.js          Viewport, lights, render loop, frustum culling
        ├── collision.js         FPS physics: spatially indexed triangles, box blockers, mover pressure
        ├── spatialGrid.js       Uniform XZ grid over a static triangle set
        ├── entity/              Object3d, Billboard, Instance (keyframes/triggers/cycles), User, UserCommand, World, external forces
        ├── input/               FPS controller over the webapp devices: game actions, gamepad and touch layouts, and the command sampler
        ├── interaction/         Interaction bases (switch modes once/timed/toggle)
        ├── loader/              URL or in-memory loaders (textures, objects, instances, interactions, world)
        ├── sound/               Audio primitives: shared AudioContext with music/effects buses, in-memory PCM samples, tone synthesis, music player over a swappable synth contract
        ├── hud/                 HUD bases (debug overlay, screen flash)
        └── renderer/            webgl / full / flat / fast renderers
```

## In-memory loading

The engine loaders accept either URLs or in-memory data (used by the WAD converter):

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

The game is loaded by the generic `appBootstrap` (global instance) from one `libBootstrap.json`-style definition (`{version, files: {assets, css, js}}`): `js/libBootstrap.json`, which lists every file it uses. A change of its version triggers a full update — in PWA mode the Service Worker clears its cache and re-downloads everything; in classic mode the page reloads with `?v=` cache-busted URLs (`appBootstrap.buildUrl`). How a page drives the engine is shown by the examples of [spipu/3d-engine](https://github.com/spipu/3d-engine).

## Versioning

After any file change, increment the `version` of `js/libBootstrap.json`. This drives both the PWA cache refresh and the classic-mode cache busting. A file of `js/engine/` or `js/webapp/` is changed in [spipu/3d-engine](https://github.com/spipu/3d-engine) first, then copied here unchanged.

## Next steps

The upcoming work is tracked in [./NEXT-STEPS.md](./NEXT-STEPS.md).

## License

This program is distributed under the MIT License — see the [./LICENSE.md](./LICENSE.md) file, except:

* the `website/assets/uzdoom/` directory (impact-decal graphics and finale texts taken from UZDoom), distributed under the GPL v3, with its own LICENSE.md and attribution README.
* the `website/lib/libadlmidi/` directory (the vendored libADLMIDI-JS music synthesizer), distributed under the LGPL v3, with its own LICENSE.md and attribution README.
* the `website/lib/zxing-wasm/` directory (the vendored QR code library), distributed under the MIT, Apache-2.0 and BSD-3-Clause licences of its three components, all permissive, with its own LICENSE.md.
* the `website/lib/oswald/` directory (the Oswald font of the menus), distributed under the SIL Open Font License 1.1, with its own LICENSE.md and attribution README.
