# Next steps

## Description

Tracks the major upcoming work and the milestones already reached. Only large milestones belong here: the detail of each fix lives in the git history.

When a ToDo item is done, move it to the top of Finished with its completion date.

A ToDo item that specifies a project split into steps (Multiplayer) keeps only what its remaining steps need: what the finished steps built is documented in the project's knowledge base.

## ToDo

### Level testing

Finish playing through every level of Doom 2, Freedoom 1 and Freedoom 2.

### Heretic inventory

The artifact bar and everything it holds (flight, tome of power, morph ovum, chaos device, time bomb…) is the last large gap of an otherwise playable game.

* Today the artifacts get a simplified immediate effect, and those that cannot be transposed are visible pickups with a null effect, never consumed.
* The **tome of power** also gates the PL2 modes of the eight weapons, out of the scope of the current arsenal (PL1 only).
* The summoned **Maulotaur** (`A_MinotaurDeath` / `A_MinotaurRoam`) is unreachable until the inventory exists.

### PWAD compatibility

The converter understands vanilla specials only, so most community WADs load with dead lines and stock actors. Three parts:

* **DEHACKED**: only the `[STRINGS]` section is read today (`WadDehackedStrings`, for the finale texts). Still missing: things, frames, weapons, sounds, and the `Text` blocks of the old format (replacement by byte offset).
* **BOOM generalized specials**: ranges of parameterised specials instead of one table entry per number.
* **Heretic `Thing_Destroy` (linedef 515)**: `xlat/heretic.txt:17` = `WALK, Thing_Destroy(0,0,0)` → `Level->Massacre()` (`p_lnspec.cpp:1506`, `p_enemy.cpp:3407`, `p_mobj.cpp:1711`): every non-dormant `MF3_ISMONSTER` actor dies from `TELEFRAG_DAMAGE` (hence gibbed), invulnerability lifted.
  * The xlat neutralises it today (`515: 0`), and **the profile comment wrongly mentions the E1M8 boss walls** — to fix when opening this part: **no linedef of `heretic.wad` carries 515** (scan of the 48 maps; E1M8 only has 2, 11, 31, 36, 62, 88, 97, 103), it is an xlat entry for Raven PWADs.
  * Planned implementation: `515: 1515`, an extensible `WALK_ACTION_BY_SPECIAL` table (`{1515: 'massacre'}`) forming **a generic "walk line → game action" channel** rather than one more branch beside `stop` / `isExit`, and `DoomMonsterSystem.massacre()` through the existing damage pipeline.
  * Prerequisite: an explicit `isMonster` flag on the definitions — the 4 `countsKill: false` definitions (barrel, pod, BossBrain, BossEye) are indeed the 4 `: Actor` without `Monster;` in the zscript, but both notions coincide by construction, not by definition.
  * Not verifiable in game on the 6 IWADs: validation through a hand-made test map.

### Hexen

The WAD loads under the fallback profile only. It needs its own thing and special semantics, its hub progression, and its script and polyobject machinery.

* A far more divergent profile than Heretic: extended map format (**16-byte linedefs, specials with args**) and **shared manas with HUD gauges**.
* The profile must be probed **before** Heretic in `GameProfileList`: `hexen.wad` carries a `TINTTAB` lump, so it matches the Heretic profile today (and inherits its rules, `mapEndSlot` MAP30 = end of game included, meaningless for its hubs).
* **No level of `hexen.wad` converts today** (measured on MAP01): the parser reads the Hexen LINEDEFS (16 bytes, with args) as Doom ones (14), so the sidedef indices are absurd and the analysis breaks as early as `WadMapAnalyzer._identifyLifts` on `sidedefs[ld.right] is undefined` — the launch falls back cleanly to the error modal.
* The first Hexen step is therefore **the level parser**, before any game semantics. `WadBspTree.build` already refuses this WAD (out-of-bounds index guard), and the polygon fallback is useless as long as the linedefs are misread.

### Vanilla polish pass

The small fidelity gaps knowingly left aside: no fog on a nightmare respawn, blood and late puff frames still fullbright, no silent teleports. The deviations attested and accepted (those not meant to be fixed) are not listed here.

