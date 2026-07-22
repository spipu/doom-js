/**
 * Builds the world things (decorations + pickups + monsters) from the level
 * THINGS lump. Each mapped thing becomes a camera-facing Billboard sprite;
 * player / deathmatch starts and teleport landings are left out (not mapped
 * in the catalogs). Monsters resolve through the monster catalog and carry
 * their rotation sets + facing; skill 0 filters them all out.
 *
 * Returns a flat list of placed things; WadWorldBuilder deduplicates the shared
 * Billboard Object3d per sprite and creates one Instance per occurrence.
 */
class WadThingBuilder {
    /**
     * @param {object}             level          parsed level ({things, vertexes, …})
     * @param {object}             catalog        thing catalog exposing getThingForType(type)
     * @param {WadSpriteBank}      spriteBank     decodes sprite lumps to engine textures
     * @param {function}           sectorFinder   (doomX, doomY) → {fh, ch} in Doom units
     * @param {number}             skill          difficulty 0..5 (defaults to 3, HMP)
     * @param {DoomMonsterCatalog} monsterCatalog editor number → DoomMonsterDef (null = no monsters)
     * @param {object}             skillRule      the profile's skillRules()[skill] (null = legacy bits)
     */
    constructor(level, catalog, spriteBank, sectorFinder, skill = 3, monsterCatalog = null, skillRule = null) {
        this._level          = level;
        this._catalog        = catalog;
        this._spriteBank     = spriteBank;
        this._sectorFinder   = sectorFinder;
        this._skill          = skill;
        this._monsterCatalog = monsterCatalog;
        this._skillRule      = skillRule;
        this._skipped      = 0;
        this._filtered     = 0;
        this._monsterCount = 0;
        this._paddedFrames = {};   // anim key → padded frame view
    }

    /**
     * @returns {object[]} {key, texIds, animDuration, halfWidth, height,
     *                      anchorOffsetX, anchorOffsetY, anchorTop, si, light,
     *                      position:[x,y,z], kind, solid, radius, effect}
     */
    buildAll() {
        const result   = [];
        const spawners = {};
        this._skipped      = 0;
        this._filtered     = 0;
        this._monsterCount = 0;

        // Skill bit for the chosen difficulty (Doom P_SpawnMapThing): a thing is
        // present only if its flags carry this bit. The profile's skill rules
        // provide it (skill 0 shares the skill-1 bit); legacy fallback when a
        // caller passes no rule. 0-2 → 0x01, 3 → 0x02, 4-5 → 0x04.
        const skillBit = ((this._skillRule !== null)
            ? this._skillRule.spawnFilterBit
            : ((this._skill <= 2) ? 0x01 : ((this._skill === 3) ? 0x02 : 0x04)));
        const monstersEnabled = ((this._skillRule !== null) ? (this._skillRule.monstersEnabled === true) : true);

        for (const thing of this._level.things) {
            // Monsters route through their own catalog, before the world
            // things: same multiplayer/skill filters, plus the skill-0 kill
            // switch ("Labyrinth but no monster").
            const monsterDef = ((this._monsterCatalog !== null) ? this._monsterCatalog.getMonsterForType(thing.type) : null);
            if (monsterDef !== null) {
                // alwaysSpawn bodies (barrels, pods) survive the skill-0
                // monster kill switch — they are scenery you can shoot.
                if (((thing.flags & WadConstants.MTF_NOT_SINGLE) !== 0)
                    || ((thing.flags & skillBit) === 0)
                    || (!monstersEnabled && (monsterDef.getFlags().alwaysSpawn !== true))) {
                    this._filtered++;
                    continue;
                }
                const spot = this._sectorFinder(thing.x, thing.y);
                if (spot === null) {
                    this._skipped++;
                    continue;
                }
                const monsterEntry = this._buildMonsterEntry(thing, monsterDef, spot);
                if (monsterEntry !== null) {
                    result.push(monsterEntry);
                    this._monsterCount++;
                }
                continue;
            }

            const desc = this._catalog.getThingForType(thing.type);
            if (desc === null) {
                continue;
            }

            // Spawner things are gathered per group BEFORE the single-player /
            // skill filtering: vanilla Heretic collects its mace spots at the
            // top of P_SpawnMapThing, so the multiplayer-only flag most spots
            // carry never applies to them. Only ONE random occurrence per
            // group materializes (a single mace per level).
            if (desc.spawnerGroup !== null) {
                const spot = this._sectorFinder(thing.x, thing.y);
                if (spot === null) {
                    this._skipped++;
                    continue;
                }
                if (spawners[desc.spawnerGroup] === undefined) {
                    spawners[desc.spawnerGroup] = [];
                }
                spawners[desc.spawnerGroup].push({thing, desc, sect: spot});
                continue;
            }

            // Single-player filtering, like the real game: skip multiplayer-only
            // things and things absent at the chosen difficulty.
            if ((thing.flags & WadConstants.MTF_NOT_SINGLE) !== 0) {
                this._filtered++;
                continue;
            }
            if ((thing.flags & skillBit) === 0) {
                this._filtered++;
                continue;
            }

            // No containing/near sector found → drop the thing rather than
            // mis-placing it at height 0.
            const sect = this._sectorFinder(thing.x, thing.y);
            if (sect === null) {
                this._skipped++;
                continue;
            }

            const entry = this._buildEntry(thing, desc, sect);
            if (entry !== null) {
                result.push(entry);
            }
        }

        for (const group of Object.keys(spawners)) {
            const candidates = spawners[group];
            const pick  = candidates[Math.floor(Math.random() * candidates.length)];
            const entry = this._buildEntry(pick.thing, pick.desc, pick.sect);
            if (entry !== null) {
                result.push(entry);
            }
        }

        return result;
    }

