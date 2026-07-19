/**
 * Conversion orchestrator: builds a complete engine world in memory from a
 * parsed WAD file and a level name — textures (ImageData), map object,
 * door/lift/switch objects + instances, interactions, world + user.
 *
 * Everything is registered through the loadFromData methods of the engine
 * loaders; the caller is responsible for loader.reset() / beginBatch() /
 * setCallback() / endBatch() around build().
 */
class WadWorldBuilder {
    /**
     * @param {WadFile} wadFile
     * @param {string}  levelName
     * @param {object}  options - {onLevelExit: function, thingCatalog: object, skill: number, game: DoomGame}
     *                  onLevelExit is wired on the exit switches; thingCatalog
     *                  (DoomGame) maps THING types to world sprites/pickups; skill
     *                  (1..5, default 3) drives the single-player thing filtering;
     *                  game receives the level stats (secrets) and pickups.
     */
    constructor(wadFile, levelName, options = null) {
        options = options ?? {};

        this._wadFile      = wadFile;
        this._levelName    = levelName;
        this._onLevelExit  = options.onLevelExit ?? null;
        this._thingCatalog = options.thingCatalog ?? null;
        this._skill        = options.skill ?? 3;
        this._game         = options.game ?? null;
    }

    /**
     * Async only to yield to the browser between the heavy phases, so the
     * loading modal stays painted. The engine registration itself is synchronous.
     */
    async build() {
        const palette  = new WadPalette(this._wadFile);
        const bank     = new WadTextureBank(this._wadFile, palette).init();
        const animBank = new WadAnimationBank(this._wadFile, bank).init();

        const level    = new WadLevelParser(this._wadFile, this._levelName).parse();
        const analysis = new WadMapAnalyzer(level).analyze();
        // Sector polygons computed once (reused by the spawn + every thing)
        this._level       = level;
        this._sectorPolys = this._buildSectorPolyCache(level);
        await this._yield();

        // Static map
        const mapData = new WadStaticMapBuilder(level, analysis, bank, animBank).build();
        loader.objects().loadFromData('map', WadMeshBuilder.toLoaderData(mapData.textures, mapData.mesh, bank));
        await this._yield();

        // Doors
        const doors = new WadDoorBuilder(level, analysis, bank, animBank).buildAll();
        const builtDoorCodes = new Set();
        for (const door of doors) {
            this._registerInstance(door, bank);
            builtDoorCodes.add(door.code);
            this._applyKeyGuard(door);
            this._applyGunSideGuard(door, level);
        }
        await this._yield();

        // Lifts
        const lifts = new WadLiftBuilder(level, analysis, bank, animBank).buildAll();
        const builtLiftCodes = new Set();
        for (const lift of lifts) {
            this._registerInstance(lift, bank);
            builtLiftCodes.add(lift.code);
        }

        // Rising floors (walk-over floor raises, e.g. special 58)
        const risingFloors = new WadRisingFloorBuilder(level, analysis, bank, animBank).buildAll();
        const builtRisingCodes = new Set();
        for (const floor of risingFloors) {
            this._registerInstance(floor, bank);
            builtRisingCodes.add(floor.code);
        }

        // Stairs (build-stairs 7/8/100/127): one one-way rising step per sector,
        // start()ed together by their switch (7/127) or walk-zone (8/100)
        const stairs = new WadStairBuilder(level, analysis, bank, animBank).buildAll();
        const builtStairCodes = new Set();
        for (const step of stairs) {
            this._registerInstance(step, bank);
            builtStairCodes.add(step.code);
        }

        // Switches + interactions
        const switches = new WadSwitchBuilder(
            level, analysis, bank, builtLiftCodes, builtDoorCodes, builtStairCodes, builtRisingCodes).buildAll();
        for (const sw of switches) {
            this._registerInstance(sw, bank);
            this._applyKeyGuard(sw);
            const spec = sw.interactionSpec;
            const interaction = new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff, spec.reverseTargets, spec.doorVariant, spec.restIndex, spec.swapIndex);
            if (spec.remoteSwap) {
                interaction.setRemoteSwap(spec.remoteSwap);
            }
            if (spec.isExit && this._onLevelExit !== null) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }
        await this._yield();

