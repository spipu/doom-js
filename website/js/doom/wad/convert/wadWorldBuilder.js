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
     * @param {object}  options - {onLevelExit: function, thingCatalog: object, skill: number, game: DoomGame, profile: AbstractGameProfile}
     *                  onLevelExit is wired on the exit switches; thingCatalog
     *                  (DoomGame) maps THING types to world sprites/pickups; skill
     *                  (1..5, default 3) drives the single-player thing filtering;
     *                  game receives the level stats (secrets) and pickups;
     *                  profile carries the per-game policy (Doom by default).
     */
    constructor(wadFile, levelName, options = null) {
        options = options ?? {};

        this._wadFile        = wadFile;
        this._levelName      = levelName;
        this._onLevelExit    = options.onLevelExit ?? null;
        this._thingCatalog   = options.thingCatalog ?? null;
        this._skill          = options.skill ?? 3;
        this._game           = options.game ?? null;
        this._profile        = options.profile ?? new DoomGameProfile();
        this._monsterCatalog = options.monsterCatalog ?? null;
        this._monsterSystem  = options.monsterSystem ?? null;
        this._level          = null;
        this._sectorPolys    = null;   // walked on demand, see _sectorPolyCache
    }

    // Async only to yield to the browser between the heavy phases, so the
    // loading modal stays painted. The engine registration itself is synchronous.
    async build() {
        // Per-game policy FIRST: the profile's table extensions land in the
        // WadConstants baseline, then the xlat rewrites the level specials —
        // every analyzer/builder/interaction only ever sees internal codes.
        WadConstants.applyGameExtensions(this._profile.wadConstantsExtensions());

        const palette  = new WadPalette(this._wadFile);
        const bank     = new WadTextureBank(this._wadFile, palette, this._profile).init();
        const animBank = new WadAnimationBank(this._wadFile, bank, this._profile).init();

        const level    = new WadLevelParser(this._wadFile, this._levelName).parse();
        // BSP tree (null on missing/foreign lumps → chain-polygon fallback):
        // subsector flats stay correct on UNCLOSED sectors (MAP21 sector 50).
        level.bspTree = WadBspTree.build(level);
        new WadSpecialTranslator(this._profile).translate(level);
        const bossActions = this._levelBossActions();
        const analysis = new WadMapAnalyzer(level, {
            bossLinedefs:    this._bossVirtualLinedefs(level, bossActions),
            textureHeightOf: ((name) => bank.wallTextureHeight(name))
        }).analyze();
        this._level       = level;
        this._sectorPolys = null;   // walked on demand, see _sectorPolyCache

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
            this._applyDoorUseGuard(door, level);
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
            const interaction = new DoomSwitchInteraction(spec.code, spec.targets, spec.mode, spec.tOn, spec.tOff, spec.reverseTargets, spec.cycleVariant, spec.restIndex, spec.swapIndex);
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
            this._applyCrossingGuard(wt);
            const spec = wt.interactionSpec;
            const interaction = new DoomWalkTriggerInteraction(spec.code, spec.targets, spec.reverseTargets, spec.stop, spec.cycleVariant);
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
            this._applyCrossingGuard(tp);
            loader.interactions().loadFromData(
                new DoomTeleportInteraction(tp.interactionSpec.code, tp.interactionSpec.destination, this._monsterSystem, this._game));
        }
        await this._yield();

        // Sector membership test of the runtime zone interactions: with a BSP
        // it is the tree itself (exact, unclosed sectors included) and EVERY
        // sector carrying the special becomes a zone; without it the polygon
        // outers stay both the filter and the runtime test.
        const bspTree  = level.bspTree;
        const sectorAt = ((bspTree !== null)
            ? ((doomX, doomY) => bspTree.findSector(doomX, doomY))
            : null);

        // Sector damage (sector specials 4/5/7/16/11): one per-level interaction
        // polling the player's sector every 32-tic window. The "+change" target
        // sectors are included too (their special mutates at runtime); a lift's
        // zone sits at the ORIGINAL floor (the platform rests up, the static fh
        // is patched down).
        const damageZones = this._sectorZones(analysis, sectorAt,
            (si, special) => ((WadConstants.SECTOR_DAMAGE_BY_SPECIAL[special] !== undefined)
                || (analysis.floorChange[si] !== undefined)),
            (zone, special) => {
                zone.special = special;
            });
        let damageInteraction = null;
        if (damageZones.list.length > 0) {
            damageInteraction = new DoomSectorDamageInteraction(damageZones, this._onLevelExit);
            loader.interactions().loadFromData(damageInteraction);
        }

        // Sector pushes (wind / conveyors) and low-friction ground: one
        // per-level interaction feeding the player's ActorExternalForces each
        // frame. Same zone shape as the damage interaction; the tables are
        // empty outside the game profiles that fill them (Heretic).
        const pushZones = this._sectorZones(analysis, sectorAt,
            (si, special) => ((WadConstants.SECTOR_PUSH_BY_SPECIAL[special] !== undefined)
                || (WadConstants.SECTOR_FRICTION_BY_SPECIAL[special] !== undefined)),
            (zone, special) => {
                zone.push     = (WadConstants.SECTOR_PUSH_BY_SPECIAL[special] ?? null);
                zone.friction = (WadConstants.SECTOR_FRICTION_BY_SPECIAL[special] ?? null);
            });
        if (pushZones.list.length > 0) {
            loader.interactions().loadFromData(new DoomSectorPushInteraction(pushZones, this._monsterSystem));
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
        const secretZones = this._sectorZones(analysis, sectorAt,
            (si, special) => (special === WadConstants.SECTOR_SECRET_SPECIAL), null);
        if (this._game !== null) {
            this._game.setSecretsTotal(secretZones.list.length);
            if (secretZones.list.length > 0) {
                loader.interactions().loadFromData(new DoomSecretInteraction(secretZones, this._game));
            }
            // Sector-light lookup: shades the weapon view sprite by the
            // player's sector, pulsing with the sector's light effect through
            // the interaction's live factor. It locates the player through the
            // BSP when there is one, and only falls back on the polygon cache
            // (built on demand) otherwise.
            this._game.setSectorLight(new DoomSectorLight(
                ((sectorAt !== null) ? null : this._sectorPolyCache()), lightInteraction,
                sectorAt, level.sectors));
        }

        // "+change" floors: swap the moving top-flat texture (and the sector's
        // damage special) when the movement starts or completes.
        this._wireFloorChanges(analysis, animBank, builtLiftCodes, builtRisingCodes, damageInteraction);

        // Things (decorations + pickups) as billboard sprites
        const builtFloorCodes = new Set([...builtLiftCodes, ...builtRisingCodes, ...builtStairCodes]);
        const things = this._registerThings(level, palette, analysis, builtFloorCodes);
        await this._yield();

        // One height service for the monsters and the map, carried by this data.
        const levelData = this._buildMonsterLevelData(level, analysis, builtFloorCodes, builtDoorCodes, walkTriggers, teleporters, landings, lightInteraction);
        if (this._monsterSystem !== null) {
            this._monsterSystem.setLevelData(levelData).setExitCallback(this._onLevelExit);
        }
        this._registerAutomap(level, levelData.heights);
        const bossRules = this._wireBossDeath(bossActions, level, analysis, builtLiftCodes, builtRisingCodes, builtDoorCodes, builtStairCodes);
        this._wireBossBrain();

        // World + user
        loader.world().loadFromData(this._buildDefinition(level, bank));

        console.log('WadWorldBuilder - ' + this._levelName + ' [profile ' + this._profile.getCode() + ']: '
            + bank.count() + ' textures, ' + doors.length + ' doors, '
            + lifts.length + ' lifts, ' + risingFloors.length + ' rising, '
            + stairs.length + ' stairs, '
            + switches.length + ' switches, ' + walkTriggers.length + ' walk-triggers, '
            + teleporters.length + ' teleporters, ' + bossRules + ' boss rules, '
            + things.count + ' things (' + things.skipped + ' skipped, '
            + things.filtered + ' filtered, ' + things.monsters + ' monsters, skill ' + this._skill + ')');

        if (bspTree !== null) {
            bspTree.releaseBuildData();
        }
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
            // Out-of-range dev-starter skill → null → the builder's legacy
            // bit fallback (monsters stay enabled).
            (this._profile.skillRules()[this._skill] ?? null)
        );
        const things = builder.buildAll();

        const billboardIds        = {};
        const monsterBillboardIds = {};
        let   killsTotal          = 0;
        let   itemsTotal          = 0;
        // vanilla total_items: fixed at load from the MAP things alone, so the
        // drops spawned later can never inflate it (P_SpawnMobj).
        const countedItems = this._profile.countedItemTypes();
        for (let i = 0; i < things.length; i++) {
            const t = things[i];
            if (t.kind === 'monster') {
                this._registerMonsterThing(t, i, analysis, builtFloorCodes, monsterBillboardIds);
                if (t.def.getFlags().countsKill !== false) {
                    killsTotal++;
                }
                continue;
            }
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
            const isPickup   = (t.kind === 'pickup');
            const countsItem = (isPickup && countedItems.has(t.type));
            const code       = ((isPickup) ? 'pickup_' + i : 'thing_' + i);
            if (countsItem) {
                itemsTotal++;
            }
            // A thing standing on a moving floor spawns at the floor's ORIGINAL
            // height (the sector fh was patched to the low position for the
            // static map) and rides the floor instance (vanilla: things follow
            // their sector floor — a chainsaw on a donut pillar rides it down).
            const ride = this._resolveThingFloor(t, analysis, builtFloorCodes);
            const position = [t.position[0], t.position[1] + ride.liftY, t.position[2]];
            loader.instances().loadFromData(null, {
                code:                  code,
                object:                billboardIds[objKey],
                position:              position,
                rotation:              [0, 0, 0],
                trigger:               ((isPickup) ? 'proximity' : 'none'),
                loop:                  false,
                // Not onlyOnce: an un-consumed pickup (full health, owned weapon)
                // must stay grabbable when the player returns — it re-tests every
                // frame it is overlapped (like Doom's P_TouchSpecialThing) and is
                // despawned only once actually consumed.
                onlyOnce:              false,
                collisionShape:        ((t.solid) ? 'box' : 'none'),
                collisionRadius:       t.radius,
                // A pickup reaches in a cylinder, so a key on a ledge is taken
                // from the floor below: vanilla never mixes the footprint with
                // the vertical reach (PIT_CheckThing / P_TouchSpecialThing).
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
            // A pickup with no game (catalog-less build) keeps the sprite but
            // never fires — harmless. With a game, wire its effect interaction.
            if (isPickup && (this._game !== null)) {
                loader.interactions().loadFromData(new DoomPickupInteraction(code, t.effect, this._game, countsItem));
            }
        }
        if (this._game !== null) {
            this._game.setKillsTotal(killsTotal);
            this._game.setItemsTotal(itemsTotal);
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
     * Billboard OBJECT per (sprite view, alpha, ceiling anchor), deduplicated
     * across the level. The alpha and the ceiling flag belong in the key: the
     * spectre shares the demon's SARG lumps and the Heretic ghosts share their
     * base monsters', and the flag decides which end of the quad is anchored.
     *
     * @returns {object} view key → array of object ids (one per rotation)
     */
    _monsterBillboards(frames, alpha, ceiling, billboardIds) {
        const scale = WadConstants.SCALE;
        const out   = {};
        for (const viewKey of Object.keys(frames)) {
            out[viewKey] = frames[viewKey].map((spr) => {
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
                        alpha:         alpha
                    });
                }

                return billboardIds[objKey];
            });
        }

        return out;
    }

    // Views of the monsters this game spawns mid-fight (the elemental's lost
    // souls, D'Sparil rising out of his mount), built INSIDE the batch like
    // every other template — a body born during a fight has no chance to load
    // a sprite. They go through the SAME billboard construction as the placed
    // bodies: the monster system spawns instances, which want object ids.
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
            const views = DoomMonsterFrames.build(def, spriteBank);
            if (views !== null) {
                catalog[code] = {
                    def:    def,
                    frames: this._monsterBillboards(views, def.getAlpha(), def.isCeiling(), billboardIds)
                };
            }
        }
        this._monsterSystem.setSpawnables(catalog);
    }

    // Flattened-corpse billboard (vanilla S_GIBS pool, what a corpse ground by
    // a mover turns into), built INSIDE the batch like the drop templates.
    // Probed quietly: a profile without one (Heretic) or a WAD lacking the
    // sprite leaves the corpses untouched.
    _registerCrushedCorpseView(spriteBank) {
        if (this._monsterSystem === null) {
            return;
        }
        const lump = this._profile.crushedCorpseSprite();
        if ((lump === null) || !spriteBank.has(lump)) {
            this._monsterSystem.setCrushedCorpseView(null);
            return;
        }
        this._monsterSystem.setCrushedCorpseView(this._groundSpriteBillboard(spriteBank.get(lump)));
    }

    // Floor-anchored sprite billboard, shared by the batch templates (drop
    // pickups, crushed corpse): the sprite offset overflow hangs above the
    // floor, never below. Baked fullbright with no light group like the
    // monster views: the spawn sector is unknown here, so the monster system
    // pushes the sector lighting per instance (the crushed corpse keeps its
    // monster's instance and inherits it).
    _groundSpriteBillboard(spr) {
        const geo = WadGeometry.spriteBillboardData(spr);
        return loader.objects().loadBillboardFromData(null, {
            billboard:     true,
            textures:      [spr.loaderId],
            halfWidth:     geo.halfWidth,
            height:        geo.height,
            anchorOffsetX: geo.anchorOffsetX,
            anchorOffsetY: Math.max(0, spr.topOffset - spr.height) * WadConstants.SCALE,
            anchorTop:     false,
            light:         255
        });
    }

    // Pickup templates for everything this level's monsters can drop, built
    // INSIDE the batch (billboards + one DoomPickupInteraction per distinct
    // item/amount pair — an interaction cannot register at runtime, only the
    // drop instances spawn at death). The catalog is handed to the monster
    // system, keyed like DoomMonsterSystem._spawnDrops looks it up.
    _registerMonsterDrops(things, spriteBank) {
        if ((this._monsterSystem === null) || (this._game === null)) {
            return;
        }
        const types   = this._profile.dropItemTypes();
        const catalog = {};
        for (const t of things) {
            if (t.kind !== 'monster') {
                continue;
            }
            for (const d of t.def.getDropItems()) {
                const key = DoomMonsterSystem.dropKey(d);
                if ((catalog[key] !== undefined) || (types[d.item] === undefined)) {
                    continue;
                }
                const type = types[d.item];
                const spr  = spriteBank.get(type.sprite);
                if (spr === null) {
                    continue;
                }
                const effect = ((type.effect !== undefined) ? type.effect : {ammo: type.ammoType, amount: (d.amount ?? 0)});
                const code   = 'drop_' + d.item + '_' + (d.amount ?? 'x');
                catalog[key] = {
                    code:  code,
                    objId: this._groundSpriteBillboard(spr)
                };
                loader.interactions().loadFromData(new DoomPickupInteraction(code, effect, this._game));
            }
        }
        this._monsterSystem.setDrops(catalog);
    }

    // One monster: a shared billboard per (rotation view, alpha, ceiling anchor)
    // — each view keeps its own vanilla anchor, the runtime swaps the instance
    // object per frame/octant (the doomEffects pattern, no padded canvas). The
    // alpha MUST be part of the dedup key: the spectre shares the demon's SARG
    // lumps and the Heretic ghosts share their base monsters' sprites; the
    // ceiling flag too, since it decides the vertical anchoring of the quad.
    //
    // Views are baked at FULL light with no light group: a body MOVES, so
    // DoomMonsterSystem pushes its lighting per instance from the sector it
    // currently stands in. Baking the spawn sector here would freeze it.
    _registerMonsterThing(t, i, analysis, builtFloorCodes, billboardIds) {

        const frames = this._monsterBillboards(t.frames, t.alpha, t.def.isCeiling(), billboardIds);

        const code  = 'monster_' + i;
        const ride  = this._resolveThingFloor(t, analysis, builtFloorCodes);
        const idle0 = t.def.getState('spawn0');
        loader.instances().loadFromData(null, {
            code:            code,
            object:          frames[DoomMonsterDef.viewKey(idle0.getSprite(), idle0.getFrame())][0],
            position:        [t.position[0], t.position[1] + ride.liftY, t.position[2]],
            rotation:        [0, 0, 0],
            trigger:         'none',
            loop:            false,
            onlyOnce:        false,
            // +NOBLOCKMAP (the Icon of Sin's eye): a body nothing collides
            // with — it blocks neither the player nor a shot.
            collisionShape:  ((t.def.getFlags().noBlockmap === true) ? 'none' : 'box'),
            collisionRadius: t.radius,
            keyframes:       []
        });
        const inst = loader.instances().getByCode(code);
        if (ride.floorCode !== null) {
            inst.setRideOn(loader.instances().getByCode(ride.floorCode));
        }
        if (this._monsterSystem !== null) {
            const spawnPos = [t.position[0], t.position[1] + ride.liftY, t.position[2]];
            this._monsterSystem.add({
                code:   code,
                inst:   inst,
                def:    t.def,
                facing: t.facing,
                flags:  t.flags,
                frames: frames,
                si:     t.si,
                // Nightmare respawn returns the monster to its ORIGINAL map
                // spot with its THINGS facing and ambush flag (P_NightmareRespawn)
                spawn:  {position: spawnPos, facing: t.facing, flags: t.flags, si: t.si}
            });
        }
    }

    // The reveal IS a BSP walk, so no valid nodes means no map. The tree's
    // presence is the validity gate: it checked the lumps.
    _registerAutomap(level, heights) {
        if ((this._game === null) || (level.bspTree === null)) {
            return;
        }
        this._game.setAutomap(new DoomAutomap(new WadAutomapBuilder(level).build(), heights));
    }

    // Level data of the monster AI, plus the sector-height service built from
    // it: sector graph, REJECT table, sector resolver over the polygon cache
    // (kept alive by the closure, like the sector-light handoff), the
    // effective-height inputs of the sound flood (static sector heights, door
    // panel floors, resting floor heights of the patched lifts), the mover
    // instance code of every moving sector (codes only listed when actually
    // built: getByCode never throws downstream), and the lines a monster may
    // fire by CROSSING them during a walk step (vanilla P_CrossSpecialLine:
    // the shared walk zones 4/10/88, consumed for everyone, and the teleports
    // — 39/97 shared, 125/126 monster-only).
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
                // Monster-usable as soon as ONE face is a plain manual door
                // (the analyzer accumulates it per face): a keyed face on the
                // same sector does not lock the free one out.
                moverCodes[si] = {
                    kind:       'door',
                    code:       'door_' + si,
                    monsterUse: (props.monsterUse === true)
                };
            }
        }
        const monsterLines = [];
        const vx = level.vertexes;
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
                once:     (WadConstants.WALK_TRIGGER_ONCE_BY_SPECIAL[wt.special] === true),
                used:     false,
                zoneCode: 'walk_' + wt.ldIdx
            });
        }

        const data = {
            sectorGraph:  analysis.sectorGraph,
            reject:       level.reject,
            numSectors:   level.sectors.length,
            findSector:   ((doomX, doomY) => this._findSector(doomX, doomY)),
            sectors:      level.sectors,
            doorFloorH:   doorFloorH,
            restFh:       analysis.liftOriginalFh,
            moverCodes:   moverCodes,
            monsterLines: monsterLines,
            // Positions the game aims at, by group: where D'Sparil reappears
            // ('bossSpot'), where the Icon of Sin sends its cubes ('bossTarget').
            spots:        (this._spots ?? {}),
            levelName:    this._levelName,
            // mapinfo `allowmonstertelefrags`: on this map a teleporting
            // monster stomps whoever holds its arrival spot.
            monstersTelefrag: this._profile.monsterTelefragMaps().includes(this._levelName),
            // Live brightness factor of a sector (1 without a light effect),
            // the very source the weapon shading reads.
            lightFactorOf: ((si) => ((lightInteraction !== null) ? lightInteraction.getFactor(si) : 1)),
            // Whether a sector's brightness moves on its own (light thinker):
            // its bodies must then be re-lit every frame, the others only on a
            // sector or state change.
            hasLightEffect: ((si) => analysis.lightSectorIds.has(si))
        };
        // The sound flood, the mover pressure and the map share this instance.
        data.heights = new DoomSectorHeights(data);

        return data;
    }

    // Moving floor under a thing: the built lift / rising-floor / stair
    // instance of the thing's sector, plus the Y shift back to the ORIGINAL
    // floor height for the lowered lifts (their sector fh is patched down for
    // the static map, but the platform RESTS at its original height). The
    // thing then rides that instance (setRideOn), box blocker of a solid
    // decoration included (Collision.syncRidingBoxes).
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
            // The flat swap needs both sequences resolved; the special change
            // does not (vanilla posts sector->special independently of the
            // floorpic) and must survive an unresolvable flat.
            const swapFlats = ((oldSeq.ids.length > 0) && (newSeq.ids.length > 0));
            if (!swapFlats && ((change.special === null) || (damageInteraction === null))) {
                continue;
            }
            const newAnim = ((swapFlats && (newSeq.ids.length > 1))
                ? {ids: newSeq.ids, duration: newSeq.duration, durationMs: Math.round(newSeq.duration * 1000)}
                : null);
            const targetFh = analysis.risingFloorTargetFh[si] ?? analysis.liftMinAdjFh[si];
            const inst  = loader.instances().getByCode(code);
            const apply = () => {
                if (swapFlats) {
                    inst.getObject().faceList.forEach((fc) => {
                        const animated = (fc.animTextures !== null && fc.animTextures !== undefined
                            && fc.animTextures.ids.some((id) => oldSeq.ids.includes(id)));
                        if (animated || oldSeq.ids.includes(fc.textureId)) {
                            fc.textureId    = newSeq.ids[0];
                            fc.animTextures = newAnim;
                        }
                    });
                    inst.getObject().invalidateFaceGroups();
                }
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

    // Locked switches (the blaze 99/133-137) only fire if the player holds the
    // key: the engine calls this opaque predicate before the trigger (the
    // runtime user is a DoomUser), like vanilla EV_DoLockedDoor checking the
    // keys at USE time. A switch is one linedef, so its key needs no face
    // arbitration — doors go through _applyDoorUseGuard instead.
    _applyKeyGuard(built) {
        const keyCode = built.instanceData.keyRequired;
        if (keyCode) {
            loader.instances().getByCode(built.code).addTriggerCondition((user) => user.hasItem(keyCode));
        }
    }

    // A_BossDeath actions of this level, from the profile — a 'MAP07-1' /
    // 'MAP07-2' suffix distinguishes two boss groups on one map.
    _levelBossActions() {
        const actions = this._profile.bossActions();
        const result = [];
        for (const key of Object.keys(actions)) {
            if (key.split('-')[0] === this._levelName) {
                result.push({key: key, ...actions[key]});
            }
        }
        return result;
    }

    // Vanilla fires these actions from code on a dummy line: when no real
    // mover linedef aims at the tag, a virtual one makes the analyzer build
    // the mover (E1M8's 666 block has no linedef at all). Where the WAD
    // carries its own line (MAP07's 666), the author's line wins.
    _bossVirtualLinedefs(level, bossActions) {
        const isMover = (sp) => ((WadConstants.DOOR_BY_SPECIAL[sp] !== undefined)
            || WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(sp)
            || WadConstants.FLOOR_MOVE_UP_SPECIALS.has(sp));
        const virtual = [];
        for (const action of bossActions) {
            if (action.exit === true) {
                continue;
            }
            if (!level.linedefs.some((ld) => ((ld.tag === action.tag) && isMover(ld.special)))) {
                // v1/v2 = -1: an accidental vertex read fails loudly (undefined
                // destructuring) instead of producing silent NaN geometry.
                virtual.push({special: action.special, tag: action.tag, left: -1, right: -1, v1: -1, v2: -1});
            }
        }
        return virtual;
    }

    // The Icon of Sin's bookkeeping, on the levels that carry its target spots
    // (MAP30 and any PWAD doing the same): the rotation of those spots and the
    // weighted draw of what a cube hatches.
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
            // Same target model as the switch/walk/gun paths: full family list,
            // reverse split and per-special cycle key.
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

    // Walk-over zones and teleport pads fire on a real CROSSING of their
    // linedef (vanilla P_CrossSpecialLine), not on proximity: the engine zone
    // keeps its circle as a broadphase and this guard has the last word.
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
        // A back-side crossing never fires (EV_Teleport), but it still spends
        // a W1 line: vanilla clears the special whatever the outcome
        // (p_spec.c case 39), same rule as the monster path.
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

    // USE rules of a manual door, which vanilla carries per LINEDEF while the
    // engine offers one radius around the whole body. The nearest OPENING of
    // the door (its two-sided faces — the jambs are walls nobody presses
    // through) stands in for the line P_UseSpecialLine would pick, and it alone
    // answers:
    //  - a face carrying no manual door special answers nothing, so a door
    //    whose special sits on one linedef only is not openable from the other
    //    corridor (E1M2's tag-7 door: by hand from its own side, by its switch
    //    from anywhere else), and a shootable face (46) stays deaf to USE —
    //    vanilla ignores the impact specials there (E1M2's vent door);
    //  - it is usable from its FRONT side alone (`if (side) return false`);
    //  - it demands the key IT carries, so a sector mixing a locked face and a
    //    free one keeps both (E1M7's yellow doors open freely from inside,
    //    E3M7's red ones stay locked from the corridor).
    // A door with no usable opening keeps the plain radius: its press is the
    // timer-sector cycle replay, which no linedef declares.
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
            // Front side only: cross < 0 is the right sidedef (see
            // _nearestSideSector), i.e. the face vanilla lets a press through.
            if (WadGeometry.cross2d([nearest.x1, nearest.z1], [nearest.x2, nearest.z2], [user.x, user.z]) > 0) {
                return false;
            }

            return ((nearest.key === null) || user.hasItem(nearest.key));
        });
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
        const skyPolicy = this._profile.skyForLevel(this._levelName);
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

    // Solid "cap" colours derived like modern ports from the sky texture rows
    // (vanilla Doom has no such field): the TOP row average is the scene
    // background (above the sky band, CPU sky holes), the BOTTOM row average
    // fills below the horizon (sky floors, looking down past the band) — so
    // both seams with the texture stay smooth.
    _skyCapColor(loaderId, row = 'top') {
        const tex = loader.textures().get(loaderId);
        const d = tex.data;
        const w = tex.width;
        const rowStart = ((row === 'bottom') ? (4 * w * (tex.height - 1)) : 0);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let x = 0; x < w; x++) {
            const p = rowStart + 4 * x;
            r += d[p];
            g += d[p + 1];
            b += d[p + 2];
        }

        return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    }

    // Player spawn from the THINGS lump (type 1 = Player 1 start).
    // Doom angle 0 = east, 90 = north; engine yaw 0 = north (+Z), 90 = east (+X).
    // The spawn Y is the floor height of the spawn sector + a small snap margin
    // (the fixed 0.3 of the Python script only worked for floors near 0).
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
            yaw: WadGeometry.doomAngleYaw(player1.angle)
        };
    }

    // Teleport landings: every thing type 14, mapped by the tag of the sector
    // that contains it, to a world-space destination {x, y, topY, z, yaw}.
    // The arrival height is resolved LIVE at teleport time (EV_Teleport lands
    // at ONFLOORZ — the landing sector may be a mover): topY = the sector
    // ceiling, the search top for the runtime floor lookup (never patched,
    // never below its floor); y = the build-time floor + snap margin, kept as
    // the fallback when no floor answers.
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
                x:    t.x * SCALE,
                y:    sec.fh * SCALE + 0.3,
                topY: sec.ch * SCALE,
                z:    t.y * SCALE,
                yaw:  WadGeometry.doomAngleYaw(t.angle)
            };
        }
        return landings;
    }

    /**
     * Sector outer polygons + floor/ceiling/light, walked once and memoized:
     * _findSector is then a cheap point test per thing instead of rebuilding
     * polygons. Lazy on purpose — with a usable BSP the tree answers every
     * containment query (sectorAt) and this cache is only the fallback path,
     * so building it up front would walk every sector's linedef chains for
     * nothing on every level.
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

    // Zones of the runtime sector interactions (damage / push / secret),
    // behind the shared DoomSectorZones locator. With a BSP every sector
    // carrying the special is a zone (membership is the tree, so the unclosed
    // sectors the polygon cache dropped are back in — secret total included);
    // without it, the cache stays the filter and the zones carry their polygon
    // outers for the runtime test.
    _sectorZones(analysis, sectorAt, predicate, decorate) {
        const zones = [];
        const pushZone = (si, fh, special, outers) => {
            if (!predicate(si, special)) {
                return;
            }
            const zone = {si: si, floorY: (analysis.liftOriginalFh[si] ?? fh) * WadConstants.SCALE};
            if (outers !== null) {
                zone.outers = outers;
            }
            if (decorate !== null) {
                decorate(zone, special);
            }
            zones.push(zone);
        };
        if (sectorAt !== null) {
            this._level.sectors.forEach((sec, si) => pushZone(si, sec.fh, sec.special, null));
        } else {
            for (const s of this._sectorPolyCache()) {
                pushZone(s.si, s.fh, s.special, s.outers);
            }
        }
        return new DoomSectorZones(zones, sectorAt);
    }

    // Find the sector at a point. BSP path first (R_PointInSubsector — the
    // vanilla answer, O(log n), correct on unclosed sectors); its null
    // (unattributed leaf) and the no-BSP case fall back to the polygon walk:
    // smallest containing outer (nested sectors — the cache's outers keep the
    // holes inside), then the nearest sector within THING_SECTOR_MAX_DIST,
    // beyond which the caller drops the thing rather than mis-placing it.
    // Returns {si, fh, ch, light, tag} (Doom units) or null.
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
