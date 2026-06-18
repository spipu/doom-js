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
     * @param {object}  options - {onLevelExit: function, thingCatalog: object}
     *                  onLevelExit is wired on the exit switches; thingCatalog
     *                  (DoomGame) maps THING types to world sprites/pickups.
     */
    constructor(wadFile, levelName, options = null) {
        options = options ?? {};

        this._wadFile      = wadFile;
        this._levelName    = levelName;
        this._onLevelExit  = options.onLevelExit ?? null;
        this._thingCatalog = options.thingCatalog ?? null;
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
        for (const door of doors) {
            this._registerInstance(door, bank);
        }
        await this._yield();

        // Lifts
        const lifts = new WadLiftBuilder(level, analysis, bank, animBank).buildAll();
        const builtLiftCodes = new Set();
        for (const lift of lifts) {
            this._registerInstance(lift, bank);
            builtLiftCodes.add(lift.code);
        }

        // Switches + interactions
        const switches = new WadSwitchBuilder(level, analysis, bank, builtLiftCodes).buildAll();
        for (const sw of switches) {
            this._registerInstance(sw, bank);
            const spec = sw.interactionSpec;
            const interaction = new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff);
            if (spec.isExit && this._onLevelExit !== null) {
                interaction.setExitCallback(this._onLevelExit);
            }
            loader.interactions().loadFromData(interaction);
        }
        await this._yield();

        // Things (decorations + pickups) as billboard sprites
        const things = this._registerThings(level, palette);
        await this._yield();

        // World + user
        loader.world().loadFromData(this._buildDefinition(level));

        console.log('WadWorldBuilder - ' + this._levelName + ': '
            + bank.count() + ' textures, ' + doors.length + ' doors, '
            + lifts.length + ' lifts, ' + switches.length + ' switches, '
            + things.count + ' things (' + things.skipped + ' skipped)');
    }

    // --- Internal ---

    // Build the world things from the THINGS lump: one shared Billboard Object3d
    // per sprite (deduplicated), one Instance per occurrence. No-op without a
    // thing catalog. Phase 1: display only (collidable false, no interaction).
    _registerThings(level, palette) {
        if (this._thingCatalog === null) {
            return {count: 0, skipped: 0};
        }

        const spriteBank = new WadSpriteBank(this._wadFile, palette).init();
        const builder = new WadThingBuilder(
            level,
            this._thingCatalog,
            spriteBank,
            (x, y) => this._findSector(x, y)
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
            loader.instances().loadFromData(null, {
                code:       'thing_' + i,
                object:     billboardIds[objKey],
                position:   t.position,
                rotation:   [0, 0, 0],
                trigger:    'none',
                loop:       false,
                onlyOnce:   false,
                collidable: false,
                radius:     null,
                keyframes:  []
            });
        }

        return {count: things.length, skipped: builder.getSkipped()};
    }

    _registerInstance(built, bank) {
        const objectId = loader.objects().loadFromData(
            null,
            WadMeshBuilder.toLoaderData(built.textures, built.mesh, bank)
        );
        loader.instances().loadFromData(null, {...built.instanceData, object: objectId});
    }

    _buildDefinition(level) {
        const spawn = this._computeSpawn(level);
        const defaults = WadConstants.USER_DEFAULTS;

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
            background: WadConstants.DEFAULT_BACKGROUND,
            lights: {
                ambient: WadConstants.DEFAULT_AMBIENT,
                sources: []
            }
        };
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
            cache.push({fh: sectors[si].fh, ch: sectors[si].ch, light: sectors[si].light, outers: outers});
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
            return {fh: contained.fh, ch: contained.ch, light: contained.light};
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
        const side = WadGeometry.cross2d(a, b, [doomX, doomY]);
        let sdIdx = ((side < 0) ? bestLd.right : bestLd.left);
        if (sdIdx < 0) {
            sdIdx = ((side < 0) ? bestLd.left : bestLd.right);
        }
        if (sdIdx < 0) {
            return null;
        }
        const sec = sectors[sidedefs[sdIdx].sector];
        return {fh: sec.fh, ch: sec.ch, light: sec.light};
    }

    _yield() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}
