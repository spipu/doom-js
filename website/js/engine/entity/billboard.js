/**
 * A camera-facing sprite quad. Generic engine entity (no game knowledge): it is
 * an Object3d whose four corners are rebuilt every frame, screen-aligned in
 * camera space, instead of having its local geometry transformed by the view
 * matrix. This is the classic Doom-style billboard — it stays upright on screen
 * and does not tilt with the camera pitch.
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

    // anchorTop: anchor the sprite's TOP at the origin (hanging from the ceiling)
    // instead of its foot at the origin (standing on the floor).
    setBillboardSize(halfWidth, height, anchorOffsetX, anchorOffsetY, anchorTop) {
        this._halfWidth     = halfWidth;
        this._height        = height;
        this._anchorOffsetX = anchorOffsetX;
        this._anchorOffsetY = anchorOffsetY;
        this._anchorTop     = (anchorTop === true);
        return this;
    }

    // Build the quad: four corner slots (overwritten each frame by ptTransform)
    // and two triangles. Corner order: 0 bottom-left, 1 bottom-right, 2 top-right,
    // 3 top-left. UVs account for the v-flip applied by fcAdd. textureIds holds one
    // id (static sprite) or several (animated sprite cycled via animTextures).
    // light (0-255) is the sector brightness baked into the face colour.
    setupQuad(textureIds, animDuration, light) {
        for (const tid of textureIds) {
            this.textureAddById(tid);
        }
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        const anim = ((textureIds.length > 1) ? {ids: textureIds.map((t, k) => k + 1), duration: animDuration} : null);
        this.fcAdd(1, 2, 3, [light, light, light], 1, [[0, 0], [1, 0], [1, 1]], true, false, false, anim);
        this.fcAdd(1, 3, 4, [light, light, light], 1, [[0, 0], [1, 1], [0, 1]], true, false, false, anim);
        return this;
    }

    // Override: place a screen-aligned quad in camera space. The entity origin
    // (0,0,0) transformed by the view matrix is the matrix translation column —
    // that is the anchor (sprite foot, or top for hanging things) in camera space.
    ptTransform(m) {
        const cx = m.v[3][0];
        const cy = m.v[3][1];
        const cz = m.v[3][2];
        const hw = this._halfWidth;
        const h  = this._height;
        const ox = this._anchorOffsetX;
        const base = cy + this._anchorOffsetY;
        const yb = ((this._anchorTop) ? base - h : base);
        const yt = yb + h;

        this._setPt(0, cx - hw + ox, yb, cz);
        this._setPt(1, cx + hw + ox, yb, cz);
        this._setPt(2, cx + hw + ox, yt, cz);
        this._setPt(3, cx - hw + ox, yt, cz);

        // Always face the viewer so back-face culling keeps the quad (cull test
        // is normal·pt >= 0, and pt.z = cz > 0 in front of the camera).
        for (let k = 0; k < this.faceCount; k++) {
            const n = this.faceList[k].normal;
            n[0] = 0;
            n[1] = 0;
            n[2] = -1;
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
