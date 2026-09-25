# Next steps

## Description

Tracks the major upcoming work and the milestones already reached. Only large milestones belong here: the detail of each fix lives in the git history.

When a ToDo item is done, move it to the top of Finished with its completion date.

A ToDo item that carries the full specification of a project split into steps (Multiplayer) keeps that specification whole until the whole project is done: a finished step is neither removed nor summarised, its description stays in place, marked "done".

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

Status: fully designed; the generic network layer (`js/webapp/net/`, `js/webapp/qr/`) is written and runs on real devices through its test bench `_examples/pairing-test.html` and the screen-sharing demo `_examples/pairing-game.html` (step 0, device matrix partly run); steps 1 to 4 are done (the Multiplayer options section, nickname and game settings; the WAD identity; the per-turn commands; the simulation / presentation split with the players, their roster, the item rules and the single-player mode rules); the later steps are not started. This section is the reference for the technology choices, the implementation and the step plan.

Every label quoted below is a working title: the final wording of each one is chosen when it is implemented, and every one of them goes through the translation catalogue in all languages.

Vocabulary: the **main** is the player whose browser hosts the game; the **subs** are the other players (the viewers, in screen sharing).

#### Assumptions

* **Local network first**: the nominal case is every player on one very low latency local network, typically a single Wi-Fi, or the Wi-Fi hotspot of one of the phones. The design (synchronous turns, display-only subs) is tuned for it.
* **Internet as a best-effort bonus**: when internet is reachable, players on different networks (each on its own 4G / 5G, say) can also link, directly peer to peer through a public STUN server. It works on most networks but not all: without a TURN relay (none is planned), carriers with a symmetric NAT cannot link, and the pairing fails with a message advising a shared Wi-Fi or a phone hotspot. Over internet the round trip rises (roughly 30 to 100 ms), and since no turn can start before every command of the previous exchange has made that round trip (see Architecture), the frame rate drops for all players accordingly — fewer than 17 frames per second at 60 ms.
* **Offline stays fully supported**: with no internet (offline PWA, isolated Wi-Fi, hotspot without data), pairing and play work on the local network alone.
* **HTTPS**: the camera, needed for pairing, is only available in a secure context. The game is served over HTTPS, or run as the PWA installed from it; a plain `http://` LAN address cannot pair.
* **One camera per device**: both sides scan a QR code, so every player needs a camera (see Target devices).
* **The same WAD file on every device**: each player imports it on their own device; a WAD is never transferred.
* **No update during a session**: the app updates itself only when it loads (the version check of the bootstrap), never while it runs, so the app version checked at pairing stays the same for the whole session. No game, and so no pairing, can happen during an update: when `AppBootstrap.checkVersion` detects a new version ("Need update"), it never calls `loadApp()` — it clears the service worker cache and reloads the page, and the app only starts after that reload. The multiplayer therefore needs no update guard of its own (no greyed entry, no deferred reload).

#### Modes

Three modes, delivered in this order, each one building on the previous:

1. **Screen sharing** — a new first entry in the main's pause menu, "Share screen". Viewers who join see exactly what the main sees — its view, weapon, HUD, and sounds heard from its position — and follow it through level changes. Viewers send no input: their per-turn command is empty, but they still take part in the synchronous turn cycle exactly like cooperative players — the main waits for it every turn. This is deliberate: this mode exists to build and test the whole network layer and the turn loop first, before any real cooperative or deathmatch gameplay relies on them. It is never made asynchronous.
2. **Drop-in cooperative** — a new pause menu entry opens the running game to other players, who are really added to it, spawning at the level's player starts. Level changes carry every player along.
3. **New multiplayer game** — a new "Multiplayer" entry on the WAD main menu, just above Options, offering **Cooperative** or **Deathmatch**, started fresh from the chosen level.

#### Screens and menus

