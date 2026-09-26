/**
 * Where the simulation marks a surface hit by a shot (UZDoom decals; vanilla
 * Doom has none): a bullet chip, a rocket scorch, a plasma burn, or a BFG
 * flash over a scorch. Floors and ceilings take marks too — our own
 * extension, UZDoom marks walls only — except the surfaces flagged bare by the
 * level (sky floors, liquids). It lays the quad on the surface, draws the
 * variant from the game's random sequence, and hands the placement to the turn
 * events.
 */
class DoomDecalSpawner {
    /**
     * @param {DoomDecalTemplates} templates
     * @param {DoomRandom}         rng
     * @param {DoomTurnEvents}     events
     */
    constructor(templates, rng, events) {
        this._templates = templates;
        this._rng       = rng;
        this._events    = events;
    }

    // Stick a decal on the surface hit by a shot. type: 'bulletChip' | 'scorch' |
    // 'plasma' | 'bfg'. hit = the collision raycast result: its normal orients
    // the quad, its triangle says whether the surface takes a mark and which
    // mover (door/lift) it belongs to — the decal then rides it.
    spawnDecal(type, hit, rayDir) {
        if (hit.tri.noDecal === true) {
            return;
        }
        let [nx, ny, nz] = hit.normal;
        if ((nx * rayDir[0] + ny * rayDir[1] + nz * rayDir[2]) > 0) {
            nx = -nx;   // face the shooter's side of the surface
            ny = -ny;
            nz = -nz;
        }
        const rotation = DoomDecalSpawner._rotationFor(hit.tri.kind, nx, nz, rayDir);
        const owner    = (hit.tri.instance ?? null);
        const offset   = DoomDecalSpawner.OFFSET;

        if (type === 'bfg') {
            this._place('bfgscrc', hit.point, nx, ny, nz, offset, rotation, owner, false);
            this._place('bfglite', hit.point, nx, ny, nz, offset + DoomDecalSpawner.LITE_LIFT, rotation, owner, true);
            return;
        }
        this._place(type, hit.point, nx, ny, nz, offset, rotation, owner, false);
    }

    // Instance rotation laying the +Z quad on the surface. A wall yaws it onto
    // its normal. A floor or ceiling tilts it flat around X, after a spin
    // around Z (applied first) that aligns the mark with the shot.
    static _rotationFor(kind, nx, nz, rayDir) {
        if (kind === Collision.KIND_WALL) {
            return [0, Math.atan2(nx, nz) / DEG_TO_RAD, 0];
        }
        const spin = Math.atan2(rayDir[0], rayDir[2]) / DEG_TO_RAD;

        return [((kind === Collision.KIND_FLOOR) ? -90 : 90), 0, spin];
    }

    _place(key, hitPoint, nx, ny, nz, offset, rotation, owner, fade) {
        const variants = this._templates.variantsOf(key);
        if (variants.length === 0) {
            return;
        }
        this._events.decal({
            key:      key,
            variant:  (this._rng.next() % variants.length),
            position: [hitPoint[0] + nx * offset, hitPoint[1] + ny * offset, hitPoint[2] + nz * offset],
            rotation: rotation,
            owner:    owner,
            fade:     fade
        });
    }
}

DoomDecalSpawner.OFFSET    = 0.75 * WadConstants.SCALE; // push off the surface (anti z-fight)
DoomDecalSpawner.LITE_LIFT = 1.92 * WadConstants.SCALE; // BFG flash floats in front of its scorch, coplanar it barely shows
