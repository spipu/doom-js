/**
 * Camera-facing sprite quad whose four corners are rebuilt in camera space every
 * frame. Cylindrical: the vertical edge stays on world up and the quad only yaws,
 * so the sprite leans in perspective when the camera pitches.
 *
 * The entity origin is the quad's foot, or its top for hanging sprites.
 * Width/height are world units; anchorOffsetX/Y shift the sprite along the quad.
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

    // descriptor = {textures:[id…], halfWidth, height, anchorOffsetX?, anchorOffsetY?,
    //   anchorTop?, light? (0-255), alpha?, additive?, animDuration?, lightGroup?,
    //   tint?, flipX?}. flipX does not mirror anchorOffsetX: the caller does.
    // Corners: 0 BL, 1 BR, 2 TR, 3 TL; the UVs account for fcAdd's v-flip.
    configure(descriptor) {
        this._halfWidth     = descriptor.halfWidth;
        this._height        = descriptor.height;
        this._anchorOffsetX = (descriptor.anchorOffsetX ?? 0);
        this._anchorOffsetY = (descriptor.anchorOffsetY ?? 0);
        this._anchorTop     = (descriptor.anchorTop === true);
        this.setRenderTint(descriptor.tint ?? null);

        const light      = (descriptor.light ?? 255);
        const alpha      = (descriptor.alpha ?? 1);
        const additive   = (descriptor.additive === true);
        const lightGroup = (descriptor.lightGroup ?? null);
        const textureIds = descriptor.textures;
        for (const tid of textureIds) {
            this.textureAddById(tid);
        }
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        this.ptAdd(0, 0, 0);
        const anim = ((textureIds.length > 1) ? {ids: textureIds.map((t, k) => k + 1), duration: (descriptor.animDuration ?? 0)} : null);
        // A fresh colour array per face: fcAdd normalises it in place
        const i0 = this.faceCount;
        const uv = Billboard.quadUv(descriptor.flipX === true);
        this.fcAdd(1, 2, 3, ((alpha < 1) ? [light, light, light, alpha] : [light, light, light]), 1, uv[0], true, false, false, anim, null, lightGroup);
        this.fcAdd(1, 3, 4, ((alpha < 1) ? [light, light, light, alpha] : [light, light, light]), 1, uv[1], true, false, false, anim, null, lightGroup);
        // Additive blend (gzdoom RenderStyle "Add")
        if (additive) {
            this.faceList[i0].blendAdd     = true;
            this.faceList[i0 + 1].blendAdd = true;
        }
        return this;
    }

    // UVs of the quad's two triangles
    static quadUv(flipX) {
        const u = ((value) => ((flipX) ? 1 - value : value));

        return [
            [[u(0), 0], [u(1), 0], [u(1), 1]],
            [[u(0), 0], [u(1), 1], [u(0), 1]]
        ];
    }

    // World units; also the vertical extent of a box collider
    getHeight() {
        return this._height;
    }

    // Overridden: the local vertices are all (0,0,0), so the base radius is 0
    getBoundingRadius() {
        return Math.sqrt(this._halfWidth * this._halfWidth + (this._height * this._height) / 4);
    }

    // Sprite middle rather than the anchor
    getCenter() {
        const halfH = this._height / 2;
        const cy = ((this._anchorTop) ? (this._anchorOffsetY - halfH) : (this._anchorOffsetY + halfH));
        return [this._anchorOffsetX, cy, 0];
    }

    // The anchor in camera space is the matrix translation row, world up is
    // m.v[1]. `roll` (radians) spins the quad in its own plane. The normal is
    // turned toward the camera so back-face culling keeps the quad.
    ptTransform(m, minZ = 0, roll = 0) {
        const px = m.v[3][0];
        const py = m.v[3][1];
        const pz = m.v[3][2];

        // R_ProjectSprite MINZ: behind the near plane the quad would turn
        // edge-on through the camera; collapsed, it draws nothing.
        if (pz < minZ) {
            for (let k = 0; k < 4; k++) {
                this._setPt(k, 0, 0, 0);
            }
            return this;
        }

        let ux = m.v[1][0];
        let uy = m.v[1][1];
        let uz = m.v[1][2];
        const ul = (Math.sqrt(ux * ux + uy * uy + uz * uz) || 1);
        ux /= ul;
        uy /= ul;
        uz /= ul;

        // Right edge = cross(up, anchorDir); camera X when seen straight along up
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

        if (roll !== 0) {
            const cos = Math.cos(roll);
            const sin = Math.sin(roll);
            const r0 = rx, r1 = ry, r2 = rz;
            const u0 = ux, u1 = uy, u2 = uz;
            rx = r0 * cos + u0 * sin;
            ry = r1 * cos + u1 * sin;
            rz = r2 * cos + u2 * sin;
            ux = u0 * cos - r0 * sin;
            uy = u1 * cos - r1 * sin;
            uz = u2 * cos - r2 * sin;
        }

        const hw = this._halfWidth;
        const h  = this._height;
        const ox = this._anchorOffsetX;
        const oy = this._anchorOffsetY;

        const ax = px + ox * rx + oy * ux;
        const ay = py + ox * ry + oy * uy;
        const az = pz + ox * rz + oy * uz;

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

        // cross(right, up), flipped toward the camera
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
