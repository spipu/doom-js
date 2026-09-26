/**
 * The effect templates of a level: each one's frame billboards, pre-built once
 * in the loader batch, and the rules its spawns follow (drift, gravity,
 * landing, first-frame shortening, melee start, spawn sound). All the data
 * comes from the game profile's effectTemplates(). Built by every device: the
 * simulation reads the rules to draw what a spawn draws, the presentation
 * animates the frames.
 */
class DoomEffectTemplates {
    constructor(spriteBank, profile) {
        this._templates = this._buildTemplates(spriteBank, profile);
    }

    /**
     * @returns {object|null} the template, null when the profile has none of
     *                        that name or the WAD lacks its graphics
     */
    get(name) {
        return (this._templates[name] ?? null);
    }

    /**
     * One more template, built after construction from a bank of its own — the
     * generic splash bakes a set of frames per liquid flat, which only the
     * level knows. Like every other template it must be registered inside the
     * load batch.
     *
     * @param {object} bank has(lump) / get(lump), as a sprite bank answers
     * @param {object} spec an effectTemplates() entry
     */
    addTemplate(bank, spec) {
        this._templates[spec.name] = this._buildTemplate(bank, spec);

        return this;
    }

    _buildTemplates(bank, profile) {
        const templates = {};
        for (const spec of profile.effectTemplates()) {
            templates[spec.name] = this._buildTemplate(bank, spec);
        }
        return templates;
    }

    // One shared billboard object per distinct letter (a fog animation repeats
    // letters); null if the WAD lacks any of the graphics (probed quietly —
    // another game's WAD misses them all, no warning spam).
    // Every frame carries its OWN vanilla anchor (R_ProjectSprite draws a
    // sprite with its left edge at -leftoffset and its top at +topoffset
    // around the mobj point), so frames of different sizes all align on that
    // point and the runtime frame swap (setObject) never shifts the animation.
    _buildTemplate(bank, spec) {
        const landing = (spec.landing ?? null);
        const letters = spec.letters.concat(((landing !== null) ? landing.letters : []));
        for (const letter of letters) {
            if (!bank.has(spec.sprite + letter + '0')) {
                return null;
            }
        }
        // One shared map for both timelines: a chunk replays on landing the
        // very frame its flight ended on, and must not build it twice.
        const byLetter = new Map();
        const frames   = this._buildFrames(bank, spec, spec.letters, byLetter, false);
        // The first-frame tic shortening is a Doom-family quirk (P_SpawnPuff /
        // P_SpawnBlood under GAME_DoomChex): drifting templates get it unless
        // the spec opts out (Heretic blood).
        return {
            frames,
            frameTics:   spec.frameTics,
            // Frames played where a ballistic effect meets the floor (the
            // Death state of a splash chunk); null = it never lands.
            landing:     ((landing !== null)
                ? {frames: this._buildFrames(bank, spec, landing.letters, byLetter), frameTics: landing.frameTics}
                : null),
            // The same timelines mirrored left to right, when the spec asks for
            // them: the caller then draws which way each spawn faces, so a
            // repeated effect stops stamping the identical picture. null = the
            // effect only ever faces one way.
            mirrored:    ((spec.mirror === true) ? this._buildMirrored(bank, spec, landing) : null),
            rise:        spec.rise,
            gravity:     (spec.gravity ?? 0),
            shorten:     (spec.shorten ?? (spec.rise > 0)),
            // Sound(s) started at the effect's birth, positioned on it — the
            // A_StartSound lines of an effect ACTOR's states (the vile fire).
            spawnSound:  ((spec.spawnSound !== undefined) ? [].concat(spec.spawnSound) : null),
            meleeStart:  spec.meleeStart ?? 0,
            // P_SpawnTeleportFog raises the fog by gameinfo telefogheight
            // (Doom 0, Raven 32); stored pre-scaled to world units.
            spawnHeight: (spec.spawnHeight ?? 0) * WadConstants.SCALE
        };
    }

    // The mirrored twin of a template's timelines, with a letter map of its
    // own: the same letter is a different billboard on each side.
    _buildMirrored(bank, spec, landing) {
        const byLetter = new Map();

        return {
            frames:  this._buildFrames(bank, spec, spec.letters, byLetter, true),
            landing: ((landing !== null)
                ? {frames: this._buildFrames(bank, spec, landing.letters, byLetter, true), frameTics: landing.frameTics}
                : null)
        };
    }

    // Billboards of one timeline, sharing byLetter with the others of the
    // same template so a letter used twice costs a single object. Mirroring
    // flips the anchor with the picture: the offset is measured from the left
    // edge, which becomes the right one.
    _buildFrames(bank, spec, letters, byLetter, flipX = false) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of letters) {
            if (!byLetter.has(letter)) {
                const spr = bank.get(spec.sprite + letter + '0');
                const geo = WadGeometry.spriteBillboardData(spr);
                byLetter.set(letter, loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     geo.halfWidth,
                    height:        geo.height,
                    anchorOffsetX: ((flipX) ? -geo.anchorOffsetX : geo.anchorOffsetX),
                    anchorOffsetY: (spr.topOffset - spr.height) * scale,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                    flipX:         flipX,
                }));
            }
            frames.push({objId: byLetter.get(letter)});
        }

        return frames;
    }
}
