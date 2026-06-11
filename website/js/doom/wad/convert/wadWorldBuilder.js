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
     */
    constructor(wadFile, levelName) {
        this._wadFile   = wadFile;
        this._levelName = levelName;
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
            loader.interactions().loadFromData(
                new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff)
            );
        }
        await this._yield();

        // World + user
        loader.world().loadFromData(this._buildDefinition(level));

        console.log('WadWorldBuilder - ' + this._levelName + ': '
            + bank.count() + ' textures, ' + doors.length + ' doors, '
            + lifts.length + ' lifts, ' + switches.length + ' switches');
    }

    // --- Internal ---

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

        const floorFh = this._findSpawnFloorHeight(level, player1.x, player1.y);

        return {
            x:   player1.x * WadConstants.SCALE,
            y:   floorFh * WadConstants.SCALE + 0.3,
            z:   player1.y * WadConstants.SCALE,
            yaw: ((90 - player1.angle) % 360 + 360) % 360
        };
    }

    // Find the sector containing the spawn point: smallest containing outer
    // polygon (nested sectors), tested in Doom coordinates.
    _findSpawnFloorHeight(level, doomX, doomY) {
        const {vertexes, linedefs, sidedefs, sectors} = level;
        let bestArea = null;
        let bestFh   = 0;

        for (let si = 0; si < sectors.length; si++) {
            const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
            if (chains.length === 0) {
                continue;
            }
            const {outers} = WadSectorPolygons.splitOutersAndHoles(chains, vertexes);
            for (const outer of outers) {
                if (!WadGeometry.pointInPolygon2d(doomX, doomY, outer)) {
                    continue;
                }
                const area = Math.abs(WadGeometry.polygonAreaSign(outer));
                if (bestArea === null || area < bestArea) {
                    bestArea = area;
                    bestFh   = sectors[si].fh;
                }
            }
        }

        return bestFh;
    }

    _yield() {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }
}