* **Multiplayer screen** (WAD main menu, above Options): Cooperative, Deathmatch, Join a game, and a shortcut to the Multiplayer options section.
  * Cooperative and Deathmatch go through the existing episode and difficulty screens, as in single player, then the game settings screen, then open the lobby as main.
  * **Join a game** is how a sub joins any of the three modes: the sub picks its WAD first (it is on that WAD's menu), then scans the main's code, shows its own answer code for the main to scan, then lands in the lobby as sub.
* **Pause menu**:
  * main of a single-player game: "Share screen" (first entry) and the cooperative entry, each opening the lobby with the game frozen meanwhile — the cooperative entry through the game settings screen first;
  * main of a screen sharing game: the cooperative entry stays available — the viewers already linked become players, spawning at the level's starts, with no new QR code exchange — each viewer, already awaited, gets its player in the simulation on the turn following the switch, by the same rule as a sub entering the cycle (see Architecture);
  * main of a screen sharing or cooperative game: stop sharing or cooperative — every sub is disconnected and taken back to the WAD menu with an information modal, while the main carries on alone;
  * sub of a screen sharing or cooperative game: leave — its player is removed (cooperative), and the game goes on for the others;
  * deathmatch: a sub quitting, or whose link is lost, is removed and the match goes on for the others; the main quitting ends it for everyone; once every sub has gone, the match ends and the main leaves the game, back to the WAD menu with an information modal;
  * every multiplayer game: an entry opening the lobby, for everyone.
* **Game settings screen**, shown to the main only, just before the lobby, for every launch that has settings — cooperative and deathmatch from the Multiplayer screen, cooperative opened from the pause menu; never for screen sharing, which has none:
  * it lists the settings of the launched mode only — friendly fire in cooperative; monsters, frag limit, time limit and items in deathmatch — built by the same settings page builder as the options, so no interface code is duplicated;
  * it shows the stored values, and what is changed there is stored too, becoming the preset of the next game;
  * the subs join with the main's settings, carried by the `hello` / `welcome` exchange.
* **Lobby screen**, shown before every multiplayer game starts — a new game from the Multiplayer screen, or screen sharing or cooperative opened from the pause menu:
  * it lists the players — nickname, colour, ping — updated live;
  * the main has an "Add a player" action, which runs the QR code exchange and is greyed out once the profile's maximum is reached, a "Remove" action on each sub (an unresponsive device, a wrong pairing), and a "Start" action;
  * the subs see the same list, updated live, with no action but "Leave";
  * during a running multiplayer game, it stays reachable from everyone's pause menu: only the main can act on it (a player added then joins the running game, syncing first and awaited only once ready — see Entering the cycle); everyone else can only go back.
* **Multiplayer entries greyed out**: every multiplayer entry (Multiplayer screen, pause menu entries) is greyed out when no camera is detected — `navigator.mediaDevices` missing, as in an insecure context, or no `videoinput` in `enumerateDevices()`, which lists devices without asking for permission but only settles once the page is visible, so the menu never waits on it — and likewise when WebGL is unavailable, since every multiplayer session renders with it (see Game rules).
* **Frags in the deathmatch HUD**: in deathmatch, the top-left block of the game HUD (`HudGameBar`) shows the player's frag count in place of the kills (`☠ x/y`) and secrets (`★ x/y`) counters, which keep their place in single player and cooperative; there are no keys in deathmatch either. The label goes through the translation catalogue.
* **Ping in the fps readout**: when the "show fps" display option is on during a multiplayer game, the game HUD's fps readout (`HudGameBar`) also shows the ping, e.g. "59fps - ping 30ms", through one translation code with placeholders. A sub shows its round trip to the main; the main shows the worst ping among its subs, the per-player detail staying in the lobby.

#### Multiplayer options

* A new **Multiplayer** section in the options, holding the nickname and every multiplayer game setting, all persistent:
  * **Nickname** (see below);
  * cooperative: **friendly fire**, on by default as in vanilla;
  * deathmatch: **monsters** (on by default, as a plain `-deathmatch`), **frag limit** (none, 5, 10, 15, 20, 30, 50) and **time limit** (none, 5, 10, 15, 20, 30 minutes), both "none" by default, and the **items** rule, named by what it does rather than by its version: "Weapons stay" (deathmatch 1.0, the default: weapons stay, nothing respawns) or "Items respawn" (2.0 "altdeath": items respawn after 30 seconds, weapons vanish once taken).
* Reachable from the options and from the shortcut on the Multiplayer screen, but never during a game, whatever the mode: the in-game options hide the section. The game settings screen shows the same stored values again before each launch (see Screens and menus).

#### Nickname

* Allowed characters: `A`–`Z`, `0`–`9`, space and `-`. Lowercase is uppercased, diacritics are stripped (`é` → `E`), anything else is rejected.
* Automatically trimmed on validation, inner runs of spaces collapsed to one; 16 characters at most.
* Empty by default, and mandatory to play: validation stays disabled while the trimmed value is empty. The modal can always be cancelled, like every other modal of the menus: the stored value is left unchanged, and a multiplayer flow entered with an empty nickname simply goes back to the menu it came from — no screen ever traps the player, on a gamepad least of all.
* Entering any multiplayer flow (Multiplayer screen, pause menu entries) with an empty nickname first opens a dedicated modal ("Please enter your nickname"), not the settings one; the value entered is saved to the settings, then the flow resumes — or is abandoned if the modal is cancelled.
* Stored as a new declarative `text` setting type in `DoomSettings.DEFINITIONS`, carrying its allowed characters and maximum length; the same sanitising applies to typed input and to values read back from storage.
* Duplicates are allowed: players are identified by an internal id, and told apart by their colour in the lobby, on the automap and in the tallies.
* Wording: "Nickname" everywhere (en Nickname, fr Surnom, it Soprannome, es Apodo).

#### Text entry modal

* One shared text entry modal, used by both the options and the multiplayer launch; each caller only supplies its title or message and the initial value (the current nickname from the options, empty otherwise).
* No browser `<input>`: a native field would pop the OS keyboard on mobile (viewport resize, fullscreen loss, broken letterbox scaling) and is unusable with a gamepad.
* An in-game virtual keyboard grid: `A`–`Z`, `0`–`9`, `-`, a wide space key, backspace, enter and cancel, the letters laid out like the physical keyboard of the interface language (AZERTY in French, QWERTY in English, Italian and Spanish).
  * Mouse and touch: tap a key.
  * Gamepad: 2D focus movement on the grid, `A` types, `B` erases — and cancels when the field is already empty, the usual virtual keyboard convention —, `Start` validates. This extends `MenuListNavigation` to grid navigation.
* The physical keyboard is also accepted in the same modal through `keydown` on `event.key` (the typed character, layout independent): allowed characters are typed, the arrows move the focus on the grid, `Enter` presses the focused key, `Backspace` erases, `Escape` cancels, everything else is ignored. The focus opens on the validate key and typing never moves it, so typing then pressing `Enter` validates.
* Space, backspace, enter and cancel keys show generic SVG icons drawn as CSS masks, like the existing language globe, so the rendering does not depend on system fonts; their accessible labels come from the translation catalogue. Only `A`–`Z`, `0`–`9` and `-` are shown as characters.

#### Game rules

* **Player count per profile**: each game profile declares its maximum number of players (main included), the editor numbers of its cooperative and deathmatch starts, and its player colour translations. That is 4 for every current game (starts 1 to 4, deathmatch starts 11), and 8 once Hexen gets its profile (starts 1 to 4 then 9100 to 9103). Colours and starts follow the player's slot (see Player slots).
* **Multiplayer-only things** (`MTF_NOT_SINGLE`) appear from the first level built for multiplayer: a cooperative game opened from the pause menu keeps the running level as it was built for single player, and they appear from the next level on. Since those things decide which entities exist, and so the ids every device shares, `levelLoad` carries the thing filter the main's build used (single player or multiplayer), apart from the mode.
* **Spawns**: a cooperative player uses the profile's player start of its slot, falling back to player start 1 when the map has fewer starts than that; a deathmatch spawn picks a free deathmatch start at random on the main, as `G_DeathMatchSpawnPlayer` does.
* **Pause**: the main's pause freezes the game for everyone (as in vanilla, and required anyway since the main's pause menu is where sharing and cooperative are opened). Meanwhile every sub shows a "Paused by the main" message (opened by the `pause` control message, cleared by the next state, which is how play resumes), and can still open its own pause menu to leave the game altogether (in deathmatch too, the match going on for the others). A sub's pause only opens its own menu: the game goes on, its player standing still and vulnerable, so no sub can freeze the others.
* **Automap**: each player has its own map, revealed by what it has seen, as in vanilla; the reveal is part of the presentation, run on each device for its own player. In cooperative, the other players show on it as arrows in their colour; in deathmatch they never show.
* **WebGL forced**: during any multiplayer session — screen sharing, cooperative or deathmatch, on the main as on every sub — the game renders with WebGL whatever the `display.renderer` setting says. The stored setting is left untouched and applies again once the session is over; meanwhile the renderer line of the in-game Display options is not offered.
* **Full kit cheat**: unchanged for the main in screen sharing (the viewers see the result); allowed in cooperative for every player on its own character, a sub's request being the `cheatFullKit` button of its command, applied by the main like any action; forbidden in deathmatch, where the rules ignore that button. A viewer's command being empty, screen sharing viewers never trigger it.
* **Player slots**: the main holds slot 1; a joining sub takes the lowest free slot and keeps it for the whole session, whoever leaves in the meantime — a slot derived from the current order would change a player's colour and start each time someone above it left. The slot gives the colour (the profile's translations in slot order), the cooperative start, the column of the tally and the row of the frag table; every list shows players in slot order, the same on every device.
* **Death of the main in screen sharing**: the main keeps its single-player death modal (restart, load, new game, quit); the viewers see its death screen without the menu, with a "The main is dead" message. A restart or a load takes them along as a level change (they rebuild the level, then follow the next state); a new game or quitting stops the sharing, the viewers going back to the WAD menu with an information modal.
* **Friendly fire**: in cooperative, as set in the Multiplayer options or the game settings screen; always on in deathmatch.
* **Death in cooperative** follows vanilla (G_PlayerReborn, P_TouchSpecialThing): a dead player respawns alone, by pressing use, at its level start with the starting loadout, losing weapons, ammo and keys; the level never restarts, even if everyone is dead at once. In multiplayer, keys and weapons stay on the ground once picked up, so a respawned player can take them again. These item rules come from the profile. The single-player death modal is replaced, for the main as for the subs, by a "press use to respawn" prompt.
* **Deathmatch** adds frags, deathmatch starts, the item rules of the chosen variant, and the monsters and limits from the options, on top of the cooperative machinery.
* **End of a cooperative level**: the tally shows the stats per player, one column per player (nickname and colour as the column header; kills, items, secrets as rows). Only the main can continue, for the tally as for the episode finale texts; the subs see the same screens with no action, and follow when the main continues.
* **End of a deathmatch level** (frag or time limit reached) follows vanilla: the level ends, the intermission shows the frag table (each player against each other), then the match goes on to the next level with scores reset.
* **Level changes**: in every mode, the level change carries every sub along, with its equipment carried over as in single player. In cooperative and deathmatch, any player reaching an exit (normal or secret) ends the level for everyone, as in vanilla.
* **Saves**:
  * screen sharing: the main saves and loads as in single player; a load takes the viewers along as a level change;
  * cooperative: only the main saves and loads, from its pause menu, exactly as in single player — the same five slots per WAD, shared with solo games, and the same slots modal. The save holds the world as it stands (sub contributions included) and the main's player only, in the single-player format, so it can be reloaded alone or in cooperative; sub players and their projectiles in flight are left out. Loading during a cooperative game keeps the subs connected: they follow it as a level change, and respawn at the level's starts with their current equipment;
  * deathmatch: neither save nor load;
  * a sub never has save or load entries.

#### WAD identity

* The main's QR code carries the identity of its WAD: a SHA-256 of the whole file, computed once at import and stored in the WAD metadata (computed at the first opening of its menu for WADs imported earlier), its first 8 characters shown on the left of its WAD list line.
* A sub whose selected WAD does not match gets an error modal, and the link is refused.
* Level changes need no further check: the main sends the level code, and every sub builds it from the same file.

#### Architecture