        // Walk triggers (W1/WR lines that activate a remote tagged element by
        // being crossed — invisible proximity zones that start() their targets)
        const walkTriggers = new WadWalkTriggerBuilder(
            level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes).buildAll();
        for (const wt of walkTriggers) {
            this._registerInstance(wt, bank);
            const spec = wt.interactionSpec;
            const interaction = new DoomWalkTriggerInteraction(spec.code, spec.targets, spec.reverseTargets, spec.stop, spec.doorVariant);
            if (spec.isExit && this._onLevelExit !== null) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }

        // Gun (impact) triggers (G1/GR lines 24/46/47): no zone — the weapon
        // hitscan tests every shot trace against these segments at fire time
        // (P_ShootSpecialLine) and start()s the tagged movers.
        if (this._game !== null) {
            const gunLines = new WadGunTriggerBuilder(
                level, analysis, builtRisingCodes, builtDoorCodes).buildAll();
            this._game.setGunTriggers(new DoomGunTriggers(gunLines));
        }

        // Teleporters (walk-over → landing thing type 14 of the same tag)
        const landings = this._buildTeleportLandings(level);
        const teleporters = new WadTeleportBuilder(level, analysis, landings).buildAll();
        for (const tp of teleporters) {
            this._registerInstance(tp, bank);
            loader.interactions().loadFromData(
                new DoomTeleportInteraction(tp.interactionSpec.code, tp.interactionSpec.destination));
        }
        await this._yield();

        // Sector damage (sector specials 4/5/7/16/11): one per-level interaction
        // polling the player's sector every 32-tic window. The "+change" target
        // sectors are included too (their special mutates at runtime); a lift's
        // zone sits at the ORIGINAL floor (the platform rests up, the static fh
        // is patched down).
        const damageZones = this._sectorPolys
            .filter((s) => (WadConstants.SECTOR_DAMAGE_BY_SPECIAL[s.special] !== undefined)
                || (analysis.floorChange[s.si] !== undefined))
            .map((s) => ({
                si:      s.si,
                outers:  s.outers,
                floorY:  (analysis.liftOriginalFh[s.si] ?? s.fh) * WadConstants.SCALE,
                special: s.special
            }));
        let damageInteraction = null;
        if (damageZones.length > 0) {
            damageInteraction = new DoomSectorDamageInteraction(damageZones, this._onLevelExit);
            loader.interactions().loadFromData(damageInteraction);
        }

        // Dynamic sector lights (sector specials 1/2/3/4/8/12/13/17): one
        // per-level interaction stepping the vanilla p_lights.c thinkers and
        // driving the lightGroup factors of the static map faces.
        let lightInteraction = null;
        if (analysis.lightSectors.length > 0) {
            lightInteraction = new DoomSectorLightInteraction(analysis.lightSectors);
            loader.interactions().loadFromData(lightInteraction);
        }

        // Secret sectors (special 9): the level total is a game stat, each
        // secret is credited once when the player stands on its floor.
        const secretZones = this._sectorPolys
            .filter((s) => (s.special === WadConstants.SECTOR_SECRET_SPECIAL))
            .map((s) => ({
                si:     s.si,
                outers: s.outers,
                floorY: (analysis.liftOriginalFh[s.si] ?? s.fh) * WadConstants.SCALE
            }));
        if (this._game !== null) {
            this._game.setSecretsTotal(secretZones.length);
            if (secretZones.length > 0) {
                loader.interactions().loadFromData(new DoomSecretInteraction(secretZones, this._game));
            }
            // Hand over the sector-light lookup (else the poly cache is dropped);
            // used to shade the weapon view sprite by the player's sector, pulsing
            // with the sector's light effect via the interaction's live factor.
            this._game.setSectorLight(new DoomSectorLight(this._sectorPolys, lightInteraction));
        }

