/**
 * A camera-facing sprite quad. Generic engine entity (no game knowledge): it is
 * an Object3d whose four corners are rebuilt every frame in camera space,
 * instead of having its local geometry transformed by the view matrix. It is a
 * cylindrical (Y-axis) billboard: the vertical edge stays aligned with world up
 * (m.v[1] expressed in camera space) and the quad only yaws around that axis to
 * face the viewer, so the sprite leans naturally in perspective when the camera
 * pitches up or down.
 *
 * The quad is anchored at its foot (floor) or top (ceiling, hanging things):
 * the entity origin is that anchor, placed by the world at the sector floor or
 * ceiling. Width/height are world units; anchorOffsetX/Y shift the sprite
 * horizontally/vertically (Doom sprite leftoffset/topoffset). The quad colour
 * carries the sector light level so sprites match the static lighting of walls.
 */
class Billboard extends Object3d {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._halfWidth     = 0.5;
        this._height        = 1.0;
        this._anchorOffsetX = 0;
        this._anchorOffsetY = 0;
        this._anchorTop     = false;
    }

    // Configure the billboard from a descriptor and build its quad in one call.
    // data = {textures:[id…], halfWidth, height, anchorOffsetX?, anchorOffsetY?,
    //         anchorTop?, light?, animDuration?, lightGroup?}. anchorTop anchors
    //         the TOP at the origin (ceiling/hanging) instead of the foot (floor).
    //         light (0-255) is the sector brightness baked into the face colour;
    //         lightGroup tags the faces for dynamic group light factors. The four
    //         corner slots are overwritten each frame by ptTransform; UVs account
    //         for the v-flip applied by fcAdd (corners: 0 BL, 1 BR, 2 TR, 3 TL).
    configure(data) {
        this._halfWidth     = data.halfWidth;
        this._height        = data.height;
        this._anchorOffsetX = (data.anchorOffsetX ?? 0);
        this._anchorOffsetY = (data.anchorOffsetY ?? 0);
        this._anchorTop     = (data.anchorTop === true);

        const light      = (data.light ?? 255);
        const alpha      = (data.alpha ?? 1);
        const lightGroup = (data.lightGroup ?? null);
        const textureIds = data.textures;
        for (const tid of textureIds) {
            this.textureAddById(tid);
        }
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        const anim = ((textureIds.length > 1) ? {ids: textureIds.map((t, k) => k + 1), duration: (data.animDuration ?? 0)} : null);
        // A fresh colour array per face (fcAdd normalises it in place); the alpha
        // slot is added only when translucent, leaving opaque billboards untouched.
        this.fcAdd(1, 2, 3, ((alpha < 1) ? [light, light, light, alpha] : [light, light, light]), 1, [[0, 0], [1, 0], [1, 1]], true, false, false, anim, null, lightGroup);
        this.fcAdd(1, 3, 4, ((alpha < 1) ? [light, light, light, alpha] : [light, light, light]), 1, [[0, 0], [1, 1], [0, 1]], true, false, false, anim, null, lightGroup);
        return this;
    }

    // Sprite height (world units). Used by Collision to derive the box collider's
    // vertical interval from the body, so no separate collision height is stored.
    getHeight() {
        return this._height;
    }

    // The body centre (local), so Instance worldCenter sits at the sprite's
    // middle (used by collision/pickup later) rather than at the anchor.
    getCenter() {
        const halfH = this._height / 2;
        const cy = ((this._anchorTop) ? (this._anchorOffsetY - halfH) : (this._anchorOffsetY + halfH));
        return [this._anchorOffsetX, cy, 0];
    }

    // Override: place a cylindrical (Y-axis) billboard in camera space. The
    // entity origin (0,0,0) transformed by the view matrix is the matrix
    // translation column — the anchor (sprite foot, or top for hanging things)
    // in camera space. The vertical edge follows world up in camera space
    // (m.v[1], the camera-space image of the local Y axis); the right edge is
    // cross(up, anchorDir), horizontal and facing the camera. The face normal is
    // set toward the camera so back-face culling keeps the quad (cull test is
    // normal·pt >= 0).
    ptTransform(m) {
        const px = m.v[3][0];
        const py = m.v[3][1];
        const pz = m.v[3][2];

        // World up in camera space (normalised).
        let ux = m.v[1][0];
        let uy = m.v[1][1];
        let uz = m.v[1][2];
        const ul = (Math.sqrt(ux * ux + uy * uy + uz * uz) || 1);
        ux /= ul;
        uy /= ul;
        uz /= ul;

        // Right edge = cross(up, anchorDir): horizontal in world, perpendicular
        // to the viewing direction so the quad faces the camera in yaw. Falls
        // back to the camera X axis in the degenerate case (sprite seen straight
        // along world up).
        let rx = uy * pz - uz * py;
        let ry = uz * px - ux * pz;
        let rz = ux * py - uy * px;
        let rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rl < 1e-6) {
            rx = 1;
            ry = 0;
            rz = 0;
            rl = 1;
        }
        rx /= rl;
        ry /= rl;
        rz /= rl;

        const hw = this._halfWidth;
        const h  = this._height;
        const ox = this._anchorOffsetX;
        const oy = this._anchorOffsetY;

        // Anchor shifted by the Doom leftoffset/topoffset along the quad basis.
        const ax = px + ox * rx + oy * ux;
        const ay = py + ox * ry + oy * uy;
        const az = pz + ox * rz + oy * uz;

        // Foot of the sprite (top anchor subtracts a full height).
        const fx = ((this._anchorTop) ? ax - h * ux : ax);
        const fy = ((this._anchorTop) ? ay - h * uy : ay);
        const fz = ((this._anchorTop) ? az - h * uz : az);
        const tx = fx + h * ux;
        const ty = fy + h * uy;
        const tz = fz + h * uz;

        this._setPt(0, fx - hw * rx, fy - hw * ry, fz - hw * rz);
        this._setPt(1, fx + hw * rx, fy + hw * ry, fz + hw * rz);
        this._setPt(2, tx + hw * rx, ty + hw * ry, tz + hw * rz);
        this._setPt(3, tx - hw * rx, ty - hw * ry, tz - hw * rz);

        // Face normal = cross(right, up), flipped to point toward the camera
        // (anchor in front of the camera ⇒ n·anchor < 0 keeps the quad).
        let nx = ry * uz - rz * uy;
        let ny = rz * ux - rx * uz;
        let nz = rx * uy - ry * ux;
        if (nx * px + ny * py + nz * pz > 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
        }
        for (let k = 0; k < this.faceCount; k++) {
            const n = this.faceList[k].normal;
            n[0] = nx;
            n[1] = ny;
            n[2] = nz;
        }
        return this;
    }

    _setPt(i, x, y, z) {
        const p = this.pt3d[i];
        p[0] = x;
        p[1] = y;
        p[2] = z;
        p[3] = 1;
    }
}