* **Systematic converter sweep**: run every Doom 1 / Doom 2 level (then Heretic) through the converter and count the detectable anomalies — faces without texture (index -1), ANIMATED sequence names left static, missing textures, switch slots not drawn, unhandled floor specials — to find oversights of the same kind as those fixed by hand on E2M2 (intermediate frames not animated, missing mover faces, wrong switch slot). Also check the switch usage trace on a level with ordinary lifts.
* **Closed sectors under sky** (`fh == ch`, sky on both sides, 16 occurrences, all in Freedoom — E1M4, E2M1, E2M9, E3M6, MAP12, MAP15, MAP28): vanilla refuses them (zero height), here they are one-unit steps the player climbs. With no upper wall, the jump guards do not cover them; to handle in the converter if an occurrence gets in the way in game.

### Rendering performance & quality options

The renderer is selectable in game (`display.renderer`, WebGL by default) and the three CPU modes draw the weapon in hand, but they still lag behind WebGL, and there is **no quality setting**: a face and draw-call budget, plus a resolution or draw-distance option, would decide how well it runs on a phone. This is **the** prerequisite of the visibility culling item below (profile before partitioning).

What the CPU modes still lack against WebGL, by order of interest:

* **`full`: the sky and distance darkening** (both engine primitives are applied by the WebGL renderer only), nor the global light floor and boost.
* **`full`: alpha pass** — an **opaque** additive face stays in the opaque pass, so a sprite drawn after it can cover it (same limit in WebGL); translucent bodies blend in the arbitrary order of the instances.
* **`flat` / `fast`: no sky, by decision** — fixed grey `#666` background.

On the Heretic fidelity side, one gap found while auditing the state verbs: **sinking into liquids** (`A_SetFloorClip` / `A_UnSetFloorClip`) — the engine has no floor clipping. Doable with what exists (`DoomTerrain.terrainAt` already tells which liquid lies under a point, `Instance.setRenderOffset` shifts the rendering only), but it is a system to lay down, not a verb to wire. The `footclip` each terrain carries is read and dropped by `WadTerrainBank` for lack of a consumer: that is where it would land.

### Isolated technical points

* **Moving flats not scrolling**: a pushing / lava sector whose floor is a mover (lift, rising floor, stair step — top flat built by the builders through `addSectorTopFlat`) or a door loses the visual scrolling of its flat (`uvScroll` is set by the static builder only). To wire in the builders if a level makes it visible.
* **Mace balls bouncing on a moving mover**: repositioning at the impact point of a possibly moving floor, untested — to check if a map occurrence lends itself to it.

### Multiplayer

Status: steps 0 to 6 are done — mode 1, **screen sharing**, works end to end and was checked on real devices (a PC with an iPhone, two iPhones). What exists (network layer, QR pairing, nickname and on-screen keyboard, WAD identity, per-turn commands, simulation / presentation split, several players in the engine and the systems, replication, synchronous turn cycle, main and sub roles, full flow on the subs) is documented in the project's knowledge base, not here. This section only specifies what steps 7 to 9 still have to build; every rule of the existing design (host-authoritative simulation, synchronous cycle, self-contained per-turn state, one ordered channel, presentation reading only state every device holds) stays in force.

Every label quoted below is a working title: the final wording of each one is chosen when it is implemented, and every one of them goes through the translation catalogue in all languages.

Vocabulary: the **main** is the player whose browser hosts the game; the **subs** are the other players.

#### Modes still to build

* **Mode 2, drop-in cooperative** — a new pause menu entry opens the running game to other players, who are really added to it, spawning at the level's player starts. Level changes carry every player along.
* **Mode 3, new multiplayer game** — the "Multiplayer" screen of the WAD menu gains **Cooperative** and **Deathmatch**, started fresh from the chosen level.

#### Screens and menus