        // "+change" floors: swap the moving top-flat texture (and the sector's
        // damage special) when the movement starts or completes.
        this._wireFloorChanges(analysis, animBank, builtLiftCodes, builtRisingCodes, damageInteraction);

        // Things (decorations + pickups) as billboard sprites
        const builtFloorCodes = new Set([...builtLiftCodes, ...builtRisingCodes, ...builtStairCodes]);
        const things = this._registerThings(level, palette, analysis, builtFloorCodes);
        await this._yield();

        // World + user
        loader.world().loadFromData(this._buildDefinition(level, bank));

        console.log('WadWorldBuilder - ' + this._levelName + ': '
            + bank.count() + ' textures, ' + doors.length + ' doors, '
            + lifts.length + ' lifts, ' + risingFloors.length + ' rising, '
            + stairs.length + ' stairs, '
            + switches.length + ' switches, ' + walkTriggers.length + ' walk-triggers, '
            + teleporters.length + ' teleporters, '
            + things.count + ' things (' + things.skipped + ' skipped, '
            + things.filtered + ' filtered, skill ' + this._skill + ')');
    }

    // --- Internal ---

    // Build the world things from the THINGS lump: one shared Billboard Object3d
    // per sprite (deduplicated), one Instance per occurrence. No-op without a
    // thing catalog. Solid decorations get a Doom-style square 'box' collider;
    // the rest (pickups, gore, pools…) are non-blocking ('none'). Pickups get a
    // proximity trigger + a DoomPickupInteraction that applies the effect and
    // despawns the sprite when picked up.
    _registerThings(level, palette, analysis, builtFloorCodes) {
        if (this._thingCatalog === null) {
            return {count: 0, skipped: 0, filtered: 0};
        }

        const spriteBank = new WadSpriteBank(this._wadFile, palette).init();
        const builder = new WadThingBuilder(
            level,
            this._thingCatalog,
            spriteBank,
            (x, y) => this._findSector(x, y),
            this._skill
        );
        const things = builder.buildAll();

        const billboardIds = {};
        for (let i = 0; i < things.length; i++) {
            const t = things[i];
            // Dedup the shared Object3d per (sprite, sector light, light group):
            // the sector brightness is baked into the billboard colour, so the
            // same sprite in differently-lit sectors needs distinct objects — and
            // a sprite in a light-effect sector needs its own object too, so the
            // dynamic group factor does not spill onto its twins elsewhere.
            const lightGroup = WadMapAnalyzer.lightGroupOf(analysis, t.si);
            const objKey     = t.key + '|' + t.light + '|' + lightGroup;
            if (billboardIds[objKey] === undefined) {
                billboardIds[objKey] = loader.objects().loadBillboardFromData(null, {
                    billboard:     true,
                    textures:      t.texIds,
                    animDuration:  t.animDuration,
                    halfWidth:     t.halfWidth,
                    height:        t.height,
                    anchorOffsetX: t.anchorOffsetX,
                    anchorOffsetY: t.anchorOffsetY,
                    anchorTop:     t.anchorTop,
                    light:         t.light,
                    lightGroup:    lightGroup
                });
            }
            const isPickup = (t.kind === 'pickup');
            const code     = ((isPickup) ? 'pickup_' + i : 'thing_' + i);
            // A thing standing on a moving floor spawns at the floor's ORIGINAL
            // height (the sector fh was patched to the low position for the
            // static map) and rides the floor instance (vanilla: things follow
            // their sector floor — a chainsaw on a donut pillar rides it down).
            const ride = this._resolveThingFloor(t, analysis, builtFloorCodes);
            const position = [t.position[0], t.position[1] + ride.liftY, t.position[2]];
            loader.instances().loadFromData(null, {
                code:              code,
                object:            billboardIds[objKey],
                position:          position,
                rotation:          [0, 0, 0],
                trigger:           ((isPickup) ? 'proximity' : 'none'),
                loop:              false,
                // Not onlyOnce: an un-consumed pickup (full health, owned weapon)
                // must stay grabbable when the player returns — it re-tests every
                // frame it is overlapped (like Doom's P_TouchSpecialThing) and is
                // despawned only once actually consumed.
                onlyOnce:          false,
                collisionShape:    ((t.solid) ? 'box' : 'none'),
                collisionRadius:   t.radius,
                interactionRadius: ((isPickup) ? WadConstants.PICKUP_RADIUS : null),
                interaction:       ((isPickup) ? code : null),
                keyframes:         []
            });
            if (ride.floorCode !== null) {
                loader.instances().getByCode(code).setRideOn(loader.instances().getByCode(ride.floorCode));
            }
            // A pickup with no game (catalog-less build) keeps the sprite but
            // never fires — harmless. With a game, wire its effect interaction.
            if (isPickup && (this._game !== null)) {
                loader.interactions().loadFromData(new DoomPickupInteraction(code, t.effect, this._game));
            }
        }

        return {count: things.length, skipped: builder.getSkipped(), filtered: builder.getFiltered()};
    }

    // Moving floor under a thing: the built lift / rising-floor / stair
    // instance of the thing's sector, plus the Y shift back to the ORIGINAL
    // floor height for the lowered lifts (their sector fh is patched down for
    // the static map, but the platform RESTS at its original height). The
    // thing then rides that instance (setRideOn). Static-box collisions of
    // solid decorations do not follow (known limitation, pickups are 'none').
    _resolveThingFloor(t, analysis, builtFloorCodes) {
        const SCALE = WadConstants.SCALE;
        const sec = this._findSector(t.position[0] / SCALE, t.position[2] / SCALE);
        if (sec === null) {
            return {floorCode: null, liftY: 0};
        }
        for (const prefix of ['lift_', 'risingfloor_', 'stair_']) {
            const floorCode = prefix + sec.si;
            if (!builtFloorCodes.has(floorCode)) {
                continue;
            }
            const originalFh = analysis.liftOriginalFh[sec.si];
            const liftY = ((originalFh !== undefined)
                ? (originalFh - this._level.sectors[sec.si].fh) * SCALE
                : 0);
            return {floorCode: floorCode, liftY: liftY};
        }

        return {floorCode: null, liftY: 0};
    }

    // Attach the "+change" effect to each moving floor instance: at start
    // (raise variants) or at completion (lowerAndChange), the top-flat faces
    // swap to the new flat and the sector's damage zone takes the new special
    // at the destination height. Both flats are handled as full ANIMATION
    // sequences: the old faces may carry any frame (and their animTextures
    // override the texture id at render time), and the destination stays
    // animated when it is a sequence itself. Riser faces are untouched (wall
    // textures live in a different bank — their ids never match the flat's).
    _wireFloorChanges(analysis, animBank, builtLiftCodes, builtRisingCodes, damageInteraction) {
        const SCALE = WadConstants.SCALE;
        for (const key of Object.keys(analysis.floorChange)) {
            const si     = parseInt(key, 10);
            const change = analysis.floorChange[key];
            const code = ((builtRisingCodes.has('risingfloor_' + si)) ? ('risingfloor_' + si)
                : ((builtLiftCodes.has('lift_' + si)) ? ('lift_' + si) : null));
            if (code === null) {
                continue;
            }
            const oldSeq = animBank.flatSequenceLoaderIds(this._level.sectors[si].ft);
            const newSeq = animBank.flatSequenceLoaderIds(change.flatName);
            if (oldSeq.ids.length === 0 || newSeq.ids.length === 0) {
                continue;
            }
            const newAnim = ((newSeq.ids.length > 1)
                ? {ids: newSeq.ids, duration: newSeq.duration, durationMs: Math.round(newSeq.duration * 1000)}
                : null);
            const targetFh = analysis.risingFloorTargetFh[si] ?? analysis.liftMinAdjFh[si];
            const inst  = loader.instances().getByCode(code);
            const apply = () => {
                inst.getObject().faceList.forEach((fc) => {
                    const animated = (fc.animTextures !== null && fc.animTextures !== undefined
                        && fc.animTextures.ids.some((id) => oldSeq.ids.includes(id)));
                    if (animated || oldSeq.ids.includes(fc.textureId)) {
                        fc.textureId    = newSeq.ids[0];
                        fc.animTextures = newAnim;
                    }
                });
                if ((change.special !== null) && (damageInteraction !== null)) {
                    damageInteraction.setSectorSpecial(si, change.special, targetFh * SCALE);
                }
            };
            if (change.at === 'complete') {
                inst.setOnComplete(apply);
            } else {
                inst.setOnStart(apply);
            }
        }
    }

    _registerInstance(built, bank) {
        const objectId = loader.objects().loadFromData(
            null,
            WadMeshBuilder.toLoaderData(built.textures, built.mesh, bank)
        );
        loader.instances().loadFromData(null, {...built.instanceData, object: objectId});
    }

    // Locked elements (DR/D1 key doors, locked-blaze switches 99/133-137) only
    // fire if the player holds the key: the engine calls this opaque predicate
    // before the trigger (the runtime user is a DoomUser), like vanilla
    // EV_DoLockedDoor checking the keys at USE time.
    _applyKeyGuard(built) {
        const keyCode = built.instanceData.keyRequired;
        if (keyCode) {
            loader.instances().getByCode(built.code).setTriggerCondition((user) => user.hasItem(keyCode));
        }
    }

    // A door carrying BOTH a gun face (46) and a manual face (1) — E1M2's
    // shootable door is usable from its corridor side only — must not open on
    // USE from the gun side: vanilla P_UseSpecialLine ignores the impact
    // specials. The engine's USE is a radius around the whole door body, so
    // the guard compares the player's distance to the two face sets (the key
    // guard, when present, is folded into the same predicate).
    _applyGunSideGuard(built, level) {
        if (built.instanceData.trigger !== 'action') {
            return;
        }
        const si = Number(built.code.split('_')[1]);
        const gunFaces = [];
        const useFaces = [];
        for (const ld of level.linedefs) {
            const touches = ((ld.right >= 0 && level.sidedefs[ld.right].sector === si)
                || (ld.left >= 0 && level.sidedefs[ld.left].sector === si));
            if (!touches) {
                continue;
            }
            const [dx1, dy1] = level.vertexes[ld.v1];
            const [dx2, dy2] = level.vertexes[ld.v2];
            const [x1, z1] = WadGeometry.doomToWorld(dx1, dy1);
            const [x2, z2] = WadGeometry.doomToWorld(dx2, dy2);
            if (WadConstants.GUN_SPECIALS.has(ld.special)) {
                gunFaces.push([x1, z1, x2, z2]);
            }
            if (WadConstants.DOOR_BY_SPECIAL[ld.special]?.trigger === 'action') {
                useFaces.push([x1, z1, x2, z2]);
            }
        }
        if (gunFaces.length === 0 || useFaces.length === 0) {
            return;
        }

        const minDistSq = (user, faces) => Math.min(...faces.map(
            (f) => WadGeometry.pointSegmentDistSq(user.x, user.z, f[0], f[1], f[2], f[3])));
        const keyCode = built.instanceData.keyRequired;
        const sideOk  = (user) => (minDistSq(user, useFaces) <= minDistSq(user, gunFaces));
        const guard   = ((keyCode) ? ((user) => (user.hasItem(keyCode) && sideOk(user))) : sideOk);

        loader.instances().getByCode(built.code).setTriggerCondition(guard);
    }

    _buildDefinition(level, bank) {
        const spawn = this._computeSpawn(level);
        const defaults = WadConstants.USER_DEFAULTS;

        // Sky texture (SKYx by episode/map). Decoded as a wall texture; null if
        // the WAD lacks it → renderer falls back to the solid background.
        // The sky's "cap" colour (average of its top row) doubles as the scene
        // background: in WebGL the sky quad draws only the textured band and
        // discards above/below (the clear colour shows through); in the CPU full
        // renderer the sky holes already show the background — so a sky-coloured
        // background gives a solid sky there for free, without a sky pass.
        const skyIdx = bank.ensureSkyTex(WadConstants.skyNameForLevel(this._levelName));
        let sky = null;
        let background = WadConstants.DEFAULT_BACKGROUND;
        if (skyIdx >= 0) {
            const loaderId = bank.getLoaderId(skyIdx);
            sky = {loaderId: loaderId, wrap: WadConstants.SKY_WRAP};
            background = this._skyCapColor(loaderId);
        }

        return {
            user: {
                position:        [spawn.x, spawn.y, spawn.z],
                yaw:             spawn.yaw,
                pitch:           0,
                maxEnergy:       defaults.maxEnergy,
                height:          WadConstants.PLAYER_HEIGHT,
                eyeRatio:        defaults.eyeRatio,
                radius:          defaults.radius,
                gravity:         defaults.gravity,
                maxJumpVelocity: defaults.maxJumpVelocity,
                maxSlopeAngle:   defaults.maxSlopeAngle,
                moveSpeed:       defaults.moveSpeed,
                stepHeight:      defaults.stepHeight,
                voidKillY:       defaults.voidKillY
            },
            background: background,
            sky: sky,
            lights: {
                ambient: WadConstants.DEFAULT_AMBIENT,
                sources: []
            }
        };
    }

    // Solid "cap" colour used as the scene background (shows above/below the sky
    // band and in the CPU full renderer's sky holes). Vanilla Doom has no such
    // field — derive it like modern ports from the average of the sky texture's
    // top row, so the seam with the sky top is smooth.
    _skyCapColor(loaderId) {
        const tex = loader.textures().get(loaderId);
        const d = tex.data;
        const w = tex.width;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let x = 0; x < w; x++) {
            const p = 4 * x;   // row 0 (top of the image)
            r += d[p];
            g += d[p + 1];
            b += d[p + 2];
        }

        return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    }

    /**
     * Player spawn from the THINGS lump (type 1 = Player 1 start).
     * Doom angle 0 = east, 90 = north; engine yaw 0 = north (+Z), 90 = east (+X).
     * The spawn Y is the floor height of the spawn sector + a small snap margin
     * (the fixed 0.3 of the Python script only worked for floors near 0).
     */
    _computeSpawn(level) {
        const player1 = level.things.find((t) => t.type === 1);
        if (player1 === undefined) {
            return {x: -6.5, y: 0.3, z: 4.0, yaw: 90};
        }

        const sect    = this._findSector(player1.x, player1.y);
        const floorFh = ((sect !== null) ? sect.fh : 0);

        return {
            x:   player1.x * WadConstants.SCALE,
            y:   floorFh * WadConstants.SCALE + 0.3,
            z:   player1.y * WadConstants.SCALE,
            yaw: ((90 - player1.angle) % 360 + 360) % 360
        };
    }

    // Teleport landings: every thing type 14, mapped by the tag of the sector
    // that contains it, to a world-space destination {x, y, z, yaw}. The y is
    // the landing floor + a snap margin (the interaction snaps to the floor).
    _buildTeleportLandings(level) {
        const SCALE = WadConstants.SCALE;
        const landings = {};
        for (const t of level.things) {
            if (t.type !== WadConstants.TELEPORT_LANDING_THING) {
                continue;
            }
            const sec = this._findSector(t.x, t.y);
            if ((sec === null) || (sec.tag === 0)) {
                continue;
            }
            landings[sec.tag] = {
                x:   t.x * SCALE,
                y:   sec.fh * SCALE + 0.3,
                z:   t.y * SCALE,
                yaw: ((90 - t.angle) % 360 + 360) % 360
            };
        }
        return landings;
    }

    // Precompute every sector's outer polygons + floor/ceiling/light once, so
    // _findSector is a cheap point test per thing instead of rebuilding polygons.
    _buildSectorPolyCache(level) {
        const {vertexes, linedefs, sidedefs, sectors} = level;
        const cache = [];
        for (let si = 0; si < sectors.length; si++) {
            const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
            if (chains.length === 0) {
                continue;
            }
            const {outers} = WadSectorPolygons.splitOutersAndHoles(chains, vertexes);
            if (outers.length === 0) {
                continue;
            }
            cache.push({si: si, fh: sectors[si].fh, ch: sectors[si].ch, light: sectors[si].light, tag: sectors[si].tag, special: sectors[si].special, outers: outers});
        }
        return cache;
    }

    // Find the sector at a point: smallest containing outer polygon (nested
    // sectors). If none contains it (point on a boundary / imperfect polygon),
    // fall back to the nearest sector within THING_SECTOR_MAX_DIST; beyond that
    // return null so the caller drops the thing rather than mis-placing it.
    // Returns {si, fh, ch, light, tag} (Doom units) or null.
    _findSector(doomX, doomY) {
        let bestArea  = null;
        let contained = null;
        for (const sec of this._sectorPolys) {
            for (const outer of sec.outers) {
                if (!WadGeometry.pointInPolygon2d(doomX, doomY, outer)) {
                    continue;
                }
                const area = Math.abs(WadGeometry.polygonAreaSign(outer));
                if (bestArea === null || area < bestArea) {
                    bestArea  = area;
                    contained = sec;
                }
            }
        }
        if (contained !== null) {
            return {si: contained.si, fh: contained.fh, ch: contained.ch, light: contained.light, tag: contained.tag};
        }

        return this._nearestSideSector(doomX, doomY);
    }

    // Fallback when no polygon contains the point: nearest linedef, then the
    // sector on the side the point lies (front/back sidedef per cross product).
    // Beyond THING_SECTOR_MAX_DIST, or with no facing sector → null.
    _nearestSideSector(doomX, doomY) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        let bestDist = Infinity;
        let bestLd   = null;
        for (const ld of linedefs) {
            const a = vertexes[ld.v1];
            const b = vertexes[ld.v2];
            const d = WadGeometry.distanceToSegment(doomX, doomY, a[0], a[1], b[0], b[1]);
            if (d < bestDist) {
                bestDist = d;
                bestLd   = ld;
            }
        }
        if ((bestLd === null) || (bestDist > WadConstants.THING_SECTOR_MAX_DIST)) {
            return null;
        }

        const a = vertexes[bestLd.v1];
        const b = vertexes[bestLd.v2];
        // cross < 0 → point on the right side of v1→v2 (Doom front/right sidedef).
        // Prefer the sidedef facing the point; fall back to the other side.
        const side = WadGeometry.cross2d(a, b, [doomX, doomY]);
        const near = ((side < 0) ? bestLd.right : bestLd.left);
        const far  = ((side < 0) ? bestLd.left : bestLd.right);
        const sdIdx = ((near >= 0) ? near : far);
        if (sdIdx < 0) {
            return null;
        }
        const secIdx = sidedefs[sdIdx].sector;
        const sec = sectors[secIdx];
        return {si: secIdx, fh: sec.fh, ch: sec.ch, light: sec.light, tag: sec.tag};
    }

    _yield() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}
