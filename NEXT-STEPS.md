# Next steps

## Description

Tracks the major upcoming work and the milestones already reached. Only large milestones belong here: the detail of each fix lives in the git history.

When a ToDo item is done, move it to the top of Finished with its completion date.

## ToDo

* **Level testing**: finish playing through every level of Doom 2, Freedoom 1 and Freedoom 2.
* **Heretic inventory**: the artifact bar and everything it holds (flight, tome of power, morph ovum…) is the last large gap of an otherwise playable game.
* **PWAD compatibility**: the converter understands vanilla specials only, so most community WADs load with dead lines and stock actors — this means DEHACKED and the BOOM generalized specials.
* **Hexen**: the WAD loads under the fallback profile only. It needs its own thing and special semantics, its hub progression, and its script and polyobject machinery.
* **Vanilla polish pass**: the small fidelity gaps knowingly left aside — no fog on a nightmare respawn, blood and late puff frames still fullbright, no silent teleports.
* **Rendering performance & quality options**: the renderer is now selectable and the three CPU modes draw the weapon in hand, but they still lag behind WebGL (no sky, no distance darkening), and there is no quality setting; a face and draw-call budget, plus a resolution or draw-distance option, would decide how well it runs on a phone.

## Finished

* **Doom 1 level testing** (2026-09-21): every level of Doom 1 played through and fixed.
* **Liquid splashes** (2026-09-11): terrain splashes on the liquids of every game.
* **Selectable renderer** (2026-09-10): the renderer switched live from the Display options.
* **TNT and Plutonia** (2026-09-09): recognised as their own game profiles.
* **Map compatibility patches** (2026-09-06): known defects of the original maps fixed at load time.
* **Spipu3D and translations** (2026-08-31): the engine named Spipu3D, and the UI in English, French, Italian and Spanish.
* **Sound and music** (2026-08-30): sound effects and OPL-synthesized music, both read from the WAD.
* **Complete bestiaries** (2026-08-29): every Doom and Heretic monster attack, bosses and the Icon of Sin included.
* **Automap** (2026-08-26): revealed as the player explores, like the original.
* **Menus and saves** (2026-08-02): per-WAD menus, pause menu and save slots.
* **Monsters** (2026-07-24): bestiary, damage, deaths and vanilla AI.
* **Game profiles** (2026-07-19): Doom, Freedoom and Heretic data isolated per game, and persistent settings.
* **Weapons** (2026-07-19): the vanilla weapon state machine, hitscan, projectiles and wall impact decals.
* **Game HUD** (2026-07-12): health, armour, ammo, weapons, keys and secrets.
* **Level progression** (2026-07-12): walk-over exits, secret levels and UMAPINFO.
* **Vanilla sector machinery** (2026-07-11): doors, lifts, stairs, ceilings, crushers, dynamic lights, damaging floors and secrets.
* **Items and keys** (2026-06-20): pickups, key-locked doors and equipment carried between levels.
* **Gamepad and touch controls** (2026-06-13): physical gamepads and a virtual touch gamepad.
* **On-the-fly WAD conversion** (2026-06-12): levels converted in the browser from the user's WAD, chained from one to the next.
* **Installable webapp** (2026-06-11): stacked bootstrap definitions and offline service worker.
* **Interaction system** (2026-06-06): switches driving lifts and doors.
* **First Doom map** (2026-05-24): Freedoom E1M1 converted from its WAD and playable.
* **FPS physics** (2026-05-21): collision, gravity, jump and platform riding.
* **WebGL renderer** (2026-05-17): hardware rendering alongside the CPU renderers, chosen by default when available.
* **Engine modernisation** (2026-05-13): the original 3D engine rewritten in ES6 classes, without jQuery nor eval.
