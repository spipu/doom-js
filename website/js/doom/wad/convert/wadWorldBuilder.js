/**
 * Conversion orchestrator: builds a complete engine world in memory from a
 * parsed WAD file and a level code — textures (ImageData), map object,
 * door/lift/switch objects + instances, interactions, world + user.
 *
 * Everything is registered through the loadFromData methods of the engine
 * loaders; the caller is responsible for loader.reset() / beginBatch() /
 * setCallback() / endBatch() around build().
 */
class WadWorldBuilder {
    /**
     * @param {WadFile} wadFile
     * @param {string}  levelCode
     * @param {object}  options - {onLevelExit: function, thingCatalog: object, skill: number, simulation: DoomSimulation, profile: AbstractGameProfile}
     *                  onLevelExit is wired on the exit switches; thingCatalog
     *                  (DoomSimulation) maps THING types to world sprites/pickups; skill
     *                  (1..5, default 3) drives the single-player thing filtering;
     *                  simulation receives the level data, the stats and the pickups;
     *                  profile carries the per-game policy (Doom by default).
     */
    constructor(wadFile, levelCode, options = null) {
        options = options ?? {};

        this._wadFile        = wadFile;
        this._levelCode      = levelCode;
        this._onLevelExit    = options.onLevelExit ?? null;
        this._thingCatalog   = options.thingCatalog ?? null;
        this._skill          = options.skill ?? 3;
        this._simulation     = options.simulation ?? null;
        this._profile        = options.profile ?? new DoomGameProfile();
        this._monsterCatalog = options.monsterCatalog ?? null;
        this._monsterSystem  = options.monsterSystem ?? null;
        this._level          = null;
        this._sectorPolys    = null;   // walked on demand, see _sectorPolyCache
        this._useLineCache   = null;   // world-space linedefs of the use traces, see _useLines
        this._sectorHeights  = null;   // live sector heights (DoomSectorHeights), set with the level data
    }

    // Async only to yield to the browser between the heavy phases, so the
    // loading modal stays painted. The engine registration itself is synchronous.
    async build() {
        // Profile extensions first, then the xlat: every later pass only sees
        // internal special codes.
        WadConstants.applyGameExtensions(this._profile.wadConstantsExtensions());

        const palette  = new WadPalette(this._wadFile);
        const terrains = new WadTerrainBank(this._wadFile, this._profile).init();
        const bank     = new WadTextureBank(this._wadFile, palette, this._profile, terrains).init();
        const animBank = new WadAnimationBank(this._wadFile, bank, this._profile).init();

        const level    = new WadLevelParser(this._wadFile, this._levelCode).parse();
        const patches  = await this._applyLevelPatches(level);
        // null on missing/foreign lumps (chain-polygon fallback); keeps the flats
        // of unclosed sectors right (MAP21 sector 50).
        level.bspTree = WadBspTree.build(level);
        new WadSpecialTranslator(this._profile).translate(level);
        const bossActions = this._levelBossActions();
        const analysis = new WadMapAnalyzer(level, {
            bossLinedefs:    this._bossVirtualLinedefs(level, bossActions),
            textureHeightOf: ((name) => bank.wallTextureHeight(name))
        }).analyze();
        this._level       = level;
        this._sectorPolys = null;

        // Doors
        const doors = new WadDoorBuilder(level, analysis, bank, animBank).buildAll();
        const builtDoorCodes = new Set();
        for (const door of doors) {
            this._registerInstance(door, bank, WadConstants.MOVER_TINT);
            builtDoorCodes.add(door.code);
            this._applyDoorUseGuard(door, level);
        }
        await this._yield();

        // Lifts
        const lifts = new WadLiftBuilder(level, analysis, bank, animBank).buildAll();
        const builtLiftCodes = new Set();
        for (const lift of lifts) {
            this._registerInstance(lift, bank, WadConstants.MOVER_TINT);
            builtLiftCodes.add(lift.code);
        }

        // Rising floors
        const risingFloors = new WadRisingFloorBuilder(level, analysis, bank, animBank).buildAll();
        const builtRisingCodes = new Set();
        for (const floor of risingFloors) {
            this._registerInstance(floor, bank, WadConstants.MOVER_TINT);
            builtRisingCodes.add(floor.code);
        }

        // Stairs
        const stairs = new WadStairBuilder(level, analysis, bank, animBank).buildAll();
        const builtStairCodes = new Set();
        for (const step of stairs) {
            this._registerInstance(step, bank, WadConstants.MOVER_TINT);
            builtStairCodes.add(step.code);
        }
        // A predicted mover with empty geometry has no instance to look up.
        for (const [si, mover] of [...analysis.floorMovers]) {
            if (!builtLiftCodes.has(mover.code) && !builtRisingCodes.has(mover.code) && !builtStairCodes.has(mover.code)) {
                analysis.floorMovers.delete(si);
            }
        }
        // _sectorHeights is set later with the level data, before anything fires.
        const liveFloorOf = ((si) => this._sectorHeights.floorOf(si));

        // Static map
        const mapData = new WadStaticMapBuilder(level, analysis, bank, animBank).build();
        loader.objects().loadFromData('map', WadMeshBuilder.toLoaderData(mapData.textures, mapData.mesh, bank));
        await this._yield();

        this._registerMoverSounds(analysis, doors, lifts, risingFloors, stairs);

        // Switches + interactions
        const switches = new WadSwitchBuilder(
            level, analysis, bank, builtLiftCodes, builtDoorCodes, builtStairCodes, builtRisingCodes, liveFloorOf).buildAll();
        for (const sw of switches) {
            this._registerInstance(sw, bank, WadConstants.SWITCH_TINT);
            this._applyKeyGuard(sw);
            this._applySwitchUseGuard(sw);
            const spec = sw.interactionSpec;
            const interaction = new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff, spec.reverseTargets, spec.cycleVariant, spec.restIndex, spec.swapIndex);
            interaction.setStageRules(spec.stageRules);
            if (spec.remoteSwap) {
                interaction.setRemoteSwap(spec.remoteSwap);
            }
            if (spec.isExit && (this._onLevelExit !== null)) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }
        await this._yield();