* **Host-authoritative**: the main's browser runs the only simulation — world evolution, interactions, collisions, shots, damage — including the subs' use of switches and lines. The subs only send their actions and render the states they receive; they are passive and compute nothing but display: sound volume, pan and pitch, texture and flat animation, effect animation, the rotation view of bodies, the light of the sector they stand in, mover motion loops derived from their pose, the automap reveal — presentation only, never simulation. With a single simulation, the remaining `Math.random` calls cannot desynchronise anything. If the main leaves or its link is lost, the game ends for everyone: there is no host migration, no sub ever takes over the simulation.
* **Synchronous cycle**, for simplicity and robustness: the main never simulates a turn before it holds the command of every player for that turn, so every device always shows exactly the same state, with no interpolation and no fixed rate. Synchronous does not mean sequential: rendering, network transfers and simulation overlap as a pipeline, each device sending what the other waits for **before** it starts rendering.
  * sub, on receiving state N: apply it; sample and send **at once** its command for turn N+1, before rendering; then render state N — meanwhile the command travels and the main simulates turn N+1. When its render is done, it waits for state N+1 if it has not arrived yet, and loops. Its render time thus hides the main's simulation time as much as possible.
  * main, after sending state N to every sub: render state N — meanwhile each sub receives that state and sends back its command for turn N+1. When its render is done, it checks that the command of **every** sub for turn N+1 has arrived, and waits for the missing ones if not; it then samples its own command, simulates turn N+1, sends state N+1 to every sub at once, and renders it while the subs answer with their commands for turn N+2.
  * The resulting pipeline:

    ```text
    MAIN                                   SUB

                                           receives state N
                                           sends command N+1 at once
    renders N           <------------->    renders N
    (commands travel)

    waits for missing
    commands, if any

    simulates N+1       <------------->    finishes rendering N / waits

    sends state N+1     -------------->    receives state N+1
                                           sends command N+2 at once

    renders N+1         <------------->    renders N+1
    (commands travel)
    ...
    ```

  * Strictly synchronous: the main never simulates the next turn until it has received the expected command of every player taking part in the cycle. There is no client-side prediction, no reconciliation, no reuse of a previous command when one is missing, no speculative simulation and no catch-up mechanism: if a sub is momentarily slow, the main waits. This is deliberate for this first architecture.
  * The turn's time step is the time actually elapsed since the previous turn (the frame time, capped by the engine), so the game keeps its normal speed whatever the pace; solo is unchanged, a main without subs waiting for nobody.
  * Everyone plays at the pace of the slowest: a turn lasts about the longest of the main's render plus its simulation, one network round trip plus the main's simulation, and the slowest sub's render. On a shared Wi-Fi with fast devices the round trip is hidden behind the renders, so the pace stays close to the solo frame rate; an old phone brings everyone down to its own rendering pace, roughly 25 frames per second; a Wi-Fi spike is a brief hitch for all. Screen sharing follows the same cycle: each viewer's empty command is awaited every turn, so a slow viewer slows the main.
  * The loop is event-driven, paced by `requestAnimationFrame`: drawing only ever happens in the next animation frame callback, on the display refresh. A sub applies a received state and sends its command from the message handler, then draws that state at the next animation frame; the main simulates the next turn as soon as both its render is done and every command has arrived, then draws the new state at the next animation frame. The turn duration is therefore rounded up to a whole number of display refresh periods, and moves in steps: a turn that misses the refresh by a millisecond costs a whole frame (60 then 30 frames per second on a 60 Hz screen, not anything in between). This is accepted: the goal of this first architecture is a loop that works, not smoothness — the prototype and the device matrix measure where the pace actually lands.
  * Host advantage, accepted for this first version: a sub samples its command for turn N+1 as soon as state N arrives, so it reacts to the previous frame and its action shows two frames plus a round trip later, while the main samples its own command just before simulating. The main thus aims on a fresher frame with no network delay — harmless in cooperative and screen sharing, a known edge in deathmatch.
  * Two guards, and only two, share the same 5 second delay. The **liveness timeout** is generic (`NetPingMeter`): every link is pinged every second in every phase, and a side that receives nothing at all — no ping, pong, state, command or control message — for 5 seconds treats the link as lost (see Lost link); it runs in both directions, syncing subs included, with the one exception stated under Entering the cycle. The **command timeout** is the cycle's own: an awaited sub whose command has not arrived 5 seconds after the state it answers was sent is removed even though its link may still answer pings, and the cycle carries on without it. Until then, the main waits.
  * **Waiting message**: once a wait lasts more than half a second (so that micro-hitches never flicker), every player sees a "Waiting for {nickname}…" message over the frozen game. The main knows whom it waits for: it shows the message and sends the other subs a `waiting` control message with the missing players, cleared by the next state. An awaited sub that receives no state for half a second without such a message shows the same message with the main's nickname. The message goes through the translation catalogue, the nickname as a placeholder.
  * **Entering the cycle — syncing, then awaited**: a sub is in one of two states, held by the main.
    * **Syncing** — from its pairing (or from a `levelLoad`) until the main sends it its first state: it is loading the WAD, building the level, or has just sent `levelReady`. It is **not awaited**: the main runs its turns without it, the game never freezes for it, and it sends no command. Its player does not exist in the simulation. While the sub builds its level, its thread may be busy for well over 5 seconds on an old phone and answer no ping, so the liveness timeout is suspended on both sides for that build alone: the WebRTC connection state (`failed` or `closed`), the main's "Remove" action in the lobby, or the sub leaving on its own are what drop a sub during its build; the timeout resumes with `levelReady`. A syncing sub shows its level loading, never the waiting message.
    * **Awaited** — the switch is made by the main, at one precise point: when `levelReady` arrives, the sub is not added to the awaited players at once, but marked to be included in the **next state the main sends**. When the main sends the state of turn N, that same state (complete, like every other) also goes to the new sub, and from that moment the sub is awaited: its command for turn **N+1** is mandatory, exactly like the other subs', and the command timeout starts counting for it. A `levelReady` arriving during the main's render or simulation simply waits for that next send.
    * **Its player enters the simulation at turn N+1**, with its first command: in cooperative and deathmatch its body appears at its level start on that turn, with its carried equipment on a level change, with the starting loadout on a drop-in; in screen sharing the viewer has no player, and only becomes awaited.
    * The switch is atomic by construction: the main runs on one thread and alone decides on which turn it first sends a state to a sub, and the single ordered channel delivers that state before any later one. There is no turn where a sub is awaited without having received a state, nor a state received without its command being awaited from the next turn.
    * On a `levelLoad`, every sub goes back to syncing at once: the main empties its awaited players when it sends the message, and each sub re-enters by the same rule. Whether the main then starts at once is a question for the rules: in screen sharing and cooperative it does, and may play the first seconds of a level alone, the other players appearing as their devices get ready — accepted, as the price of never holding everyone on the slowest build; in deathmatch, where those seconds are free frags, the main holds its own start, showing the waiting message, until every sub awaited before the change has sent `levelReady` or has been dropped. A newcomer still joins a running level by the same rule in every mode.
  * A sub with its own pause menu open stays in the cycle, sending a neutral command every turn.
  * Phases without turns: while the main is paused, during the end-of-level tally and the finale texts, while a level is being built after `levelLoad`, and while the lobby is open from the pause menu, no turn runs. The liveness timeout keeps running through pings, but neither the command timeout nor the waiting message counts: each of these phases is opened by a control message (`pause`, `intermission`, `finale`, `levelLoad`), which the single ordered channel delivers before the missing states, so a sub always knows it is not waiting. A sub whose `levelReady` arrives during one of these phases receives that phase's message at once, so it shows the same screen as the others rather than a finished loading screen with nothing behind it.