    // World descriptor of one placed thing; null when the WAD lacks every
    // sprite frame.
    _buildEntry(thing, desc, sect) {
        const scale = WadConstants.SCALE;

        // Decode every animation frame; skip frames the WAD lacks, skip the
        // whole thing only if no frame is present.
        const sprites = desc.frames.map((name) => this._spriteBank.get(name)).filter((s) => (s !== null));
        if (sprites.length === 0) {
            return null;
        }

        const view = this._frameView(desc, sprites);
        const geo  = WadGeometry.spriteBillboardData(view);
        // Hanging things anchor their top to the ceiling; the rest stand on the floor.
        const baseH = ((desc.ceiling) ? sect.ch : sect.fh);

        // Doom places the sprite top at floor+topOffset, so the foot lands at
        // topOffset-height — often a few px below the floor. Vanilla never
        // clips this vertically (no free look); like modern ports we floor-clip
        // floor things so feet never sink below the sector floor. Hanging things
        // keep their (negative) offset so they stay below the ceiling.
        const sink = view.topOffset - view.height;

        return {
            key:           desc.frames.join('|'),
            texIds:        view.texIds,
            animDuration:  desc.animDuration,
            halfWidth:     geo.halfWidth,
            height:        geo.height,
            // The billboard geometry centres the sprite horizontally; the
            // vertical offset is floor-clipped for floor things (see `sink`).
            anchorOffsetX: geo.anchorOffsetX,
            anchorOffsetY: ((desc.ceiling) ? sink : Math.max(0, sink)) * scale,
            anchorTop:     desc.ceiling,
            si:            sect.si,
            light:         sect.light,
            position:      WadGeometry.doomToWorld(thing.x, thing.y, baseH),
            kind:          desc.kind,
            solid:         desc.solid,
            radius:        desc.radius,
            effect:        desc.effect
        };
    }