        // Walk triggers
        const walkTriggers = new WadWalkTriggerBuilder(
            level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes, liveFloorOf).buildAll();
        for (const wt of walkTriggers) {
            this._registerInstance(wt, bank);
            this._applyCrossingGuard(wt);
            const spec = wt.interactionSpec;
            const interaction = new DoomWalkTriggerInteraction(spec.code, spec.targets, spec.reverseTargets, spec.stop, spec.cycleVariant);
            interaction.setStageRules(spec.stageRules);
            if (spec.isExit && (this._onLevelExit !== null)) {
                interaction.setExitCallback(this._onLevelExit, spec.secret === true);
            }
            loader.interactions().loadFromData(interaction);
        }

        // Gun triggers (G1/GR): no zone, the hitscan tests each shot against
        // their segments (P_ShootSpecialLine).
        if (this._simulation !== null) {
            const gunLines = new WadGunTriggerBuilder(
                level, analysis, builtRisingCodes, builtDoorCodes, liveFloorOf).buildAll();
            this._simulation.setGunTriggers(new DoomGunTriggers(gunLines));
        }

        // Teleporters
        const landings = this._buildTeleportLandings(level);
        const teleporters = new WadTeleportBuilder(level, analysis, landings).buildAll();
        for (const tp of teleporters) {
            this._registerInstance(tp, bank);
            this._applyCrossingGuard(tp);
            loader.interactions().loadFromData(
                new DoomTeleportInteraction(tp.interactionSpec.code, tp.interactionSpec.destination, this._monsterSystem, this._simulation));
        }
        await this._yield();

        const bspTree     = level.bspTree;
        const bspSectorAt = ((bspTree !== null)
            ? ((doomX, doomY) => bspTree.findSector(doomX, doomY))
            : null);
        // Resolved here: a closure over the builder would keep the whole level
        // data alive for as long as the level runs.
        const sectorIdAt = ((bspSectorAt !== null)
            ? bspSectorAt
            : WadWorldBuilder._polygonLookup(this._sectorPolyCache()));

        // The "+change" targets are zones too: their special changes at runtime.
        const damageZones = this._sectorZones(analysis, bspSectorAt,
            (si, special) => ((WadConstants.SECTOR_DAMAGE_BY_SPECIAL[special] !== undefined)
                || (analysis.floorChange[si] !== undefined)),
            (zone, special) => {
                zone.special = special;
            });
        let damageInteraction = null;
        if (damageZones.list.length > 0) {
            damageInteraction = new DoomSectorDamageInteraction(damageZones, this._onLevelExit);
            loader.interactions().loadFromData(damageInteraction);
            this._simulation.setSectorDamage(damageInteraction);
        }

        // Wind, conveyors and ice (tables empty outside Heretic).
        const pushZones = this._sectorZones(analysis, bspSectorAt,
            (si, special) => ((WadConstants.SECTOR_PUSH_BY_SPECIAL[special] !== undefined)
                || (WadConstants.SECTOR_FRICTION_BY_SPECIAL[special] !== undefined)),
            (zone, special) => {
                zone.push     = (WadConstants.SECTOR_PUSH_BY_SPECIAL[special] ?? null);
                zone.friction = (WadConstants.SECTOR_FRICTION_BY_SPECIAL[special] ?? null);
            });
        if (pushZones.list.length > 0) {
            loader.interactions().loadFromData(new DoomSectorPushInteraction(pushZones, this._monsterSystem));
        }

        let lightInteraction = null;
        if (analysis.lightSectors.length > 0) {
            lightInteraction = new DoomSectorLightInteraction(analysis.lightSectors);
            loader.interactions().loadFromData(lightInteraction);
        }

        const secretZones = this._sectorZones(analysis, bspSectorAt,
            (si, special) => (special === WadConstants.SECTOR_SECRET_SPECIAL), null);
        if (this._simulation !== null) {
            this._simulation.setSecretsTotal(secretZones.list.length);
            if (secretZones.list.length > 0) {
                loader.interactions().loadFromData(new DoomSecretInteraction(secretZones, this._simulation));
            }
            this._simulation.setSectorLight(new DoomSectorLight(sectorIdAt, lightInteraction, level.sectors));
        }

        const surfaces = this._wireFloorChanges(analysis, animBank, damageInteraction);

        // Reads the live flat: a "+change" floor turned to water splashes as water.
        this._simulation.setTerrain(new DoomTerrain(sectorIdAt, surfaces, terrains.flats(), terrains.terrains())
            .setLiquidTints(this._liquidTints(analysis, terrains, bank)));

        // Things
        const builtFloorCodes = new Set([...builtLiftCodes, ...builtRisingCodes, ...builtStairCodes]);
        const things = this._registerThings(level, palette, analysis, builtFloorCodes);
        this._registerAmbientSounds(level);
        await this._yield();

        const levelData = this._buildMonsterLevelData(level, analysis, builtFloorCodes, builtDoorCodes, walkTriggers, teleporters, landings, lightInteraction);
        if (this._monsterSystem !== null) {
            this._monsterSystem.setLevelData(levelData).setExitCallback(this._onLevelExit);
        }
        this._registerAutomap(level, levelData.heights);
        const bossRules = this._wireBossDeath(bossActions, level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes);
        this._wireBossBrain();

        loader.world().loadFromData(this._buildDefinition(level, bank));

        console.log('WadWorldBuilder - ' + this._levelCode + ' [profile ' + this._profile.getCode() + ']: '
            + bank.count() + ' textures, ' + doors.length + ' doors, '
            + lifts.length + ' lifts, ' + risingFloors.length + ' rising, '
            + stairs.length + ' stairs, '
            + switches.length + ' switches, ' + walkTriggers.length + ' walk-triggers, '
            + teleporters.length + ' teleporters, ' + bossRules + ' boss rules, '
            + things.count + ' things (' + things.skipped + ' skipped, '
            + things.filtered + ' filtered, ' + things.monsters + ' monsters, skill ' + this._skill + '), '
            + patches + ' compat patches');