* **Latency**: a sub's command for turn N+1 leaves as soon as state N arrives, so its action shows in state N+1, the state that follows the one rendered right after sampling — two displayed frames after the frame the player was reacting to, plus the round trip (see Host advantage); there is neither client-side prediction nor interpolation, and the sub stays display-only.
* **State replication, not video**: each sub loads the same WAD and level locally, then receives every turn a **complete snapshot of the replicated state** (defined exactly below) — never the immutable data it rebuilds itself from the WAD. Every snapshot is **self-contained**: applying it needs none of the previous ones, so there is no delta chain, no dirty tracking, and no periodic resynchronisation; a wrong application is corrected by the next turn instead of corrupting the replica for good. Deltas are not part of this version; they would only be studied if measurements showed the bandwidth or the encoding cost call for them.
  * **Joining is receiving a state**: there is no separate join snapshot — a sub that has built its level applies the next turn's state like everyone else. `DoomGameSnapshot` stays the save format only: its simulation internals (monster AI, random index, accumulators) are useless to a sub, which simulates nothing.
  * **Applying a state** compares the entity ids it lists with the entities the replica holds: missing ones are created (projectiles, drops, bodies born in play), absent ones removed, the others updated. The replica keeps its entities between turns, never a history of states.
  * **One-shot events are not state**: a sound that starts, an impact, a decal or a HUD message exist only on the turn they happen (screen flashes are not events: their decaying intensity is player state, see below). Each turn message therefore carries the self-contained snapshot **and** the events of that turn; since the stream is reliable and ordered and no turn is skipped, none is lost.
  * **The state is the only source of truth of the world**: every persistent fact — a body dead or alive, a position, a door open at 60 %, a player's health, a projectile in flight, a mover in motion — is set by the state alone. Events only carry what a state cannot reproduce (play this sound now, show this impact, display this message), and never change the world on the sub: a faulty or missing event can cost a sound or an effect, never desynchronise the replica. There is no "monster died" event, for instance: the death sound is an event, the death itself is the state.
  * **One message for every sub**: the state is the same for all of them — it holds the HUD block of every player, and each sub reads the one of the player it views (its own in cooperative, the main's in screen sharing); a targeted event names its player, and the other subs ignore it. The main thus encodes one buffer per turn and sends it unchanged to every sub, whatever their number. The only trade-off — a sub receives the other players' health and ammo, which it never shows — is accepted for this first version.
  * **Decals, accepted exception**: an impact mark stays on the wall although it is born from an event. It is presentation only and cannot desynchronise anything, but a sub joining mid-level, or missing an event, lacks the decals placed before — accepted, as saves already leave decals out.
  * **The boundary of the snapshot**, which is not "static WAD objects versus dynamic objects": many things born from the map change during play (a sector's floor, its light, a switch texture, a pickup taken). The rule is: **every mutable value that can diverge from the initial state the WAD rebuilds, and that the sub needs to present the world correctly, is replicated; immutable data rebuildable from the WAD stays local; mutable values the simulation alone reads are not sent.** Three questions decide any property: can it differ from what the level build produces? does the sub need it to display, to play a sound, or to fill the HUD? — two yes put it in the snapshot; is it only read by the simulation? — then it stays on the main.
    * **Replicated — players** (every player, since one message serves every sub): position, yaw and pitch; camera state (eye height with crouch and step smoothing, roll with strafe lean and death roll, telezoom field of view); body state for the other players' bodies (walk, attack, pain, death, gib frame); HUD state — health, armour points and absorption, ammo and maximums, weapons owned and active, keys, items and powers with their remaining time; weapon sprite state (sprite, frame, bob and raise offsets, muzzle flash light level); screen tint inputs (damage, pickup and berserk flash intensities, which decay on the main); dead or alive (a dead viewed player shows the respawn prompt, or the "The main is dead" message in screen sharing); frags, in deathmatch. Player slots (hence colours) and nicknames are not state: they come from the lobby.
    * **Replicated — bodies** (monsters, corpses, barrels, pods, bodies born in play): id, kind, position, facing, current state frame, bright flag, crushed-into-gibs flag. Not their health, target or AI counters.
    * **Replicated — projectiles in flight**: id, kind, position, current frame.
    * **Replicated — pickups**: the ids of the map pickups still present — a pickup taken is simply absent, one respawned in altdeath is present again — and, for the drops born in play (a zombie's clip, a sergeant's shotgun), id, kind and position, which the sub has no WAD thing to rebuild from.
    * **Replicated — movers**: the pose of every mover instance (doors, lifts, perpetual platforms, rising floors, stair steps, crushers, ceilings). This is how sector floor and ceiling heights travel: in this engine they are not sector fields but the vertical offset of the instance that carries them, and the live heights the sub needs (sound origins, automap reveal) are derived from those poses exactly as on the main.
    * **Replicated — switches**: on or off, for panels and for the mover faces they swap remotely.
    * **Replicated — sector surfaces**: the live floor flat of every sector a "+change" line can rewrite.
    * **Replicated — sector lights**: the current light level of every sector whose light can change (the lighting thinkers today, which draw random numbers on the main; any light-changing special added later).
    * **Replicated — level stats**: kills, items and secrets found and their totals, level time.
    * **Local, immutable, rebuilt from the WAD**: geometry, textures, flats, sprites, sounds, music, sky, the initial things, sector base heights and light levels, linedefs and their flags, BSP, REJECT, automap geometry, progression, level names, profile tables.
    * **Local, derived by the sub** (presentation, never sent): texture and flat animation, scrolling walls, the rotation view of a body, the light of the sector a body stands in, sound attenuation and pan, mover motion loops (from the pose changing), effect animation, automap reveal, night vision and invisibility rendering (from the viewed player's powers).
    * **Mutable but simulation-only** (never sent — they diverge from the WAD, but nothing displays them): W1 / G1 lines already used, switch and door timers, mover animation time and cycle (only the pose shows), sector specials (damage, secret, push — including those a "+change" line rewrites), secrets not yet found, monster health, targets, thresholds, movement and reaction counters, sound targets, velocities, ride links, pressure and crush state, the random index, the 35 Hz accumulators — all of which `DoomGameSnapshot` does save, precisely because it rebuilds a simulation and the sub does not.
    * A property the implementation discovers later is classified by the same three questions, never by where it was born.
  * In screen sharing, the sub renders with the camera on the main's player; replicating state rather than streaming video is what lets screen sharing build the whole network layer the next modes rely on. The main's own performance is not a concern for now.
* **Transport**: a browser can neither open a server nor discover peers on the network, so WebRTC data channels are the only direct browser-to-browser link. They still need an initial pairing step where both browsers exchange their connection descriptions, done here by QR code.
* **Pairing by QR code** — no signaling server, no TURN relay, no account:
  * the main shows a QR code holding the app version, its WebRTC offer, the WAD identity and the mode; the sub scans it and shows a QR code holding the app version, its answer and its nickname; the main scans it back and the link opens;
  * each side gathers every address it can be reached at (WebRTC ICE candidates): its local network address, always, and its public address discovered through a public STUN server, when internet answers within a short timeout (about 2 s — `navigator.onLine` is not reliable enough to decide). Both go into the QR code, and WebRTC tests every pair on both sides, keeping the first that works, local preferred. The player never chooses;
  * STUN servers: only large, stable, recognised operators, two at most (more slows address discovery, Firefox warns about it) — `stun:stun.l.google.com:19302` (Google, the de facto standard, though without any official commitment) and `stun:stun.cloudflare.com:3478` (Cloudflare, officially documented as free and public). The list is a single configuration constant of the network layer; a self-hosted `coturn` on `spipu.net` could be added later. A STUN server only sees the player's public IP at connection time, never the game;
  * two scans per sub are unavoidable (WebRTC needs one exchange each way); the topology is a star, each sub paired with the main only;
  * the session description is stripped down to what the link needs (credentials, fingerprint, candidates), about 150 to 200 bytes instead of 1–2 KB, to keep the codes small and quick to scan;
  * `BarcodeDetector` is missing from Firefox, so QR decoding and encoding come from embedded libraries in `js/lib/`, like libadlmidi;
  * an offer serves one sub: every "Add a player" opens a new connection and shows a new code carrying an invite id, which the answer echoes so that the main pairs it with its pending invite — an answer to an invite already answered is refused;
  * the sub's connectivity checks start as soon as it creates its answer, and fail after a browser-dependent delay of some tens of seconds if the main has not scanned that answer by then: the second scan must fit in that window, which the test bench measures — one more reason to keep the main's scanner open beside its code (below);
  * the sub answers as DTLS server (`setup:passive`): its ICE checks succeed before the main has read its answer, so as DTLS client its first handshake would reach a main that drops it and wait for a retransmission (seconds); as server it waits for the main, which only speaks once ready;
  * **first risk to prototype**: browsers hide local IPs behind mDNS `.local` host candidates, which some routers and Android devices fail to resolve. The mitigation follows RFC 8828: a page holding the camera permission gets real host addresses (Chrome documents it, Firefox is expected to apply the same rule), so each side opens its camera **before** creating its offer or answer and keeps it open for its scan, the QR code and the camera preview sharing one screen; the prototype confirms it on every browser of the matrix.
* **Target devices**: anything with a browser and a camera — iPhone, Android, tablets, PCs with a webcam. A device without a camera cannot pair and is not supported in multiplayer. iOS Safari is part of the test matrix: it drops the link when the screen locks or the app goes to the background, which the existing screen wake lock only partly covers.
* **Lost link**: a link is lost when its liveness timeout fires on either side, or when its WebRTC connection state turns `failed` or `closed`. A sub whose link is lost is handled as if it had left (removed from the game, back to the WAD menu with an information modal); there is no automatic reconnection — it pairs again through the lobby. A sub that loses the main's link ends its session the same way.

#### Code layout and quality

* **`js/webapp/`** holds everything generic, with no knowledge of the game nor of the 3D engine: the WebRTC link, the compaction of connection descriptions for QR codes, QR code generation and camera scanning, ping measurement, the star session (main and subs), message sending and receiving.
* **`js/doom/`** holds everything specific: message contents (player commands, per-turn state snapshots and events, and their binary codecs), WAD identity, lobby, modes and their rules, menus.
* **`js/engine/`** stays network-free, but gains what is generic to the 3D engine — several players in `World`, state export and import of entities — as primitives the game layer calls without the engine knowing they serve networking.
* The network files of `webapp/` are declared in the **doom** `libBootstrap.json`, which consumes them (as `appDatabase.js` is), and so is the QR library.
* Code quality is a first-class requirement of this project: short single-responsibility classes, narrow interfaces between layers, dependencies injected rather than reached through globals, transport, session and message contents replaceable independently (SOLID), and naming following the project's domain prefixes.

#### QR code library

* **zxing-wasm** (Sec-ant, github.com/Sec-ant/zxing-wasm), full build (reading and writing), vendored in `js/lib/zxing-wasm/` with its licence files (MIT, plus Apache-2.0 for zxing-cpp and BSD-3 for zint — all compatible with the project's MIT licence), as libadlmidi is.
* Why: one library for both directions; built on zxing-cpp, the reference decoder (robust with poor light, tilted screens, blur); actively maintained (3.1.4, September 2026); an IIFE build exposing a `ZXingWASM` global, fitting the module-less bootstrap; no telemetry.
* Its only network call is fetching its `.wasm`, from the jsDelivr CDN by default: `prepareZXingModule({locateFile})` points it to the local copy, so no CDN is ever contacted and it works offline.
* The native `BarcodeDetector` is not used, even where available, so that decoding behaves the same on every browser.
* Cost: about 1.46 MiB of wasm, comparable to libadlmidi's, cached by the PWA.

#### Technical design

##### Guiding principles

* **Single-player is a multiplayer game with no sub.** There is one code path: the solo game is a main session with an empty roster, so nothing is written twice and solo keeps being tested by every multiplayer change.
* **Simulation and presentation are separated.** The simulation (world, systems, rules) runs on the main only; the presentation (camera, rendering, HUD, weapon overlay, sound listener, automap drawing) runs everywhere, bound to one *viewed player*, fed either by the local simulation (main) or by replicated state (sub). The main never consumes its own state: it renders its authoritative world directly, encodes the state only to send it, and never decodes nor applies it — the replica exists on the subs alone.
* **Commands, not inputs.** The simulation never reads `Inputs`: it consumes one command per player per turn, sampled locally for the main and received over the network for the subs — the vanilla `ticcmd_t` model. `UserCommand` is the definitive boundary between the control devices and the simulation: no key code, pointer or touch event, gamepad button index, stick axis or device setting ever crosses it — only game actions.
* **Same level build everywhere.** Every device builds the level from the same WAD with the same deterministic builder, so every built entity shares one code — and one numeric network id — on every device, and only the replicated state travels (see The boundary of the snapshot).
* **Layers never reach upward**: `engine/` knows neither network nor Doom; `webapp/` networking knows neither the engine nor Doom; `doom/` wires them together.
* **Replaceable pieces** (SOLID): the link is an interface (WebRTC in production, a loopback for tests), the game rules are a strategy per mode, message contents are codecs separate from transport and session.

##### Prerequisite refactorings (solo plays exactly as before after each one)

**Engine (`js/engine/`), generic primitives only:**

* **`UserCommand`** (new entity): movement axes (-1 to +1), look **angles** (yaw and pitch deltas in degrees, never pixel-equivalent deltas), and a set of named buttons (the engine defines `jump`, `crouch`, `walkSlow`, `action`; the game adds its own: `fire`, `weaponNext`, `weaponPrev`, `cheatFullKit`), plus impulse counters (weapon wheel). Plain data, serialisable.
  * Everything that depends on the device is resolved before the command, on the device that samples it: key mapping, mouse and stick sensitivity (the conversion from pixels to angles, today `User.lookMouse` with its `turnSpeed`, moves there), dead zones, move saturation, Y inversion, virtual pad gestures. So each sub's own settings apply to its own player, and the main never sees them.
  * What enters the command is everything the simulation consumes — today the direct `Inputs` reads of `World.update` (action, walk slow, crouch, jump, the movement axes, the look) and of `DoomGame` (fire, next and previous weapon, weapon wheel, full kit cheat). What stays local to the device, outside the command, is what drives the flow or the presentation only: pause, HUD view toggle, automap toggle.
* **`InputCommandSampler`** (new, `input/`): the only reader of the `Inputs` devices. It collects continuously and produces one `UserCommand` when the cycle asks for it — on a sub when a state arrives, on the main just before simulating. Look angles are accumulated between commands (pointer and touch deltas summed, stick deflection integrated over the elapsed time) and so are the wheel impulses; movement axes are read when the command is produced; a button counts as pressed if it was down at any moment since the previous command, even if already released, so a tap shorter than a turn (66 ms at 15 turns per second) is never lost, and the next command shows it released. Button edges are derived from the previous command by whoever consumes it, per player — never kept in `World` again.
* **`World`**: a list of users (`addUser`, `removeUser`, `getUsers`) instead of one; `update(dt, commands)` takes a map user → command and loops the per-player steps (input, use probe, mover pressure, platform riding, move, blockage, damage) over every user. The camera user leaves `World`: `Engine3d.displayWorld(world, viewUser)`. `World.update` runs on the main only; a sub never updates its world, `DoomReplicaApplier` writes into it.
* **`Instance`**: `update(dt, user, action)` split into `advance(dt)` (once per turn, on the main only — on a sub, poses come from the state) and `checkTriggers(user, command)` (per user, first user wins); the triggering user (the *activator*) is passed on to `Interaction.triggered(instance, activator)` and `AbstractInteraction`. Pressure and crush state become per victim (OR-ed across users, reset once per turn).
* **`Collision`**: per-user riding state (`platformDeltaApplied`, previous position) instead of one slot; players block each other (a box per user).

**Game (`js/doom/`):**

* **Time step**: `World.update` and every system run once per turn on the elapsed time; the Doom systems keep their 35 Hz accumulators, which produce exact vanilla tics. The `MS_PER_TIC` constant, duplicated in four systems, is factored into `WadConstants`.
* **`DoomGame` split** (about 1300 lines) into:
  * `DoomGame`: flow only — level start and transitions, pause, tally, finale;
  * `DoomSimulation`: the main-only turn — world, monsters, projectiles, effects, weapons, rules;
  * `DoomPresentation`: everything bound to the viewed player — engine display, HUD, weapon overlay, sound listener, automap reveal, field of view (the telezoom value is player camera state, computed by the simulation on the main and replicated to the subs), settings push;
  * `DoomPlayer`: one per player — `DoomUser`, `DoomPlayerWeapon`, id, nickname, colour, per-player stats and frags, carried state, button edges;
  * `DoomPlayerRoster`: the players, lookup by id, the local player.
* **`DoomGameRules`** strategy, one implementation per mode — `DoomSinglePlayerRules`, `DoomCoopRules`, `DoomDeathmatchRules` — answering every mode-dependent question: which things spawn (`MTF_NOT_SINGLE`, keys absent in deathmatch), spawn point of a player, what happens on death (death modal / respawn / frag), whether a picked item stays (weapon stay, keys stay), item respawn delay, friendly fire, save and load permissions, full kit cheat permission, end of level, whether the main waits for the players' `levelReady` before starting a level. `DoomGame` and the systems ask the rules, never test the mode.
* **Several players everywhere a single `_user` is held**:
  * monsters: a players list; the real `P_LookForPlayers` loop with `lastlook`; `noiseAlert(player)` from the shooter; per-player sight cache; the target set to the player actually seen or heard; `'@player:N'` target codes in saves (a monster targeting a sub player, absent from a cooperative save, is left without target on reload); players blocking monster moves and telefrags;
  * damage and traces: radius attacks, hitscan and projectiles against every player (friendly fire and deathmatch through the rules); the killer recorded for kills and frags; the BFG spray origin taken from the projectile owner, not from the player;
  * interactions: pickups, teleports (cooldown per actor, telefrag of players), secrets (credited to the finder), sector damage and push loop over players; `WadLineCrossing` keeps a last position per actor;
  * sounds: a player's own sounds get the player as origin, heard positionally by the others.
* **Level build**:
  * player starts 1–4 and deathmatch starts collected through profile editor numbers;
  * the Heretic mace spot is chosen deterministically (seeded from the map checksum) instead of `Math.random`, so every device builds the same level.
* **Player bodies**: `DoomPlayerBody`, the visible body of every other player — an 8-rotation billboard driven by the player states of the profile (walk, attack, pain, death, gib), recoloured by the profile's colour translation at sprite decode time. The viewed player never draws its own body.
* **Profile additions**: max players, start editor numbers, colour translations, player body states, multiplayer item rules (weapon stay, keys stay, altdeath respawn delay), respawn loadout.

##### Network layer, generic (`js/webapp/net/`, `js/webapp/qr/`)

| Class | Responsibility |
|---|---|
| `NetByteWriter` / `NetByteReader` | Little-endian binary writing and reading through `DataView`; a read past the end throws, which fail-fast decoding relies on; ASCII fields refuse any other character. Shared by every codec, the game's included. |
| `NetHex` | Hexadecimal text ↔ bytes, for the textual fields of the compact signal and the loopback channel names. |
| `NetError` | Typed error, its code (`NetError.VERSION_MISMATCH`, `WRONG_KIND`, `INVALID_CODE`, `UNKNOWN_INVITE`, `INVITE_USED`, `INVALID_SIGNAL`, `INVALID_MESSAGE`, `LINK_LOST`, `CANCELLED`) telling the UI which explicit modal to show. |
| `NetConfig` | Constants: STUN list, gathering timeout, channel name, loopback prefix, chunk size, ping period (1 s) and average window, liveness timeout (5 s). The cycle's command timeout belongs to the game. |
| `NetLink` | Abstract link: pairing in three calls with opaque signals (`createOffer`, `acceptOffer`, `acceptAnswer`), `send(message)` (a string or an `ArrayBuffer`; dropped, returning false, while the link is not open — the game loop never throws on a link that is dying, the close event follows), idempotent `close()` over a single transport hook, open / message / close events (`NetLink.CLOSED`, `NetLink.FAILED`). |
| `NetPeerLink` | `NetLink` over one `RTCPeerConnection`: address gathering with a short timeout (ended at once by a close, so a cancelled pairing never waits for it), a single data channel, reliable and ordered, carrying every message in the exact order it was sent — a `pause` or a `levelLoad` can never overtake or fall behind the states around it; the joining side answers as DTLS server (`setup:passive`). |
| `NetLoopbackLink` | `NetLink` over `BroadcastChannel`, between two tabs of one browser: development and automated tests without cameras. Never offered to players. |
| `NetSignalCodec` | Compacts a session description to the bytes the link needs (credentials, fingerprint, setup role, candidates — an address that is neither a plain IPv4, IPv6 nor mDNS name travels as a name) and rebuilds a valid description from them; every table index is checked both ways. |
| `NetPairingCode` | Envelope of a pairing code: application version first (given by `appBootstrap.getVersion()`, the aggregated version of the bootstrap stack) — so that a mismatch is always readable and refused with its explicit modal, whatever changed in the rest of the format —, kind (invite or answer), invite id, link signal, opaque application payload; to and from the QR byte string. |
| `NetMessageCodec` | Typed message envelope: JSON for control messages, binary payloads (`ArrayBuffer`) passed through untouched for stream messages; splitting and reassembly, as `chunk` binary messages (type byte `0xFF`, reserved), of a message larger than the chunk size. It knows no payload format beyond the type byte every binary message opens with: the binary codecs belong to the game. |
| `NetPingMeter` | Ping / pong control messages every second, rolling average per link, and the liveness timeout of the link, which can be suspended (a level build). |
| `NetPeer` | One connection seen from a session: its link, message codec and ping meter, and the single place that decides the link is lost (closed, failed, silent, invalid message — `reportInvalid(error)` for a message the game could not decode); `whenOpen()` settles once, open or lost. |
| `NetSession` | Base of the two sessions: the application version every code is checked against, the link factory (WebRTC in production, loopback in tests), the wiring of a new peer. |
| `NetHostSession` | Star session of the main: `createInvite(payload)` → code (the link registered before it gathers, so `cancelInvite` always reaches it), `acceptAnswer(code)` → peer (answer paired with its invite by id, a second answer refused), `cancelInvite`, `remove(peer)`, `broadcastControl` / `broadcastBinary`, peer events. |
| `NetGuestSession` | Session of a sub: `acceptInvite(code, payloadFor)` → answer code, `payloadFor(invitePayload)` building the answer's payload from the invite's — and throwing to refuse it (a WAD mismatch) before any answer exists —, one link to the main, events. |
| `NetPairing` | Base of the two pairing flows: the flow owns the order of the steps up to the open link; a caller-supplied view shows and reads the codes (`prepare`, `showCode`, `readCode`, `cancelRead`, `hideCode`, `finish`). One pairing at a time per flow, always finished, `cancel()` ending it with `NetError.CANCELLED` whatever the step. While reading, a code of another version ends the pairing with `NetError.VERSION_MISMATCH` (the explicit modal), any other unexpected code — another kind, an answer to a previous invite — is ignored and the reading goes on. `NetHostPairing.addPeer(payload)` adds one peer, `NetGuestPairing.join(payloadFor)` answers one invite; the game menus supply the same view as the test bench. |
| `NetLoopbackCodeChannel` | Hands pairing codes between tabs of one browser, in place of the QR code and the camera; its read is cancellable. |
| `QrModule` | `prepare(wasmUrl)` once for the page, zxing-wasm's `.wasm` redirected to the local copy; `ready()` for its users. |
| `QrEncoder` | Byte string → scalable QR SVG (zxing-wasm writer), error correction fixed at M. |
| `QrScanner` | Camera stream and decode loop (zxing-wasm reader): one camera request at a time, a stream arriving after a close stopped at once, 1280×720 asked and a decode width that adapts to the device. |
| `QrPairingView` | The pairing view over DOM elements the caller owns: code shown as a QR code, other side's code read with the camera, each caption (given translated by the caller) shown only while its step lasts, click to toggle fullscreen, camera released when the pairing is over (the next invite opens it again); with a loopback code channel instead of the camera. The game's pairing modal supplies its own elements and captions. |
| `CameraProbe` | Camera availability, for greying the multiplayer entries; it only settles once the page is visible, so nothing waits on it. |

All of them are declared in the doom `libBootstrap.json` once the game consumes them (mode 1); until then only the demos `_examples/pairing-test.html` and `_examples/pairing-game.html` declare them, through `_examples/assets/pairing.json`.

##### Network layer, Doom-specific (`js/doom/net/`)

| Class | Responsibility |
|---|---|
| `DoomNetProtocol` | Message type constants. |
| `DoomNetInvite` | Application payload of the codes: WAD SHA-256, mode (main → sub); nickname (sub → main). |
| `DoomNetLobby` | Lobby model held by the main and mirrored to the subs: players (id, slot, nickname, ping, role, syncing or in game), capacity from the profile. |
| `DoomNetHost` | Main side: once its render is done, waits until the command of every awaited sub for the next turn has arrived (only the command timeout, or the loss of the link, ends the wait), feeds them to `DoomSimulation`, encodes the turn state once and sends the same buffer at once to every awaited sub — to a sub that has just sent `levelReady` as well, which is how it joins; that sub is awaited from the next turn on. Holds the syncing / awaited state of every sub. |
| `DoomNetClient` | Sub side: on each turn state, applies it to the presentation, then samples and sends its command for the next turn at once, before the presentation renders; waits for the next state once the render is done. |
| `DoomNetStateCapture` | Main side: builds the logical `StateSnapshot` of a turn (plain data, no encoding) from the simulation, and gathers the turn's events. |
| `DoomNetStateCodec` | Logical `StateSnapshot` + turn events ↔ binary `ArrayBuffer`, through `DataView`. Pure encode / decode, nothing else, so it can be tested and inspected on its own. |
| `DoomNetCommandCodec` | `UserCommand` ↔ binary `ArrayBuffer`, through `DataView`. |
| `DoomNetEvents` | One-shot events of a turn, broadcast or targeted at one player: sounds, effects, decals, HUD messages — carried in the binary turn message. An event says what happens and where, never how it is perceived: a sound carries its name index, its origin (the id of the emitting entity, or a fixed position) and its logical channel, an effect its template and position; an event about an entity the same turn's state no longer holds (an exploding projectile, a picked-up item) carries a fixed position, never that entity's id; each sub computes volume, pan and pitch against its own listener, keeps an entity-bound sound following that entity's position in every new state, and animates effects locally. A mover's motion loop is no event: the sub starts and stops it itself from the mover's pose changing between states, so it can never keep playing or stay silent; only the one-shot start and stop sounds are events. Sounds without origin are targeted at one player and played at full volume. Pause, intermission, finale and level change are control messages. |
| `DoomNetEntityIds` | Stable numeric ids for everything the binary messages name, in **one** `Uint32` space per level, since a built monster and a body born in play share the same record type and the same id field: a built entity gets the index of its build code in a table every device builds identically (the level build is deterministic), a runtime-spawned entity (projectile, drop, spawned body) the next value of a counter the main starts past the table's size and never rewinds within the level, so a value never names two entities — a `Uint16` would wrap within a long fight; the names events carry (sounds, effect templates) are indexed the same way from tables every device holds. |
| `DoomReplicaApplier` | Writes a decoded state into the sub's level, on its own, without any previous state: creates the entities it lacks, removes those absent, updates the others — instance poses, bodies (position, facing, frame), projectiles, pickups, switches, surfaces, sector lights, the other players' bodies, and the camera, HUD, screen tint and weapon sprite of the player it views — then plays the turn's events, skipping those targeted at another player. |

##### Protocol

* **Invite code** (main → sub): app version (the two bootstrap versions: devices holding different cached versions are refused with an explicit modal), WAD SHA-256, mode, compact offer. The app version is the only compatibility check: two devices at the same version run the same network code, so the protocol carries no version of its own.
* **Answer code** (sub → main): app version, compact answer, nickname. Both codes carry the app version, since it heads the shared pairing envelope: the sub checks the main's, and the main the sub's.
* **Control messages** (JSON): `hello` / `welcome` (player id, slot, mode, options), `lobby` (player list and pings), `start`, `levelLoad` (level, skill, mode, thing filter, options — no player state: the first `state` brings it), `levelReady` (sub built the level), `waiting` (players the main is waiting for), `pause`, `intermission` (stats, frag table), `finale`, `playerRemoved` (to the other subs), `sessionEnd` (either side, with its reason: left, removed, lost link, invalid message, match over), `ping` / `pong`.
* **Stream messages** (binary):
  * `command` (sub → main), every turn, sent as soon as the previous `state` is applied and before rendering it: a `UserCommand` — turn number, axes, look angles, buttons, impulses — empty in screen sharing, where it only acknowledges the state it answers. Its turn number is there for a reason: the main drops a command whose turn is not the one it awaits, or that comes from a syncing sub — typically the answer to the last state sent before a `levelLoad`, still in flight — without treating it as an error. The turn number counts from the start of the session and never resets, level changes included;
  * `state` (main → sub), every turn: the self-contained `StateSnapshot` of the turn followed by its events.
  * Turns follow the display pace (up to 60 per second, see Synchronous cycle), not the 35 Hz of the Doom tics simulated inside each turn: that is the rate these two messages are sent at.
* **Encoding**: JSON for the control messages, rare and worth reading in a debugger; a simple binary format for the two stream messages, built on `ArrayBuffer` and `DataView` only, so that repetitive, well-defined structures are not stringified and parsed every turn. No library (no Protocol Buffers, MessagePack or FlatBuffers), no compression, no aggressive quantisation, no bit packing, fields in a fixed documented order. **Byte order: little-endian, for the whole binary protocol**, stated here once. Two traps follow from it: `DataView` reads and writes big-endian by default, so every multi-byte call of the codecs passes `littleEndian = true` explicitly (`setFloat32(offset, value, true)`) — a single call without it silently swaps its field; and TypedArrays follow the native byte order of the machine, not the protocol's, so multi-byte fields always go through `DataView`, never through a TypedArray view laid over the message buffer — today's devices being little-endian would only make such a view work by chance, not by contract. **Numeric types are chosen field by field**, never by a global rule: each field takes the smallest type that keeps exactly the precision it needs, without quantisation, the choice being checked against the real values of the engine when the codec is written. Expected outcome, from the engine's magnitudes:
  * `Float32` for positions, heights and mover poses — the world is in metres (64 Doom units = 1 m), a Doom map fits in ±32 768 units = ±512 m, where a `Float32` is precise to about 0.06 mm (0.004 unit), far below the smallest distance the game cares about (the monsters' 5 mm contact tolerance); a mover at rest has an offset of exactly 0, which `Float32` holds exactly, so no z-fighting with the static floor can appear;
  * `Float32` for angles (degrees, 0 to 360: about 0.00003°) and for intensities (light levels, flash intensities);
  * integers, never floats, for anything that grows without bound: `Uint32` for the turn number and for times in milliseconds (a `Float32` stops representing every integer beyond 16.7 million) — every time of the protocol is a duration relative to the game (the turn's time step, the level time, a power's remaining time), never an absolute timestamp: a `Date.now()` value does not fit a `Uint32` and has no place in a message; `Uint32` for entity ids (one space, see `DoomNetEntityIds`), `Uint16` for counts and table indices (kinds, sounds, templates), `Uint8` for enums and flags;
  * `Float64` only where the analysis of a field calls for it — none is expected today.
  * Float rounding on the sub stays harmless because the sub is passive: at worst a body standing exactly on a line between two sectors takes the light of its neighbour, never a gameplay difference.

  Priorities, in order: simplicity, robustness, sufficient performance, reasonable compactness. A `state` message is laid out as:

  ```text
  header
      message type
      turn number, elapsed time
      count of each section that follows
  players
      one fixed-size record per player
  bodies
      one fixed-size record per body (monster, corpse, barrel)
  projectiles
      one record per projectile in flight
  pickups
      ids of the map pickups still present, then one record per drop (id, kind, position)
  movers
      one record per mover instance (id, pose)
  switches, sector surfaces, sector lights
      one record per entry
  level stats
  events
      one record per event (type, target player, payload)
  ```

* **Debugging**: the logical structures (`UserCommand`, `StateSnapshot`) are plain data kept apart from their codecs; encoding and decoding are pure functions isolated in `DoomNetStateCodec` and `DoomNetCommandCodec`, so a decoded message can be dumped to the console as readable data, and an encode → decode round trip checked in tests (loopback tabs included), which also measures the largest error of every float field.
  * **Order of application on a sub**, fixed: decode the whole message, apply the snapshot, then play the events, then render. An event may thus name an entity the same state has just created, and it never runs against a replica that lags its state.
  * **Fail-fast decoding**, with no validation layer: a message is decoded **completely** into its logical structure before anything is applied, so `DoomReplicaApplier` (or the simulation, for a command) only ever receives a fully decoded object and a replica is never left half-updated; the decoder checks the structure, not the content — the message type is known, and the read offset ends exactly on `byteLength`, which, records being fixed-size, catches nearly every wrong count; a read past the end already throws in `DataView`. Any failure is an error logged with the message type, the turn and the size, and ends the session of that link: an invalid state on a sub ends its session (back to the WAD menu with an error modal), an invalid command on the main removes that sub while the game goes on for the others. No further abstraction.
* **One channel**: control and stream messages share the single data channel; a data channel carries both strings and `ArrayBuffer`s, so the type of what arrives tells a JSON control message from a binary one, whose first byte is its message type (`command`, `state`, `chunk`) — no envelope around it. A chunk adds only the id, index and count of the message it carries a piece of. The compact signal carries no `max-message-size`, so both sides work under the 64 KiB default of RFC 8841, and only a state above that size is chunked — none is expected from the estimated sizes (see Risks). Several channels would add neither bandwidth nor latency (they share one connection, and one JavaScript thread handles them), and would lose the ordering between the two families.
* **Reliability**: the channel is reliable and ordered — the synchronous cycle needs every command and every turn, and packet loss is rare on a local network; a lost packet is retransmitted by the channel itself, at the cost of a brief hitch.
* **Level change**: the main sends `levelLoad` and starts at once, or holds its start when the rules say so (deathmatch, see Entering the cycle); each sub builds the level at its own pace, sends `levelReady`, and enters the turn cycle with the next state, awaited from the following turn (see Entering the cycle) — the join path, so a slow device never holds the others during the build.
* **Security**: WebRTC encrypts every channel (DTLS), and the certificate fingerprint travels in the scanned code, so the pairing is authenticated by the scan itself.

##### Menus and UI (`js/doom/menu/`)

* `MenuTextEntryModal` and `MenuVirtualKeyboard`, with the grid mode of `MenuListNavigation`.
* `MultiplayerScreen` (WAD menu entry), `MenuGameSettingsModal` (the game settings of the launched mode, over the settings page builder), `MenuLobbyModal`, `MenuPairingModal` (shows the invite QR, scans the answer, and the reverse on a sub).
* New pause menu entries per mode and role; the respawn prompt replacing the death modal outside single-player; the deathmatch frag table in the tally modal.
* The `text` setting type in `DoomSettings`, the Multiplayer options section and its shortcut, `CameraProbe`-driven greying.
* `HudGameBar` fps readout with the ping, frag counter in place of kills and secrets in deathmatch, and the messages shown over the game on a sub or during a wait: "Waiting for {nickname}…", "Paused by the main", "The main is dead".

##### Testing

* No test framework exists: tests run through Playwright in the browser.
* `NetLoopbackLink` lets two tabs of one browser play main and sub without cameras, so every mode can be driven automatically on one machine. It proves the protocol and the game logic, never the network's timing: latency, jitter, retransmissions, real fragmentation and mobile backgrounding only show on the device matrix.
* Chunking is tested on purpose, a state under the limit and one forced above it, split, reassembled and applied, on every browser of the matrix: the chunk size stays a prudent constant of the transport, never a value inferred from what one browser happened to accept.
* A manual device matrix for what only real devices show: pairing by camera, mDNS resolution, iOS backgrounding, Wi-Fi jitter, 4G / 5G through STUN.

##### Risks

* mDNS `.local` candidates not resolved by some routers or Android devices (checked first, by the prototype).
* Carrier NATs defeating STUN, with no TURN relay: an explicit failure message. **Confirmed** on the bench: a sub on 4G behind a symmetric carrier NAT (its STUN mapping changes the port) and a main with no IPv6 behind a corporate firewall have no path to each other, and both sides fail after the ICE timeout (about 20 s); a shared hotspot is the workaround.
* iOS Safari dropping the link when the screen locks or the app goes to the background: **confirmed** on `pairing-game.html`, the link is cut and the sub has to pair again. The hardening step owns the answer (a rejoin path), not the transport.
* The slowest device setting everyone's frame rate (measured on the device matrix).
* Size and encoding cost of the per-turn state on large maps with many bodies, sent whole every turn. Order of magnitude, to be measured early: a body record weighs about 25 bytes, so a level holding 300 bodies gives a state near 10 KB, that is about 5 Mbit/s per sub at 60 turns per second — comfortable on a Wi-Fi with three subs, tight on a 4G uplink. The levers, in order: an optional cap on the turn rate — around 35 turns per second would be natural, a faster turn mostly repeating the same tic's world, but it is a network and render throttle, not a return of the simulation to a fixed step —, then deltas, only if the measurements call for them. The cost is not the bandwidth alone: the profiling measures each stage on its own — `DoomNetStateCapture`, `DoomNetStateCodec` encode, message size, decode, `DoomReplicaApplier` —, since walking every collection of the main to capture the state, and every id of the replica to apply it, may weigh more than the bytes on a slow phone.
* The ICE window of the pairing: the sub's connectivity checks fail after a browser-dependent delay if the main has not scanned its answer by then (measured by the prototype).
* Main performance with four players and per-turn encoding (out of scope for now, measured anyway).

#### Step plan

Each step ships on its own, keeps solo intact, updates the README and bumps the relevant `libBootstrap.json` versions.

0. **Device matrix on the test bench**: the network layer is written (`webapp/net`, `webapp/qr`) and exercised by `_examples/pairing-test.html` — several subs, loopback between tabs, chunked bursts — and by `_examples/pairing-game.html`, the van demo run through the synchronous cycle — a binary state every turn to every sub, an empty command back from each, the next turn only once every command is in — which measures the real turn rate with one to three subs, the perceived smoothness on a sub and the mobile backgrounding on real devices. PC (Firefox) and iPhone (Safari) already pair both ways, on a shared Wi-Fi and over 4G (direct IPv6), with real host addresses once the camera is open, and a PC webcam reads a code shown on a phone at 1280×720; the one-way state stream holds 60 states per second on the sub. Measured too: a sub on 4G behind a symmetric carrier NAT against a main without IPv6 behind a corporate firewall fails after the ICE timeout, as expected without TURN (see Risks). Still to run: Android (Chrome), a tablet, and two different browsers as subs of one main; ping, QR size, scan speed, ICE window and host addresses measured on each.
1. **Nickname and options** (done): `text` setting type, text entry modal, virtual keyboard, grid navigation, Multiplayer options section (nickname, friendly fire, deathmatch settings) and its translations.
2. **WAD identity** (done): SHA-256 at import, computed on first use for older WADs — the first opening of the WAD's menu —, and shown shortened in the WAD list.
3. **Commands** (done): `UserCommand`, `InputCommandSampler`; `World` and `DoomGame` consume commands.
4. **Simulation / presentation split**: `DoomSimulation`, `DoomPresentation`, `DoomPlayer`, `DoomPlayerRoster`, `DoomSinglePlayerRules`.
5. **Several players in the engine and systems**: multi-user `World`, `Instance` trigger split with activator, per-user collision state, monsters / damage / traces / interactions / sounds over the roster, deterministic mace spot. Verified with a local second player driven by a scripted command.
6. **Mode 1, screen sharing**: pairing and lobby modals, pause menu entries, invite / answer codes, version and WAD checks, state and command binary codecs with fail-fast decoding, per-turn states and events (joining included, with the syncing / awaited switch), waiting message, sub presentation, level change follow-up, pause, save and load, stop / leave / lost link, ping in the fps readout.
7. **Mode 2, drop-in cooperative**: the game settings screen before the lobby, player bodies and colours, real commands upstream (screen sharing's are empty), cooperative rules (spawns, respawn prompt, weapon and keys stay, friendly fire), per-player HUD events, cooperative save and load, level change for every player.
8. **Mode 3, new multiplayer game**: Multiplayer screen and Join a game, the game settings screen for both modes, cooperative from the start (`MTF_NOT_SINGLE` things), deathmatch rules (starts, no keys, frags, variants, limits, 30 s item respawn), frag table intermission, match end.
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