* **Multiplayer screen**: Cooperative and Deathmatch join Join a game and the options shortcut (step 8). They go through the existing episode and difficulty screens, as in single player, then the game settings screen, then open the lobby as main. Join a game stays the way a sub joins any mode.
* **Pause menu**:
  * main of a single-player game: the cooperative entry beside "Share screen", opening the game settings screen then the lobby, the game frozen meanwhile;
  * main of a screen sharing game: the cooperative entry stays available — the viewers already linked become players, spawning at the level's starts, with no new QR code exchange; each viewer, already awaited, gets its player in the simulation on the turn following the switch, by the same rule as a sub entering the cycle;
  * main of a cooperative game: stop cooperative — every sub is disconnected and taken back to the WAD menu with an information modal, while the main carries on alone;
  * sub of a cooperative game: leave — its player is removed, and the game goes on for the others;
  * deathmatch: a sub quitting, or whose link is lost, is removed and the match goes on for the others; the main quitting ends it for everyone; once every sub has gone, the match ends and the main leaves the game, back to the WAD menu with an information modal;
  * a sub's pause only opens its own menu: the game goes on, its player standing still and vulnerable, its command neutral every turn — no sub can freeze the others.
* **Game settings screen**, shown to the main only, just before the lobby, for every launch that has settings — cooperative and deathmatch from the Multiplayer screen, cooperative opened from the pause menu; never for screen sharing:
  * it lists the settings of the launched mode only — friendly fire in cooperative; monsters, frag limit, time limit and items in deathmatch (already stored in the Multiplayer options) — built by the same settings page builder as the options, so no interface code is duplicated;
  * it shows the stored values, and what is changed there is stored too, becoming the preset of the next game;
  * the subs join with the main's settings, carried by the `hello` / `welcome` exchange.
* **Lobby during a running game**: a player added from it joins the running game, syncing first and awaited only once ready; it shows each player's colour once players have one.
* **Frags in the deathmatch HUD**: the top-left block of `HudGameBar` shows the player's frag count in place of the kills and secrets counters, which keep their place in single player and cooperative; there are no keys in deathmatch either.
* **Respawn prompt**: outside single player the death modal is replaced, for the main as for the subs, by a "press use to respawn" prompt.
* **Frag table** in the deathmatch intermission.

#### Game rules

