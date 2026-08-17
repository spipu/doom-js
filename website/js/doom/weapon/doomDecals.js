// Persistent wall impact decals (UZDoom / GZDoom feature; vanilla Doom has none).
// A shot on a wall leaves a mark that stays: a small bullet chip, a large rocket
// scorch, a plasma burn, or a BFG flash over a scorch. Faithful to UZDoom's
// decaldef.txt: per-weapon graphic + scale + shade, a FIFO cap on permanent
// decals, and the BFG lightning fading away (animator GoAway2) over a permanent
// lower scorch.
//
// A decal is a flat textured quad glued to the wall — a normal Object3d (NOT a
// camera-facing Billboard): its orientation is baked into the instance yaw, from
// the wall normal. Textures + quad templates are built ONCE per level inside the
// load batch (a runtime object/texture registration would re-fire the loader);
// each impact only spawns an Instance (spawnFromData, no loader re-check).
//
// Sizes match UZDoom exactly: on-wall size (map units) = PNG pixels × decaldef
// scale, converted to world units by WadConstants.SCALE.
class DoomDecals {
    // The decal set (graphics, scales, shades) is per-game data: it comes from
    // the game profile's decalTemplates(), a shade of 'bfg' resolving to its
    // bfgDecalShade() (freedoom art uses a bluish 80 80 ff, id Doom 80 ff 80).
    constructor(decalTextures, rng, profile) {
        this._rng       = rng;
        this._permanent = [];   // instIds of permanent decals (FIFO, capped)
        this._fading    = [];   // {instId, steps, elapsed, shown} — BFG lightning
        this._templates = this._buildTemplates(decalTextures, profile);
    }

    // --- Template building (in the load batch) ---

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
                    for (let k = 0; k < DoomDecals.FADE_STEPS; k++) {
                        steps.push(this._quadObject(texId, raw, scale, 1 - (k / DoomDecals.FADE_STEPS), fx, fy));
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
        const s  = WadConstants.SCALE;
        const hw = (raw.width  * scale * s) / 2;
        const hh = (raw.height * scale * s) / 2;
        const points = [[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]];
        const color  = ((alpha < 1) ? [255, 255, 255, alpha] : [255, 255, 255]);
        const faces  = [
            { pts: [1, 2, 3], color: [...color], texture: 1, map: this._flipUv([[0, 0], [1, 0], [1, 1]], fx, fy), clampV: true },
            { pts: [1, 3, 4], color: [...color], texture: 1, map: this._flipUv([[0, 0], [1, 1], [0, 1]], fx, fy), clampV: true },
        ];
        return loader.objects().loadFromData(null, { textures: [texId], points, faces });
    }

    // decaldef randomflipx/y.
    _flipUv(uv, fx, fy) {
        return uv.map((c) => [((fx) ? 1 - c[0] : c[0]), ((fy) ? 1 - c[1] : c[1])]);
    }

    // --- Runtime spawning ---

    // Stick a decal on the wall hit by a shot. type: 'bulletChip' | 'scorch' |
    // 'plasma' | 'bfg'. owner = the dynamic instance (door/lift) the wall belongs
    // to, or null/undefined for the static map (from hit.tri.instance).
    spawnWallDecal(type, hitPoint, wallNormal, rayDir, owner) {
        if (Math.abs(wallNormal[1]) >= 0.7) {
            return;   // floor/ceiling — decals are wall-only (faithful UZDoom)
        }
        let nx = wallNormal[0];
        let ny = wallNormal[1];
        let nz = wallNormal[2];
        if ((nx * rayDir[0] + ny * rayDir[1] + nz * rayDir[2]) > 0) {
            nx = -nx;   // face the shooter's side of the wall
            ny = -ny;
            nz = -nz;
        }
        const yaw = Math.atan2(nx, nz) / DEG_TO_RAD;
        const off = DoomDecals.OFFSET;

        if (type === 'bfg') {
            this._spawn('bfgscrc', hitPoint, nx, ny, nz, off, yaw, owner, false);
            this._spawn('bfglite', hitPoint, nx, ny, nz, off + DoomDecals.LITE_LIFT, yaw, owner, true);
            return;
        }
        this._spawn(type, hitPoint, nx, ny, nz, off, yaw, owner, false);
    }

    _spawn(key, hitPoint, nx, ny, nz, off, yaw, owner, isFade) {
        const variants = this._templates[key];
        if ((variants === undefined) || (variants.length === 0)) {
            return;
        }
        const variant = variants[this._rng.next() % variants.length];
        const objId   = ((isFade) ? variant.steps[0] : variant);
        const instId  = loader.instances().spawnFromData(null, {
            object:         objId,
            position:       [hitPoint[0] + nx * off, hitPoint[1] + ny * off, hitPoint[2] + nz * off],
            rotation:       [0, yaw, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        if ((owner !== null) && (owner !== undefined)) {
            loader.instances().get(instId).setRideOn(owner);
        }
        if (isFade) {
            this._fading.push({ instId, steps: variant.steps, elapsed: 0, shown: 0 });
            return;
        }
        this._permanent.push(instId);
        if (this._permanent.length > DoomDecals.MAX) {
            const oldInst = loader.instances().get(this._permanent.shift());
            if (oldInst !== undefined) {
                loader.instances().scheduleRemoval(oldInst);
            }
        }
    }

    // Advance the BFG lightning fade (GoAway2: hold FADE_START s, fade over
    // FADE_TIME s, then despawn). Permanent decals need no update.
    update(dtMs) {
        if (this._fading.length === 0) {
            return;
        }
        const kept = [];
        for (const f of this._fading) {
            const inst = loader.instances().get(f.instId);
            if (inst === undefined) {
                continue;
            }
            f.elapsed += dtMs;
            const t = f.elapsed / 1000;
            if (t < DoomDecals.FADE_START) {
                kept.push(f);
                continue;
            }
            const p = (t - DoomDecals.FADE_START) / DoomDecals.FADE_TIME;
            if (p >= 1) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            const step = Math.min(f.steps.length - 1, Math.floor(p * f.steps.length));
            if (step !== f.shown) {
                inst.setObject(f.steps[step]);
                f.shown = step;
            }
            kept.push(f);
        }
        this._fading = kept;
    }
}

DoomDecals.MAX        = 256;                       // FIFO cap on permanent decals
DoomDecals.OFFSET     = 0.75 * WadConstants.SCALE; // push off the wall (anti z-fight)
DoomDecals.LITE_LIFT  = 1.92 * WadConstants.SCALE; // BFG flash floats 0.03 m in front of its scorch (coplanar it was barely visible)
DoomDecals.FADE_STEPS = 8;
DoomDecals.FADE_START = 1.0;                        // GoAway2 DecayStart (s)
DoomDecals.FADE_TIME  = 3.0;                        // GoAway2 DecayTime (s)
