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
     * @param {object}  options - {onLevelExit: function, thingCatalog: object, skill: number}
     *                  onLevelExit is wired on the exit switches; thingCatalog
     *                  (DoomGame) maps THING types to world sprites/pickups; skill
     *                  (1..5, default 3) drives the single-player thing filtering.
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
            // Locked doors only open if the player holds the key. The engine
            // calls this opaque predicate before firing the trigger; the Doom
            // key check lives here (the runtime user is a DoomUser).
            const keyCode = door.instanceData.keyRequired;
            if (keyCode) {
                loader.instances().getByCode(door.code).setTriggerCondition(user => user.hasItem(keyCode));
            }
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
            level, analysis, bank, builtLiftCodes, builtDoorCodes, builtStairCodes).buildAll();
        for (const sw of switches) {
            this._registerInstance(sw, bank);
            const spec = sw.interactionSpec;
            const interaction = new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff);
            if (spec.isExit && this._onLevelExit !== null) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }
        await this._yield();

        // Walk triggers (W1/WR lines that activate a remote tagged element by
        // being crossed — invisible proximity zones that start() their targets)
        const walkTriggers = new WadWalkTriggerBuilder(
            level, analysis, bank, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes).buildAll();
        for (const wt of walkTriggers) {
            this._registerInstance(wt, bank);
            const spec = wt.interactionSpec;
            const interaction = new DoomWalkTriggerInteraction(spec.code, spec.targets);
            if (spec.isExit && this._onLevelExit !== null) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }

        // Teleporters (walk-over → landing thing type 14 of the same tag)
        const landings = this._buildTeleportLandings(level);
        const teleporters = new WadTeleportBuilder(level, analysis, bank, landings).buildAll();
        for (const tp of teleporters) {
            this._registerInstance(tp, bank);
            loader.interactions().loadFromData(
                new DoomTeleportInteraction(tp.interactionSpec.code, tp.interactionSpec.destination));
        }
        await this._yield();

        // Things (decorations + pickups) as billboard sprites
        const things = this._registerThings(level, palette);
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
    _registerThings(level, palette) {
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
            // Dedup the shared Object3d per (sprite, sector light): the sector
            // brightness is baked into the billboard colour, so the same sprite
            // in differently-lit sectors needs distinct objects.
            const objKey = t.key + '|' + t.light;
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
                    light:         t.light
                });
            }
            const isPickup = (t.kind === 'pickup');
            const code     = ((isPickup) ? 'pickup_' + i : 'thing_' + i);
            loader.instances().loadFromData(null, {
                code:              code,
                object:            billboardIds[objKey],
                position:          t.position,
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
                interactionRadius: ((isPickup) ? (WadConstants.PICKUP_RADIUS + t.halfWidth) : null),
                interaction:       ((isPickup) ? code : null),
                keyframes:         []
            });
            // A pickup with no game (catalog-less build) keeps the sprite but
            // never fires — harmless. With a game, wire its effect interaction.
            if (isPickup && (this._game !== null)) {
                loader.interactions().loadFromData(new DoomPickupInteraction(code, t.effect, this._game));
            }
        }

        return {count: things.length, skipped: builder.getSkipped(), filtered: builder.getFiltered()};
    }

    _registerInstance(built, bank) {
        const objectId = loader.objects().loadFromData(
            null,
            WadMeshBuilder.toLoaderData(built.textures, built.mesh, bank)
        );
        loader.instances().loadFromData(null, {...built.instanceData, object: objectId});
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
                stepHeight:      defaults.stepHeight
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
            cache.push({fh: sectors[si].fh, ch: sectors[si].ch, light: sectors[si].light, tag: sectors[si].tag, outers: outers});
        }
        return cache;
    }

    // Find the sector at a point: smallest containing outer polygon (nested
    // sectors). If none contains it (point on a boundary / imperfect polygon),
    // fall back to the nearest sector within THING_SECTOR_MAX_DIST; beyond that
    // return null so the caller drops the thing rather than mis-placing it.
    // Returns {fh, ch, light} (Doom units) or null.
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
            return {fh: contained.fh, ch: contained.ch, light: contained.light, tag: contained.tag};
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
        const sec = sectors[sidedefs[sdIdx].sector];
        return {fh: sec.fh, ch: sec.ch, light: sec.light, tag: sec.tag};
    }

    _yield() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}
