/**
 * The splash of the games that never had one. Heretic describes its water,
 * lava and sludge; the Doom family describes nothing, so its liquids would
 * stay flat under fire. This builds a splash for them out of our own greyscale
 * masks, colourised at level load with the average colour of each liquid flat
 * the level actually uses — the ripple of a nukage pool comes out green, that
 * of a blood pool red, without a single new asset per game.
 *
 * Deliberately NOT a vanilla behaviour, and always on: no game ever shipped
 * these graphics. It stays silent for the same reason — the impact keeps the
 * sound it already had, nothing is added.
 *
 * A flat that already splashes (Heretic's, or one a WAD's TERRAIN lump gave a
 * splash to) is left alone: this only fills the silence.
 *
 * The masks, their anchors and their timings are declared by the game profile
 * (genericSplash); everything here reads them. A whole frame set is baked once
 * PER LIQUID FLAT of the level, so the masks are authored at the resolution
 * they are drawn at — an oversized one would cost its texture as many times
 * over as the level has liquids.
 */
class DoomGenericSplash {
    /**
     * @param {DoomImageAssets}     assets  decoded masks, kept across levels
     * @param {DoomEffects}         effects where the baked templates are registered
     * @param {AbstractGameProfile} profile owner of the splash table
     */
    constructor(assets, effects, profile) {
        this._assets  = assets;
        this._effects = effects;
        this._splash  = profile.genericSplash();
        this._cache   = null;
        this._scale   = null;
    }

    /**
     * Give every splashless liquid flat of the level a splash of its own
     * colour. Called inside the load batch: it registers textures and
     * billboards, which no runtime spawn may ever do.
     *
     * @param {DoomTerrain} terrain
     */
    apply(terrain) {
        const masks = this._masks();
        if (masks === null) {
            return;
        }
        const tints = terrain.liquidTints();
        for (const flat of Object.keys(tints)) {
            if (terrain.splashesOnFlat(flat)) {
                continue;
            }
            const code = DoomGenericSplash.TERRAIN_PREFIX + flat;
            const spec = {
                base:      null,
                chunk:     null,
                chunkVel:  this._splash.chunkVel,
                chunkSpin: (this._splash.chunkSpin ?? null),
                sound:     null
            };
            for (const part of this._splash.parts) {
                const name = code + ':' + part.part;
                const bank = this._bank(part, masks, tints[flat]);
                this._effects.addTemplate(bank, this._template(part, name));
                spec[part.part] = name;
            }
            terrain.addFlatTerrain(flat, code, spec);
        }
    }

    // The effectTemplates() entry of one part: the profile declares a row per
    // frame (each carries its own anchor), the timeline wants parallel arrays.
    _template(part, name) {
        return {
            name:      name,
            sprite:    part.sprite,
            letters:   part.frames.map((frame) => frame.letter),
            frameTics: part.frames.map((frame) => frame.tics),
            alpha:     part.alpha,
            rise:      part.rise,
            gravity:   (part.gravity ?? 0),
            additive:  part.additive,
            mirror:    (part.mirror === true),
            landing:   (part.landing ?? null)
        };
    }

    // The shape a sprite bank answers with, so the effect templates build
    // through the very path the WAD sprites take. The geometry comes from the
    // mask's AUTHORED size, never from the texture it ends up as: resampling
    // changes the texels, never the size of the splash in the world.
    _bank(part, masks, tint) {
        const unit   = part.pixelsPerUnit;
        const frames = {};
        for (const frame of part.frames) {
            const mask = masks[frame.key];
            frames[part.sprite + frame.letter + '0'] = {
                texId:      loader.textures().loadFromData(null, this._tint(mask, tint)),
                width:      mask.width / unit,
                height:     mask.height / unit,
                leftOffset: frame.anchorX / unit,
                topOffset:  frame.anchorY / unit
            };
        }

        return {
            has: (lump) => (frames[lump] !== undefined),
            get: (lump) => (frames[lump] ?? null)
        };
    }

    // Colourise one mask: the tint carries the colour, the mask's own
    // luminance the shading, its alpha the shape. Normalised so the splash
    // averages the colour of the liquid rather than a darkened version of it,
    // then lifted by the table's gain so it reads against that very liquid.
    _tint(raw, tint) {
        const scale = this._normalizer(this._masks()) * (this._splash.tintGain ?? 1);
        const out   = new ImageData(raw.width, raw.height);
        const src   = raw.data;
        const dst   = out.data;
        for (let i = 0; i < src.length; i += 4) {
            const level = (src[i] * scale) / 255;
            dst[i]     = Math.min(255, Math.round(tint[0] * level));
            dst[i + 1] = Math.min(255, Math.round(tint[1] * level));
            dst[i + 2] = Math.min(255, Math.round(tint[2] * level));
            dst[i + 3] = src[i + 3];
        }

        return out;
    }

    // Every mask of the table, or null as soon as one is missing: a half-built
    // splash would animate into holes.
    _masks() {
        if (this._cache !== null) {
            return this._cache;
        }
        const masks = {};
        for (const part of this._splash.parts) {
            for (const frame of part.frames) {
                const raw = this._assets.get(frame.key);
                if (raw === null) {
                    return null;
                }
                masks[frame.key] = raw;
            }
        }
        this._cache = masks;

        return masks;
    }

    // One factor for the WHOLE set, never per frame: a per-frame normalisation
    // would even out the frames and flatten the fade the animation lives on.
    _normalizer(masks) {
        if (this._scale !== null) {
            return this._scale;
        }
        let total = 0;
        let count = 0;
        for (const key of Object.keys(masks)) {
            const data = masks[key].data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) {
                    continue;
                }
                total += data[i];
                count++;
            }
        }
        const mean = ((count === 0) ? 255 : (total / count));
        this._scale = ((mean > 0) ? (255 / mean) : 1);

        return this._scale;
    }
}

// Terrain codes minted for the baked splashes, one per liquid flat: the colon
// cannot collide with a terrain name of a TERRAIN lump (its lexer would have
// split it off as its own token).
DoomGenericSplash.TERRAIN_PREFIX = 'generic:';