* **Profile additions**: each game profile already declares its maximum number of players (4 today) and its player starts 1–4; it still needs its deathmatch start editor number (11), its player colour translations, the player body states (walk, attack, pain, death, gib), the multiplayer item rules (weapon stay, keys stay, altdeath respawn delay) and the respawn loadout. Hexen, once profiled, gets 8 players (starts 1 to 4 then 9100 to 9103).
* **Player slots**: the lobby already gives each sub the lowest free slot, kept for the whole session. The slot now gives the colour (the profile's translations in slot order), the cooperative start, the column of the tally and the row of the frag table; every list shows players in slot order. The lobby ids (main 0) and the player ids (main 1) must be reconciled when sub players enter the roster.
* **Player bodies**: `DoomPlayerBody`, the visible body of every other player — an 8-rotation billboard driven by the profile's player states, recoloured by the slot's colour translation at sprite decode time. The viewed player never draws its own body. Its state (walk, attack, pain, death, gib frame) and each player's frags join the replicated state.
* **Mode rules**: `DoomCoopRules` and `DoomDeathmatchRules` beside `DoomSinglePlayerRules`, answering the questions the modes add — spawn point of a player, what happens on death, whether a picked item stays, item respawn delay, friendly fire, save and load permissions, full kit cheat permission, end of level, whether the main holds a level start for the subs' `levelReady`. `DoomGame` and the systems keep asking the rules, never testing the mode.
* **Multiplayer-only things** (`MTF_NOT_SINGLE`) appear from the first level built for multiplayer: a cooperative game opened from the pause menu keeps the running level as built for single player, and they appear from the next level on. `levelLoad` already carries the main's thing filter and skill, so a sub always builds the same entities.
* **Spawns**: a cooperative player uses the start of its slot, falling back as the free-start rule already does; a deathmatch spawn picks a free deathmatch start at random on the main, as `G_DeathMatchSpawnPlayer` does.
* **Entering the simulation**: a sub's player enters the simulation on the turn after the state that makes it awaited, with its first command — its body appearing at its level start, with its carried equipment on a level change, with the starting loadout on a drop-in.
* **Level start in deathmatch**: in screen sharing and cooperative the main starts a level at once and the subs appear as their devices get ready; in deathmatch, where those seconds are free frags, the main holds its own start, showing the waiting message, until every sub awaited before the change has sent `levelReady` or has been dropped.
* **Pause**: the main's pause freezes the game for everyone, as in screen sharing.
* **Automap**: each player keeps its own map, revealed by what it has seen; in cooperative the other players show on it as arrows in their colour; in deathmatch they never show.
* **Full kit cheat**: allowed in cooperative for every player on its own character, a sub's request being the `cheatFullKit` button of its command, applied by the main like any action; forbidden in deathmatch, where the rules ignore that button.
* **Friendly fire**: in cooperative, as set in the options or the game settings screen; always on in deathmatch.
* **Death in cooperative** follows vanilla (`G_PlayerReborn`, `P_TouchSpecialThing`): a dead player respawns alone, by pressing use, at its level start with the starting loadout, losing weapons, ammo and keys; the level never restarts, even if everyone is dead at once. In multiplayer, keys and weapons stay on the ground once picked up, so a respawned player can take them again. These item rules come from the profile.
* **Deathmatch** adds frags, deathmatch starts, the item rules of the chosen variant ("Weapons stay": nothing respawns; "Items respawn": items back after 30 seconds, weapons vanish once taken), no keys, and the monsters and limits from the options, on top of the cooperative machinery.
* **End of a cooperative level**: the tally shows the stats per player, one column per player (nickname and colour as the header; kills, items, secrets as rows); only the main continues, for the tally as for the story texts, as in screen sharing.
* **End of a deathmatch level** (frag or time limit reached) follows vanilla: the level ends, the intermission shows the frag table (each player against each other), then the match goes on to the next level with scores reset.
* **Level changes**: any player reaching an exit (normal or secret) ends the level for everyone, as in vanilla; every player keeps its equipment, as in single player.
* **Saves**:
  * cooperative: only the main saves and loads, from its pause menu, exactly as in single player — the same five slots per WAD and the same slots modal. The save holds the world as it stands (sub contributions included) and the main's player only, in the single-player format, so it can be reloaded alone or in cooperative; sub players and their projectiles in flight are left out, and a monster targeting a sub player is left without target on reload. Loading keeps the subs connected: they follow it as a level change, and respawn at the level's starts with their current equipment;
  * deathmatch: neither save nor load;
  * a sub never has save or load entries.
* **Per-player events**: HUD messages and pickup flashes targeted at the player they concern; each sub already ignores events targeted at another player.
* **Host advantage**: a sub reacts to the previous frame while the main aims on a fresher one — accepted for this version, a known edge in deathmatch.

#### Protocol additions

* **Control messages**: `hello` / `welcome` (player id, slot, mode, options); `levelLoad` also carries the mode and the options; `intermission` also carries the per-player stats and the frag table; `playerRemoved` (to the other subs); `sessionEnd` gains the reasons "invalid message" and "match over".
* **Command**: a sub already sends its real actions (axes, look angles, buttons, impulses), sampled when the state arrives; the main has to feed them to that sub's player instead of ignoring them.
* **State**: the other players' body state and frags; the HUD block of every player is already there, each sub reading the one of the player it views.

#### Risks still open

* iOS Safari suspends the page when the screen locks or the app goes to the background, which cuts the link: step 9 owns the answer (a rejoin path), not the transport.
* Carrier NATs defeating STUN, with no TURN relay: confirmed, explicit failure message, a shared hotspot is the workaround. IPv4-only behind a carrier NAT is not measured yet.
* The slowest device sets everyone's pace; the real turn rate is still to measure on the device matrix.
* Not yet run on real devices: Android (Chrome), a tablet, two different browsers as subs of one main.
* An image that fails to load never marks the game's image assets ready, so a sub would stay on its loading screen.
* Main performance with four real players (simulation plus per-turn encoding).

#### Step plan

Same working rules as step 6: one commit per lot, each one reviewed (`/doom-review`), solo bit-identical on the benches, README and `libBootstrap.json` versions updated, the loopback test switch removed before every commit.

7. **Mode 2, drop-in cooperative**: the game settings screen before the lobby, player bodies and colours, real commands upstream, cooperative rules (spawns, respawn prompt, weapon and keys stay, friendly fire), per-player HUD events, cooperative save and load, level change for every player.
8. **Mode 3, new multiplayer game**: Cooperative and Deathmatch on the Multiplayer screen, the game settings screen for both modes, cooperative from the start (`MTF_NOT_SINGLE` things), deathmatch rules (starts, no keys, frags, variants, limits, 30 s item respawn), frag table intermission, match end.
9. **Hardening**: iOS backgrounding, full device matrix.

### Visibility culling (PVS / portals) — last, after everything else

A large **performance / rendering** item, to start only **after** everything above. NB: the sector adjacency graph built for `P_NoiseAlert` is a reusable brick here, and the BSP walk + angular clipper of the automap (`DoomAutomapReveal`) is **exactly** the visibility pass asked for below, already written and proven — on the logic side, not the rendering side.

**Observed problem**: no visibility culling — every frame, the **whole** map (a single static mesh) is drawn, and the **z-buffer** alone hides what lies behind solid geometry. So above low walls and **through open areas** (the sky writes no depth), the **distant rooms** show (e.g. the E1M1 exit room seen across the courtyard).

**Pitfall — this is NOT a visual fix.** PVS / portals only remove what is **really occluded** by solid geometry; they do **not** remove what is in **line of sight**. Distant rooms seen across an open courtyard **are** in line of sight, so even a perfect PVS **would still show them** (and in large open areas it "sees far", so it culls very little, precisely where culling is wanted).

* **Goal = hide the distance (aesthetics)** → this is NOT this item, and it is **already in place**: distance darkening (`Engine3d.setDepthShading`, setting `display.distance_shading`) is the answer to the visual. Going further means a real fog towards the `background` in the same fragment shader — a few lines, no structural rework.
* **Goal = performance** (the whole map drawn every frame becomes the bottleneck) → only then this item. **Profile FIRST**: the gain is not guaranteed (see the draw-call trade-off below).

**What the solution requires** (rendering path only):

1. **Break the single mesh.** Today the map is **one merged `Object3d`**, **with no notion of sector per face** (`WadStaticMapBuilder` → `loader.objects().loadFromData('map', …)`). It must be **partitioned by sector**: either one sub-mesh per sector, or a **sector tag per face** + the renderer's ability to skip groups. This is THE central structural change.
2. **Batching / draw-call trade-off.** The WebGL renderer groups faces by `(animKey, alpha, clampV)` into large batches (few calls). Partitioned by sector → **many more draw calls**. On small levels it may be **slower**. The gain depends on the ratio of culled faces to call overhead → to measure.
3. **New systems**:
   * **Sector + portal graph**: the **two-sided linedefs** are the openings (portals) between sectors; build the adjacency + the opening geometry of each portal.
   * **Camera sector tracking per frame** (the BSP locator `WadBspTree.findSector` already gives it).
   * **Visibility pass**: runtime portal traversal (Doom BSP / segs style: recursive clipping of the openings projected on screen), **or** a precomputed PVS per sector (heavy precomputation during the in-browser conversion — probably to avoid). NB: Doom's `REJECT` lump is sector↔sector but **meant for the AI**, too coarse for rendering.

**Technical catch — dynamic portals**: doors and lifts are **dynamic portals**: a **closed door must block the view**. The portal traversal must take the open / closed state into account (otherwise it goes through a closed door) — which is exactly what the solidity test of the automap reveal already does, through `DoomSectorHeights`. The z-buffer already occludes visually, but the visibility logic must account for it so as not to cull or keep wrongly.

**What does NOT change** (reassuring scope):

* **Collision**: independent from rendering (the player collides with invisible walls) → keeps the **full set** of faces; only its **source** changes if the mesh is split, not its logic.
* **Geometry** (earcut triangulation, walls, flats, doors / lifts / switches), **billboards / pickups, interactions, physics, sky, textures / animations**: **logic unchanged** (regrouped, not rewritten). Billboards could *as a bonus* be culled by their sector (additive, not a rework).

**Verdict**: a **focused** item (mesh partition by sector + visibility pass), **not** a global destabilisation of the engine. But: **start it for performance only, after profiling**, and **never** for the visual need "do not see far" (→ fog). In the current state (Doom levels, smooth rendering), **low priority**.

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