        if (bspTree !== null) {
            bspTree.releaseBuildData();
        }
    }

    // --- Internal ---

    // Accepted deviation: the 40-44/72 ceiling specials without a ceiling flag
    // keep the door voice.
    _registerMoverSounds(analysis, doors, lifts, risingFloors, stairs) {
        if (this._simulation === null) {
            return;
        }
        const sounds = new DoomMoverSounds(this._profile.doorSoundStyle());
        const registerAll = (built, spec) => {
            for (const item of built) {
                sounds.register(item.code, spec(item));
            }
        };
        registerAll(doors, (door) => {
            const props   = (analysis.doorProps[parseInt(door.code.slice('door_'.length), 10)] ?? {});
            const ceiling = ((props.anim === 'crusher') || (props.ceilingRaise === true) || (props.ceilingSound === true));
            return {
                kind:   ((ceiling) ? 'ceiling' : 'door'),
                blaze:  ((props.speed ?? 2) >= 8),
                silent: (props.silent === true)
            };
        });
        registerAll(lifts, () => ({kind: 'plat', blaze: false, silent: false}));
        registerAll(risingFloors, () => ({kind: 'floor', blaze: false, silent: false}));
        registerAll(stairs, () => ({kind: 'floor', blaze: false, silent: false}));
        this._simulation.setMoverSounds(sounds);
    }

    // Ambient sound things (profile table, ednum → loop/random spec): no body,
    // only a place that sounds.
    _registerAmbientSounds(level) {
        const table = this._profile.ambientSounds();
        const kinds = Object.keys(table);
        if ((kinds.length === 0) || (this._simulation === null)) {
            return;
        }
        const ambient = new DoomAmbientSounds();
        let count = 0;
        for (const thing of level.things) {
            const spec = table[thing.type];
            if (spec === undefined) {
                continue;
            }
            if (spec.loop !== undefined) {
                const sect = this._findSector(thing.x, thing.y);
                ambient.addLoop(spec.loop, WadGeometry.doomToWorld(thing.x, thing.y, ((sect !== null) ? sect.fh : 0)));
            } else {
                ambient.addSequence(spec.sequence);
            }
            count++;
        }
        if (count > 0) {
            this._simulation.setAmbientSounds(ambient);
        }
    }

    // One shared billboard per sprite variant, one instance per thing; pickups
    // get a proximity trigger and a DoomPickupInteraction.
    _registerThings(level, palette, analysis, builtFloorCodes) {
        if (this._thingCatalog === null) {
            return {count: 0, skipped: 0, filtered: 0, monsters: 0};
        }

        const spriteBank = new WadSpriteBank(this._wadFile, palette).init();
        const builder = new WadThingBuilder(
            level,
            this._thingCatalog,
            spriteBank,
            (x, y) => this._findSector(x, y),
            this._skill,
            this._monsterCatalog,
            // Out-of-range dev skill: null, the builder falls back to the flag bits.
            (this._profile.skillRules()[this._skill] ?? null)
        );
        const things = builder.buildAll();

        const billboardIds        = {};
        const monsterBillboardIds = {};
        let   killsTotal          = 0;
        let   itemsTotal          = 0;
        // vanilla total_items counts the map things alone, never the drops (P_SpawnMobj).
        const countedItems = this._profile.countedItemTypes();
        for (let i = 0; i < things.length; i++) {
            const thing = things[i];
            if (thing.kind === 'monster') {
                this._registerMonsterThing(thing, i, analysis, builtFloorCodes, monsterBillboardIds);
                if (thing.def.getFlags().countsKill !== false) {
                    killsTotal++;
                }
                continue;
            }
            // The sector light is baked into the billboard and the light group
            // drives it at runtime, so both split the shared object.
            const isPickup   = (thing.kind === 'pickup');
            const lightGroup = WadMapAnalyzer.lightGroupOf(analysis, thing.si);
            const objKey     = thing.key + '|' + thing.light + '|' + lightGroup + '|' + isPickup;
            if (billboardIds[objKey] === undefined) {
                billboardIds[objKey] = loader.objects().loadBillboardFromData(null, {
                    billboard:     true,
                    textures:      thing.texIds,
                    animDuration:  thing.animDuration,
                    halfWidth:     thing.halfWidth,
                    height:        thing.height,
                    anchorOffsetX: thing.anchorOffsetX,
                    anchorOffsetY: thing.anchorOffsetY,
                    anchorTop:     thing.anchorTop,
                    light:         thing.light,
                    lightGroup:    lightGroup,
                    tint:          ((isPickup) ? WadConstants.PICKUP_TINT : null)
                });
            }
            const countsItem = (isPickup && countedItems.has(thing.type));
            const code       = ((isPickup) ? 'pickup_' + i : 'thing_' + i);
            if (countsItem) {
                itemsTotal++;
            }
            const ride = this._resolveThingFloor(thing, analysis, builtFloorCodes);
            const position = [thing.position[0], thing.position[1] + ride.liftY, thing.position[2]];
            loader.instances().loadFromData(null, {
                code:                  code,
                object:                billboardIds[objKey],
                position:              position,
                rotation:              [0, 0, 0],
                trigger:               ((isPickup) ? 'proximity' : 'none'),
                loop:                  false,
                // An unconsumed pickup (full health) stays grabbable (P_TouchSpecialThing).
                onlyOnce:              false,
                collisionShape:        ((thing.solid) ? 'box' : 'none'),
                collisionRadius:       thing.radius,
                // Cylinder reach: a key on a ledge is taken from the floor below
                // (PIT_CheckThing / P_TouchSpecialThing).
                interactionRadius:     ((isPickup) ? WadConstants.PICKUP_RADIUS : null),
                interactionShape:      ((isPickup) ? 'cylinder' : 'sphere'),
                interactionReachBelow: ((isPickup) ? WadConstants.PICKUP_REACH_BELOW : 0),
                interactionReachAbove: ((isPickup) ? WadConstants.PLAYER_HEIGHT : 0),
                interaction:           ((isPickup) ? code : null),
                keyframes:             []
            });
            if (ride.floorCode !== null) {
                loader.instances().getByCode(code).setRideOn(loader.instances().getByCode(ride.floorCode));
            }
            if (isPickup && (this._simulation !== null)) {
                loader.interactions().loadFromData(new DoomPickupInteraction(code, thing.effect, this._simulation, countsItem));
            }
        }
        if (this._simulation !== null) {
            this._simulation.setKillsTotal(killsTotal);
            this._simulation.setItemsTotal(itemsTotal);
        }
        this._registerMonsterDrops(things, spriteBank);
        this._registerCrushedCorpseView(spriteBank);
        this._registerRuntimeSpawnables(spriteBank, monsterBillboardIds);

        // Every spot group of the map, moved to world coordinates once.
        this._spots = {};
        const spots = builder.getSpots();
        for (const group of Object.keys(spots)) {
            this._spots[group] = spots[group].map((s) => {
                const sect = this._findSector(s.x, s.y);
                const pos  = WadGeometry.doomToWorld(s.x, s.y, ((sect !== null) ? sect.fh : 0));

                return {x: pos[0], y: pos[1], z: pos[2], angle: s.angle};
            });
        }

        return {count: things.length, skipped: builder.getSkipped(), filtered: builder.getFiltered(), monsters: builder.getMonsterCount()};
    }

    /**
     * Billboard object per (sprite view, alpha, ceiling anchor): the spectre
     * shares the demon's SARG lumps, the Heretic ghosts their base monsters'.
     *
     * @returns {object} view key → array of object ids (one per rotation)
     */
    _monsterBillboards(frames, alpha, ceiling, billboardIds) {
        const scale = WadConstants.SCALE;
        const objectIdsByView = {};
        for (const viewKey of Object.keys(frames)) {
            objectIdsByView[viewKey] = frames[viewKey].map((spr) => {
                const objKey = spr.loaderId + '|' + alpha + '|' + ceiling;
                if (billboardIds[objKey] === undefined) {
                    const geo  = WadGeometry.spriteBillboardData(spr);
                    const sink = spr.topOffset - spr.height;
                    billboardIds[objKey] = loader.objects().loadBillboardFromData(null, {
                        billboard:     true,
                        textures:      [spr.loaderId],
                        halfWidth:     geo.halfWidth,
                        height:        geo.height,
                        anchorOffsetX: geo.anchorOffsetX,
                        anchorOffsetY: ((ceiling) ? sink : Math.max(0, sink)) * scale,
                        anchorTop:     ceiling,
                        light:         255,
                        alpha:         alpha,
                        tint:          WadConstants.MONSTER_TINT
                    });
                }

                return billboardIds[objKey];
            });
        }

        return objectIdsByView;
    }

    // Monsters spawned mid-fight (lost souls, D'Sparil), built inside the batch:
    // nothing can load at runtime. A type missing from the IWAD is skipped.
    _registerRuntimeSpawnables(spriteBank, billboardIds) {
        if ((this._monsterSystem === null) || (this._monsterCatalog === null)) {
            return;
        }
        const catalog = {};
        for (const code of this._profile.runtimeSpawnTypes()) {
            const def = this._monsterCatalog.getDefByCode(code);
            if (def === null) {
                continue;
            }
            const views = DoomMonsterFrames.build(def, spriteBank, true);
            if (views !== null) {
                catalog[code] = {
                    def:    def,
                    frames: this._monsterBillboards(views, def.getAlpha(), def.isCeiling(), billboardIds)
                };
            }
        }
        this._monsterSystem.setSpawnables(catalog);
    }

    // Crushed-corpse billboard (vanilla S_GIBS), built inside the batch; none
    // for a profile or WAD without the sprite.
    _registerCrushedCorpseView(spriteBank) {
        if (this._monsterSystem === null) {
            return;
        }
        const lump = this._profile.crushedCorpseSprite();
        if ((lump === null) || !spriteBank.has(lump)) {
            this._monsterSystem.setCrushedCorpseView(null);
            return;
        }
        this._monsterSystem.setCrushedCorpseView(this._groundSpriteBillboard(spriteBank.get(lump), WadConstants.MONSTER_TINT));
    }

    // Floor-anchored billboard of the runtime templates, baked fullbright: the
    // spawn sector is unknown, the monster system lights each instance.
    _groundSpriteBillboard(spr, tint) {
        const geo = WadGeometry.spriteBillboardData(spr);
        return loader.objects().loadBillboardFromData(null, {
            billboard:     true,
            textures:      [spr.loaderId],
            halfWidth:     geo.halfWidth,
            height:        geo.height,
            anchorOffsetX: geo.anchorOffsetX,
            anchorOffsetY: Math.max(0, spr.topOffset - spr.height) * WadConstants.SCALE,
            anchorTop:     false,
            light:         255,
            tint:          tint
        });
    }

    // Drop templates, one interaction per item/amount pair, built inside the
    // batch: interactions cannot register at runtime, only instances spawn.
    _registerMonsterDrops(things, spriteBank) {
        if ((this._monsterSystem === null) || (this._simulation === null)) {
            return;
        }
        const types   = this._profile.dropItemTypes();
        const catalog = {};
        for (const thing of things) {
            if (thing.kind !== 'monster') {
                continue;
            }
            for (const drop of thing.def.getDropItems()) {
                const key = DoomMonsterSystem.dropKey(drop);
                if ((catalog[key] !== undefined) || (types[drop.item] === undefined)) {
                    continue;
                }
                const type = types[drop.item];
                const spr  = spriteBank.get(type.sprite);
                if (spr === null) {
                    continue;
                }
                const effect = ((type.effect !== undefined) ? type.effect : {ammo: type.ammoType, amount: (drop.amount ?? 0)});
                const code   = 'drop_' + drop.item + '_' + (drop.amount ?? 'x');
                catalog[key] = {
                    code:  code,
                    objId: this._groundSpriteBillboard(spr, WadConstants.PICKUP_TINT)
                };
                loader.interactions().loadFromData(new DoomPickupInteraction(code, effect, this._simulation));
            }
        }
        this._monsterSystem.setDrops(catalog);
    }

    // Views baked fullbright: a body moves, so the monster system lights it
    // from its current sector.
    _registerMonsterThing(thing, i, analysis, builtFloorCodes, billboardIds) {
        const frames = this._monsterBillboards(thing.frames, thing.alpha, thing.def.isCeiling(), billboardIds);

        const code       = 'monster_' + i;
        const ride       = this._resolveThingFloor(thing, analysis, builtFloorCodes);
        const spawnState = thing.def.getState('spawn0');
        loader.instances().loadFromData(null, {
            code:            code,
            object:          frames[DoomMonsterDef.viewKey(spawnState.getSprite(), spawnState.getFrame())][0],
            position:        [thing.position[0], thing.position[1] + ride.liftY, thing.position[2]],
            rotation:        [0, 0, 0],
            trigger:         'none',
            loop:            false,
            onlyOnce:        false,
            // +NOBLOCKMAP (the Icon of Sin's eye) blocks neither player nor shot.
            collisionShape:  ((thing.def.getFlags().noBlockmap === true) ? 'none' : 'box'),
            collisionRadius: thing.radius,
            keyframes:       []
        });
        const inst = loader.instances().getByCode(code);
        if (ride.floorCode !== null) {
            inst.setRideOn(loader.instances().getByCode(ride.floorCode));
        }
        if (this._monsterSystem !== null) {
            const spawnPos = [thing.position[0], thing.position[1] + ride.liftY, thing.position[2]];
            this._monsterSystem.add({
                code:   code,
                inst:   inst,
                def:    thing.def,
                facing: thing.facing,
                flags:  thing.flags,
                frames: frames,
                si:     thing.si,
                // P_NightmareRespawn returns to the original spot and flags.
                spawn:  {position: spawnPos, facing: thing.facing, flags: thing.flags, si: thing.si}
            });
        }
    }

    // The reveal is a BSP walk: no valid tree, no map.
    _registerAutomap(level, heights) {
        if ((this._simulation === null) || (level.bspTree === null)) {
            return;
        }
        this._simulation.setAutomap(new DoomAutomap(new WadAutomapBuilder(level).build(), heights));
    }

    // Level data of the monster AI and the sector-height service built from it.
    // Only built mover codes are listed, so getByCode never throws downstream;
    // monsterLines are the lines a monster fires by crossing (P_CrossSpecialLine).
    _buildMonsterLevelData(level, analysis, builtFloorCodes, builtDoorCodes, walkTriggers, teleporters, landings, lightInteraction) {
        const doorFloorH = {};
        const moverCodes = {};
        for (const code of builtFloorCodes) {
            moverCodes[code.split('_')[1]] = {kind: 'floor', code: code};
        }
        for (const si of analysis.doorSectorIds) {
            if ((analysis.doorHeights[si] !== undefined) && builtDoorCodes.has('door_' + si)) {
                const props = analysis.doorProps[si];
                doorFloorH[si] = analysis.doorHeights[si].floorH;
                moverCodes[si] = {
                    kind:       'door',
                    code:       'door_' + si,
                    monsterUse: (props.monsterUse === true)
                };
            }
        }
        const monsterLines       = [];
        const vx                 = level.vertexes;
        const builtWalkCodes     = new Set(walkTriggers.map((w) => w.code));
        const builtTeleportCodes = new Set(teleporters.map((t) => t.code));
        for (const tp of analysis.teleporterLinedefs) {
            if (landings[tp.tag] === undefined) {
                continue;
            }
            const ld = level.linedefs[tp.ldIdx];
            const sharedZone = 'teleport_' + tp.ldIdx;
            monsterLines.push({
                kind:     'teleport',
                x1:       vx[ld.v1][0], y1: vx[ld.v1][1],
                x2:       vx[ld.v2][0], y2: vx[ld.v2][1],
                once:     (WadConstants.TELEPORT_ONCE_BY_SPECIAL[tp.special] === true),
                used:     false,
                landing:  landings[tp.tag],
                zoneCode: ((builtTeleportCodes.has(sharedZone)) ? sharedZone : null)
            });
        }
        for (const wt of analysis.walkTriggerLinedefs) {
            if (!WadConstants.MONSTER_WALK_SPECIALS.has(wt.special) || !builtWalkCodes.has('walk_' + wt.ldIdx)) {
                continue;
            }
            const ld = level.linedefs[wt.ldIdx];
            monsterLines.push({
                kind:     'zone',
                x1:       vx[ld.v1][0], y1: vx[ld.v1][1],
                x2:       vx[ld.v2][0], y2: vx[ld.v2][1],
                once:     !WadConstants.specialRepeats(wt.special),
                used:     false,
                zoneCode: 'walk_' + wt.ldIdx
            });
        }

        const levelData = {
            sectorGraph:  analysis.sectorGraph,
            reject:       level.reject,
            numSectors:   level.sectors.length,
            findSector:   ((doomX, doomY) => this._findSector(doomX, doomY)),
            sectors:      level.sectors,
            doorFloorH:   doorFloorH,
            restFh:       analysis.liftOriginalFh,
            moverCodes:   moverCodes,
            monsterLines: monsterLines,
            // 'bossSpot' (D'Sparil reappears), 'bossTarget' (Icon of Sin cubes).
            spots:        (this._spots ?? {}),
            levelCode:    this._levelCode,
            // mapinfo `allowmonstertelefrags`.
            monstersTelefrag: this._profile.monsterTelefragMaps().includes(this._levelCode),
            lightFactorOf: ((si) => ((lightInteraction !== null) ? lightInteraction.getFactor(si) : 1)),
            // Bodies in these sectors are re-lit every frame, others on change only.
            hasLightEffect: ((si) => analysis.lightSectorIds.has(si))
        };
        levelData.heights = new DoomSectorHeights(levelData);
        this._sectorHeights = levelData.heights;

        return levelData;
    }

    // Floor instance a thing rides, plus the Y shift back to a lift's rest
    // height: its sector fh is patched to the low position.
    _resolveThingFloor(thing, analysis, builtFloorCodes) {
        const SCALE = WadConstants.SCALE;
        const sec = this._findSector(thing.position[0] / SCALE, thing.position[2] / SCALE);
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

    // "+change" floors read the source sector's live surface when they fire
    // (vanilla line->frontsector, so chains propagate). Every reachable flat is
    // resolved here: no texture can register outside the batch.
    _wireFloorChanges(analysis, animBank, damageInteraction) {
        const surfaces = new DoomSectorSurfaces(this._level.sectors);
        this._simulation.setSectorSurfaces(surfaces);

        const sequences = new Map();
        for (const key of Object.keys(analysis.floorChange)) {
            const si     = parseInt(key, 10);
            const change = analysis.floorChange[key];
            const code   = (analysis.floorMovers.get(si)?.code ?? null);
            if ((code === null) || code.startsWith('stair_')) {
                continue;
            }
            const ownIds = new Set();
            for (const flat of this._reachableFlats(si, analysis.floorChange)) {
                if (!sequences.has(flat)) {
                    sequences.set(flat, animBank.flatSequenceLoaderIds(flat));
                }
                sequences.get(flat).ids.forEach((id) => ownIds.add(id));
            }
            const inst  = loader.instances().getByCode(code);
            const applyChange = () => {
                const flat    = surfaces.flatOf(change.sourceSi);
                const special = WadMapAnalyzer.changeSpecial(change.special, surfaces.specialOf(change.sourceSi));
                const newSeq  = sequences.get(flat) ?? {ids: [], duration: 0};
                if ((ownIds.size > 0) && (newSeq.ids.length > 0)) {
                    const newAnim = ((newSeq.ids.length > 1)
                        ? {ids: newSeq.ids, duration: newSeq.duration, durationMs: Math.round(newSeq.duration * 1000)}
                        : null);
                    inst.getObject().faceList.forEach((fc) => {
                        const animated = ((fc.animTextures !== null) && (fc.animTextures !== undefined)
                            && fc.animTextures.ids.some((id) => ownIds.has(id)));
                        if (animated || ownIds.has(fc.textureId)) {
                            fc.textureId    = newSeq.ids[0];
                            fc.animTextures = newAnim;
                        }
                    });
                    inst.getObject().invalidateFaceGroups();
                }
                surfaces.set(si, flat, ((special !== null) ? special : surfaces.specialOf(si)));
                if ((special !== null) && (damageInteraction !== null)) {
                    damageInteraction.setSectorSpecial(si, special);
                }
            };
            if (change.at === 'complete') {
                inst.setOnComplete(applyChange);
            } else {
                inst.setOnStart(applyChange);
            }
        }

        return surfaces;
    }

    // Average colour of every liquid flat the level can show, used to tint the
    // generic splash of a game without splash sprites.
    _liquidTints(analysis, terrains, bank) {
        const tints = {};
        for (let si = 0; si < this._level.sectors.length; si++) {
            for (const flat of this._reachableFlats(si, analysis.floorChange)) {
                const name = flat.toUpperCase();
                if ((tints[name] !== undefined) || !terrains.isLiquid(name)) {
                    continue;
                }
                const index = bank.ensureFlatTex(name);
                if (index >= 0) {
                    tints[name] = loader.textures().get(bank.getLoaderId(index)).getAverageColor();
                }
            }
        }

        return tints;
    }

    // Flats a sector can show: its own, then those its "+change" chain brings.
    _reachableFlats(si, floorChange, visited = new Set()) {
        const flats = new Set([this._level.sectors[si].ft]);
        if (visited.has(si)) {
            return flats;
        }
        visited.add(si);
        const change = floorChange[si];
        if (change !== undefined) {
            this._reachableFlats(change.sourceSi, floorChange, visited).forEach((flat) => flats.add(flat));
        }

        return flats;
    }

    // tint: flat colour of the whole body in the textureless renderers, null for
    // the trigger zones, which carry no face to paint.
    _registerInstance(built, bank, tint = null) {
        const objectData = WadMeshBuilder.toLoaderData(built.textures, built.mesh, bank);
        objectData.tint  = tint;
        const objectId = loader.objects().loadFromData(null, objectData);
        loader.instances().loadFromData(null, {...built.instanceData, object: objectId});
    }

    // P_UseLines: 64 units straight ahead, first line met, front side only —
    // one press reaches one switch, never every panel within the radius.
    _applySwitchUseGuard(built) {
        const ownIdx   = built.linedef;
        const own      = this._useLines()[ownIdx];
        const instance = loader.instances().getByCode(built.code);
        const range    = WadConstants.USE_RANGE * WadConstants.SCALE;
        instance.addTriggerCondition((user) => {
            if (WadGeometry.cross2d([own.x1, own.z1], [own.x2, own.z2], [user.x, user.z]) > 0) {
                return false;
            }
            const dx  = Math.sin(DEG_TO_RAD * user.yaw);
            const dz  = Math.cos(DEG_TO_RAD * user.yaw);
            const hit = WadGeometry.raySegmentHit(user.x, user.z, dx, dz, range, own.x1, own.z1, own.x2, own.z2);
            if (hit === null) {
                return false;
            }
            // Stopped short of the line so a shared corner counts as its wall.
            const reach = hit * WadConstants.USE_TRACE_STOP_RATIO;

            return !this._useTraceBlocked(user.x, user.z, user.x + (dx * reach), user.z + (dz * reach), ownIdx);
        });
    }

    // P_LineOpening: a one-sided wall or a two-sided line whose live floor
    // meets its ceiling (closed door, parked pillar) stops the use trace.
    _useTraceBlocked(px, pz, nx, nz, ownIdx) {
        for (const line of this._useLines()) {
            if ((line.idx === ownIdx) || !WadGeometry.segmentsTouch(px, pz, nx, nz, line.x1, line.z1, line.x2, line.z2)) {
                continue;
            }
            if (line.lSi < 0) {
                return true;
            }
            const heights = this._sectorHeights;
            const floor   = Math.max(heights.floorOf(line.rSi), heights.floorOf(line.lSi));
            const ceiling = Math.min(heights.ceilingOf(line.rSi), heights.ceilingOf(line.lSi));
            if (ceiling <= floor) {
                return true;
            }
        }

        return false;
    }

    // Every linedef as a world-space segment with its sector sides (lazy).
    _useLines() {
        if (this._useLineCache === null) {
            const {vertexes, linedefs, sidedefs} = this._level;
            this._useLineCache = linedefs.map((ld, idx) => {
                const [dx1, dy1] = vertexes[ld.v1];
                const [dx2, dy2] = vertexes[ld.v2];
                const [x1, z1] = WadGeometry.doomToWorld(dx1, dy1);
                const [x2, z2] = WadGeometry.doomToWorld(dx2, dy2);
                return {idx: idx, x1: x1, z1: z1, x2: x2, z2: z2,
                    rSi: ((ld.right >= 0) ? sidedefs[ld.right].sector : -1),
                    lSi: ((ld.left >= 0) ? sidedefs[ld.left].sector : -1)};
            });
        }

        return this._useLineCache;
    }

    // Locked switches (99/133-137) check the key at USE time (EV_DoLockedDoor).
    _applyKeyGuard(built) {
        const keyCode = built.instanceData.keyRequired;
        if (keyCode) {
            loader.instances().getByCode(built.code).addTriggerCondition((user) => user.hasItem(keyCode));
        }
    }

    // Catalogued fixes of the known maps (UZDoom LevelCompatibility), keyed by
    // the map's own fingerprint, applied before anything reads the records.
    async _applyLevelPatches(level) {
        const entry = doomLevelPatches.get(await this._wadFile.mapChecksum(this._levelCode));
        if (entry === null) {
            return 0;
        }

        return new WadLevelPatcher().apply(level, entry.actions);
    }

    // A_BossDeath actions of this level, from the profile — a 'MAP07-1' /
    // 'MAP07-2' suffix distinguishes two boss groups on one map.
    _levelBossActions() {
        const actions = this._profile.bossActions();
        const levelActions = [];
        for (const key of Object.keys(actions)) {
            if (key.split('-')[0] === this._levelCode) {
                levelActions.push({key: key, ...actions[key]});
            }
        }
        return levelActions;
    }

    // Vanilla fires these from a dummy line: a virtual linedef lets the analyzer
    // build a mover no real line aims at (E1M8's 666); a real line wins (MAP07).
    _bossVirtualLinedefs(level, bossActions) {
        const isMover = (special) => ((WadConstants.DOOR_BY_SPECIAL[special] !== undefined)
            || WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(special)
            || WadConstants.FLOOR_MOVE_UP_SPECIALS.has(special));
        const virtual = [];
        for (const action of bossActions) {
            if (action.exit === true) {
                continue;
            }
            if (!level.linedefs.some((ld) => ((ld.tag === action.tag) && isMover(ld.special)))) {
                // v1/v2 = -1 so an accidental vertex read fails loudly, not as NaN geometry.
                virtual.push({special: action.special, tag: action.tag, left: -1, right: -1, v1: -1, v2: -1});
            }
        }
        return virtual;
    }

    // Icon of Sin target rotation and cube spawns, on levels with its target spots.
    _wireBossBrain() {
        const targets = ((this._spots ?? {}).bossTarget ?? []);
        if ((this._monsterSystem === null) || (targets.length === 0)) {
            return;
        }
        const skillRule = (this._profile.skillRules()[this._skill] ?? null);
        this._monsterSystem.setBossBrain(new DoomBossBrain(
            targets, this._profile.bossCubeSpawns(), (skillRule?.easyBossBrain === true)));
    }

    _wireBossDeath(bossActions, level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes) {
        if ((this._monsterSystem === null) || (this._monsterCatalog === null) || (bossActions.length === 0)) {
            return 0;
        }
        const defs = this._monsterCatalog.getAllDefs();
        const rules = [];
        for (const action of bossActions) {
            const targets = ((action.exit === true) ? [] : WadMapAnalyzer.resolveTaggedTargets(level.sectors, action.tag, WadMapAnalyzer.moverFamilies(
                analysis, level.sectors,
                {lifts: builtLiftCodes, rising: builtRisingCodes, doors: builtDoorCodes, stairs: builtStairCodes},
                action.special)));
            const split = WadMapAnalyzer.splitReverseTargets(analysis, action.special, targets);
            for (const def of defs) {
                if (def.getBossMaps().includes(action.key)) {
                    rules.push({
                        def:            def,
                        targets:        split.start,
                        reverseTargets: split.reverse,
                        cycleVariant:   WadConstants.cycleKeyForSpecial(action.special),
                        stageRules:     WadMapAnalyzer.stageRulesFor(analysis, action.special, split.start, ((si) => this._sectorHeights.floorOf(si))),
                        exit:           (action.exit === true)
                    });
                }
            }
        }
        if (rules.length > 0) {
            this._monsterSystem.setBossDeath(new DoomBossDeath(this._monsterSystem, rules, this._onLevelExit));
        }
        return rules.length;
    }

    // Walk zones and teleports fire on a real crossing (P_CrossSpecialLine): the
    // engine proximity circle is only the broadphase.
    _applyCrossingGuard(built) {
        if (built.crossSegment === undefined) {
            return;
        }
        const crossing = new WadLineCrossing(built.crossSegment);
        const instance = loader.instances().getByCode(built.code);
        if (built.crossFrontOnly !== true) {
            instance.addTriggerCondition((user) => crossing.crossedBy(user));
            return;
        }
        // A back-side crossing never teleports but still spends a W1 line
        // (p_spec.c case 39).
        const spendOnRefuse = (built.instanceData.onlyOnce === true);
        instance.addTriggerCondition((user) => {
            const side = crossing.crossingSideBy(user);
            if (side === 0) {
                return true;
            }
            if ((side === 1) && spendOnRefuse) {
                instance.stop();
            }
            return false;
        });
    }

    // Vanilla USE rules are per linedef, the engine has one radius per body: the
    // nearest two-sided face stands in for the line P_UseSpecialLine picks. It
    // must carry a manual door special, is usable from its front only, and
    // demands its own key. A door with no usable face (timer sector) keeps the radius.
    _applyDoorUseGuard(built, level) {
        if (built.instanceData.trigger !== 'action') {
            return;
        }
        const si = Number(built.code.split('_')[1]);
        const faces = [];
        for (const ld of level.linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            if ((level.sidedefs[ld.right].sector !== si) && (level.sidedefs[ld.left].sector !== si)) {
                continue;
            }
            const [dx1, dy1] = level.vertexes[ld.v1];
            const [dx2, dy2] = level.vertexes[ld.v2];
            const [x1, z1] = WadGeometry.doomToWorld(dx1, dy1);
            const [x2, z2] = WadGeometry.doomToWorld(dx2, dy2);
            const door   = WadConstants.DOOR_BY_SPECIAL[ld.special];
            const usable = (door?.trigger === 'action');
            faces.push({x1: x1, z1: z1, x2: x2, z2: z2,
                usable: usable, key: ((usable) ? (door.key ?? null) : null)});
        }
        if (!faces.some((face) => (face.usable === true))) {
            return;
        }

        loader.instances().getByCode(built.code).addTriggerCondition((user) => {
            let nearest = null;
            let bestSq  = Infinity;
            for (const face of faces) {
                const d2 = WadGeometry.pointSegmentDistSq(user.x, user.z, face.x1, face.z1, face.x2, face.z2);
                if (d2 < bestSq) {
                    bestSq  = d2;
                    nearest = face;
                }
            }
            if (nearest.usable !== true) {
                return false;
            }
            // cross < 0 is the front (right) side.
            if (WadGeometry.cross2d([nearest.x1, nearest.z1], [nearest.x2, nearest.z2], [user.x, user.z]) > 0) {
                return false;
            }

            return ((nearest.key === null) || user.hasItem(nearest.key));
        });
    }

    _buildDefinition(level, bank) {
        const spawn = this._computeSpawn(level);
        const defaults = WadConstants.USER_DEFAULTS;

        // The sky's top-row colour doubles as the background: it shows above the
        // WebGL sky band and through the CPU renderer's sky holes.
        const skyPolicy = this._profile.skyForLevel(this._levelCode);
        const skyIdx = bank.ensureSkyTex(skyPolicy.name);
        let sky = null;
        let background = WadConstants.DEFAULT_BACKGROUND;
        if (skyIdx >= 0) {
            const loaderId = bank.getLoaderId(skyIdx);
            sky = {loaderId: loaderId, wrap: skyPolicy.wrap, capBottom: this._skyCapColor(loaderId, 'bottom')};
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
                fallSafeFactor:  defaults.fallSafeFactor,
                fallMaxFactor:   defaults.fallMaxFactor,
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

    // Average colour of the sky's top or bottom row, filling above and below the
    // sky band like modern ports (vanilla has no such colour).
    _skyCapColor(loaderId, row = 'top') {
        const tex = loader.textures().get(loaderId);
        const pixels = tex.data;
        const w = tex.width;
        const rowStart = ((row === 'bottom') ? (4 * w * (tex.height - 1)) : 0);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let x = 0; x < w; x++) {
            const p = rowStart + 4 * x;
            r += pixels[p];
            g += pixels[p + 1];
            b += pixels[p + 2];
        }

        return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    }

    // Player 1 start (thing type 1), just above its sector floor.
    _computeSpawn(level) {
        const player1 = level.things.find((t) => t.type === 1);
        if (player1 === undefined) {
            return {...WadConstants.FALLBACK_SPAWN};
        }

        const sect    = this._findSector(player1.x, player1.y);
        const floorFh = ((sect !== null) ? sect.fh : 0);

        return {
            x:   player1.x * WadConstants.SCALE,
            y:   floorFh * WadConstants.SCALE + WadConstants.SPAWN_FLOOR_CLEARANCE,
            z:   player1.y * WadConstants.SCALE,
            yaw: WadGeometry.doomAngleYaw(player1.angle)
        };
    }

    // Teleport landings by sector tag: {x, y, topY, z, yaw} in world space.
    // EV_Teleport lands ONFLOORZ on a possibly moving sector, so the floor is
    // searched live from topY (the ceiling); y is the build-time fallback.
    _buildTeleportLandings(level) {
        const SCALE = WadConstants.SCALE;
        const landings = {};
        for (const thing of level.things) {
            if (thing.type !== WadConstants.TELEPORT_LANDING_THING) {
                continue;
            }
            const sec = this._findSector(thing.x, thing.y);
            if ((sec === null) || (sec.tag === 0)) {
                continue;
            }
            landings[sec.tag] = {
                x:    thing.x * SCALE,
                y:    sec.fh * SCALE + WadConstants.SPAWN_FLOOR_CLEARANCE,
                topY: sec.ch * SCALE,
                z:    thing.y * SCALE,
                yaw:  WadGeometry.doomAngleYaw(thing.angle)
            };
        }
        return landings;
    }

    // Closes over the polygon array alone, not over the builder.
    static _polygonLookup(sectorPolys) {
        return ((doomX, doomY) => (WadSectorPolygons.smallestContaining(sectorPolys, doomX, doomY)?.si ?? null));
    }

    /**
     * Sector outer polygons, built lazily: with a BSP the tree answers every
     * containment query and this cache is only the fallback.
     *
     * @returns {object[]} [{si, fh, ch, light, tag, special, outers}]
     */
    _sectorPolyCache() {
        if (this._sectorPolys === null) {
            this._sectorPolys = this._buildSectorPolyCache(this._level);
        }

        return this._sectorPolys;
    }

    _buildSectorPolyCache(level) {
        const {vertexes, linedefs, sidedefs, sectors} = level;
        const cache = [];
        for (let si = 0; si < sectors.length; si++) {
            const chains = WadSectorPolygons.buildSectorChains(si, linedefs, sidedefs, vertexes);
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

    // Zones of the damage / push / secret interactions. With a BSP every sector
    // qualifies (unclosed ones included); without, the zones carry their polygon
    // outers. _sectorHeights is read lazily: it is built after the zones.
    _sectorZones(analysis, bspSectorAt, predicate, decorate) {
        const zones = [];
        const pushZone = (si, special, outers) => {
            if (!predicate(si, special)) {
                return;
            }
            const zone = {si: si};
            if (outers !== null) {
                zone.outers = outers;
            }
            if (decorate !== null) {
                decorate(zone, special);
            }
            zones.push(zone);
        };
        if (bspSectorAt !== null) {
            this._level.sectors.forEach((sec, si) => pushZone(si, sec.special, null));
        } else {
            for (const s of this._sectorPolyCache()) {
                pushZone(s.si, s.special, s.outers);
            }
        }
        return new DoomSectorZones(zones, bspSectorAt, (si) => (this._sectorHeights.floorOf(si) * WadConstants.SCALE));
    }

    // BSP first (R_PointInSubsector), then the smallest containing polygon, then
    // the nearest sector within THING_SECTOR_MAX_DIST. {si, fh, ch, light, tag} or null.
    _findSector(doomX, doomY) {
        const bsp = this._level.bspTree;
        if (bsp !== null) {
            const si = bsp.findSector(doomX, doomY);
            if (si !== null) {
                const sec = this._level.sectors[si];
                return {si: si, fh: sec.fh, ch: sec.ch, light: sec.light, tag: sec.tag};
            }
        }
        const contained = WadSectorPolygons.smallestContaining(this._sectorPolyCache(), doomX, doomY);
        if (contained !== null) {
            return {si: contained.si, fh: contained.fh, ch: contained.ch, light: contained.light, tag: contained.tag};
        }

        return this._nearestSideSector(doomX, doomY);
    }

    // Sector on the point's side of the nearest linedef, null beyond THING_SECTOR_MAX_DIST.
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
        // cross < 0: the point is on the front (right) side.
        const side  = WadGeometry.cross2d(a, b, [doomX, doomY]);
        const near  = ((side < 0) ? bestLd.right : bestLd.left);
        const far   = ((side < 0) ? bestLd.left : bestLd.right);
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