    // World descriptor of one placed monster. Every spawn frame carries its
    // full rotation set (1 or 8 raw sprite-bank entries): the world builder
    // pre-builds one shared billboard per (frame, rotation) — no padded common
    // canvas, each view keeps its own vanilla anchor (the doomEffects pattern).
    _buildMonsterEntry(thing, def, sect) {
        // The spawn views are the monster's body: without them the monster is
        // dropped. The hurt/death views are optional (freedoom gaps): a state
        // whose views are missing just keeps showing the previous ones.
        const frames = {};
        for (const pair of def.getFramePairs(['spawn'])) {
            const views = this._spriteBank.getFrameRotations(pair.sprite, pair.frame);
            if (views === null) {
                return null;
            }
            frames[DoomMonsterDef.viewKey(pair.sprite, pair.frame)] = views;
        }
        for (const pair of def.getFramePairs(['pain', 'death', 'xdeath'])) {
            if (frames[DoomMonsterDef.viewKey(pair.sprite, pair.frame)] !== undefined) {
                continue;
            }
            const views = this._spriteBank.getFrameRotations(pair.sprite, pair.frame);
            if (views !== null) {
                frames[DoomMonsterDef.viewKey(pair.sprite, pair.frame)] = views;
            }
        }

        const baseH = ((def.isCeiling()) ? sect.ch : sect.fh);

        return {
            kind:     'monster',
            def:      def,
            facing:   thing.angle,
            flags:    thing.flags,   // the ambush bit 0x08 is phase-C data
            frames:   frames,
            si:       sect.si,
            light:    sect.light,
            position: WadGeometry.doomToWorld(thing.x, thing.y, baseH),
            solid:    true,
            radius:   def.getRadius() * WadConstants.SCALE,
            alpha:    def.getAlpha(),
            effect:   null
        };
    }

    // Render view of a thing's frames: texture ids + the box the billboard quad
    // is sized on. The quad is static and the animation only swaps textures on
    // it, so frames of differing boxes would each be rescaled to the first
    // frame's box (vanilla anchors every frame on its own offsets: the brazier
    // flame grows, never the statue). Such frames are recomposed on a common
    // padded canvas; a single frame (or frames sharing one box) passes through.
    _frameView(desc, sprites) {
        const first   = sprites[0];
        const sameBox = sprites.every((s) => (
            (s.width === first.width) && (s.height === first.height)
            && (s.leftOffset === first.leftOffset) && (s.topOffset === first.topOffset)
        ));
        if (sameBox) {
            return {
                texIds:     sprites.map((s) => s.loaderId),
                width:      first.width,
                height:     first.height,
                leftOffset: first.leftOffset,
                topOffset:  first.topOffset
            };
        }

        const key = desc.frames.join('|');
        if (this._paddedFrames[key] === undefined) {
            this._paddedFrames[key] = this._padFrames(sprites);
        }

        return this._paddedFrames[key];
    }

    // Recompose every frame on the union of their vanilla anchor boxes (top at
    // topOffset, centred on leftOffset), each blitted at its exact vanilla
    // position inside transparent padding: all frames share one box and the
    // texture swap never rescales anything.
    _padFrames(sprites) {
        const top   = Math.max(...sprites.map((s) => s.topOffset));
        const foot  = Math.min(...sprites.map((s) => (s.topOffset - s.height)));
        const left  = Math.max(...sprites.map((s) => s.leftOffset));
        const right = Math.max(...sprites.map((s) => (s.width - s.leftOffset)));
        const w = left + right;
        const h = top - foot;

        const texIds = sprites.map((spr) => {
            const src    = loader.textures().get(spr.loaderId);
            const padded = new ImageData(w, h);
            const dx     = left - spr.leftOffset;
            const dy     = top - spr.topOffset;
            for (let row = 0; row < spr.height; row++) {
                const srcStart = row * spr.width * 4;
                padded.data.set(
                    src.data.subarray(srcStart, srcStart + (spr.width * 4)),
                    (((row + dy) * w) + dx) * 4
                );
            }

            return loader.textures().loadFromData(null, padded);
        });

        return {texIds, width: w, height: h, leftOffset: left, topOffset: top};
    }

    // Number of mapped things dropped because no sector was found (call after buildAll).
    getSkipped() {
        return this._skipped;
    }

    // Number of mapped things filtered out by skill / multiplayer flag (call after buildAll).
    getFiltered() {
        return this._filtered;
    }

    // Number of monsters placed (call after buildAll).
    getMonsterCount() {
        return this._monsterCount;
    }
}
