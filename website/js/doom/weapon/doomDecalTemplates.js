/**
 * The impact decal templates of a level (UZDoom decaldef): per type, the
 * variants a spawn picks from — one flat textured quad per graphic and UV
 * flip, and for a fading type its steps of decreasing alpha. Textures and
 * quads are built ONCE per level inside the load batch (a runtime
 * object/texture registration would re-fire the loader). Built by every
 * device: the simulation draws the variant, the presentation places it.
 *
 * Sizes match UZDoom exactly: on-wall size (map units) = PNG pixels × decaldef
 * scale, converted to world units by WadConstants.SCALE.
 */
class DoomDecalTemplates {
    // The decal set (graphics, scales, shades) is per-game data: it comes from
    // the game profile's decalTemplates(), a shade of 'bfg' resolving to its
    // bfgDecalShade() (freedoom art uses a bluish 80 80 ff, id Doom 80 ff 80).
    constructor(decalTextures, profile) {
        this._templates = this._buildTemplates(decalTextures, profile);
    }

    /**
     * @returns {Array} the variants of a type (quad objects, or {steps} for a
     *                  fading one); empty when the WAD lacks its graphics
     */
    variantsOf(key) {
        return (this._templates[key] ?? DoomDecalTemplates.NO_VARIANTS);
    }

    // Per-type descriptor (profile decaldef data): scale, shade tint, face
    // translucency, and a luminance gain lifting the mask above the shader's
    // a<0.5 cutout so the soft burns keep more of their body.
    _buildTemplates(tex, profile) {
        const templates = {};
        for (const spec of profile.decalTemplates()) {
            const shade = ((spec.shade === 'bfg') ? profile.bfgDecalShade() : spec.shade);
            if (spec.fade === true) {
                templates[spec.type] = this._buildFadeVariants(tex, spec.keys, spec.scale, shade, spec.gain);
                continue;
            }
            templates[spec.type] = this._buildVariants(tex, spec.keys, spec.scale, shade, spec.translucent, spec.gain);
        }
        return templates;
    }

    // Permanent decals: one texture per graphic, four UV-flip variants
    // (decaldef randomflipx/y) flattened with the graphics so a single random
    // pick on spawn varies both the graphic and its mirroring.
    _buildVariants(tex, keys, scale, shade, translucent, gain) {
        const out = [];
        for (const key of keys) {
            const raw = tex.get(key);
            if (raw === null) {
                continue;
            }
            const texId = loader.textures().loadFromData(null, this._bake(raw, shade, gain));
            for (const fx of [false, true]) {
                for (const fy of [false, true]) {
                    out.push(this._quadObject(texId, raw, scale, translucent, fx, fy));
                }
            }
        }
        return out;
    }

    // Fading decals (BFG lightning): one texture per graphic, then per flip
    // variant a set of N quad objects of decreasing face alpha so the fade is a
    // template swap (no per-instance alpha), matching DoomEffects' frame stepping.
    _buildFadeVariants(tex, keys, scale, shade, gain) {
        const out = [];
        for (const key of keys) {
            const raw = tex.get(key);
            if (raw === null) {
                continue;
            }
            const texId = loader.textures().loadFromData(null, this._bake(raw, shade, gain));
            for (const fx of [false, true]) {
                for (const fy of [false, true]) {
                    const steps = [];
                    for (let k = 0; k < DoomDecalTemplates.FADE_STEPS; k++) {
                        steps.push(this._quadObject(texId, raw, scale, 1 - (k / DoomDecalTemplates.FADE_STEPS), fx, fy));
                    }
                    out.push({ steps });
                }
            }
        }
        return out;
    }

    // Colourise a grayscale mask: RGB = shade, alpha = source luminance × gain
    // (the decaldef `shade` model). The shader's a<0.5 cutout keeps the brighter
    // core; gain lifts soft burns above it; face alpha carries translucent/fade.
    _bake(raw, shade, gain) {
        const out = new ImageData(raw.width, raw.height);
        const src = raw.data;
        const dst = out.data;
        for (let i = 0; i < src.length; i += 4) {
            dst[i]     = shade[0];
            dst[i + 1] = shade[1];
            dst[i + 2] = shade[2];
            dst[i + 3] = Math.min(255, Math.round(src[i] * gain));
        }
        return out;
    }

    // A vertical quad in local space (normal +Z), sized from the PNG × scale.
    // The instance yaw rotates +Z onto the wall normal at spawn time. White face
    // colour so the baked shade shows through unchanged; alpha < 1 → translucent.
    // fx/fy mirror the UVs (randomflipx/y).
    _quadObject(texId, raw, scale, alpha, fx, fy) {
        const s      = WadConstants.SCALE;
        const hw     = (raw.width  * scale * s) / 2;
        const hh     = (raw.height * scale * s) / 2;
        const points = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]];
        const color  = ((alpha < 1) ? [255, 255, 255, alpha] : [255, 255, 255]);
        const faces  = [
            { pts: [1, 2, 3], color: [...color], texture: 1, map: this._flipUv([[0, 0], [1, 0], [1, 1]], fx, fy), clampV: true },
            { pts: [1, 3, 4], color: [...color], texture: 1, map: this._flipUv([[0, 0], [1, 1], [0, 1]], fx, fy), clampV: true },
        ];
        return loader.objects().loadFromData(null, { textures: [texId], points, faces });
    }

    _flipUv(uv, fx, fy) {
        return uv.map((c) => [((fx) ? 1 - c[0] : c[0]), ((fy) ? 1 - c[1] : c[1])]);
    }
}

DoomDecalTemplates.FADE_STEPS  = 8;
DoomDecalTemplates.NO_VARIANTS = [];
