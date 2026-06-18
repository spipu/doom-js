class Object3dLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('object3d', loadedCallback);
        this._creatingBillboard = false;
    }

    _alreadyLoaded(url) {
        return null;
    }

    _create(id, url, callback) {
        return ((this._creatingBillboard) ? new Billboard(id, url, callback) : new Object3d(id, url, callback));
    }

    // In-memory billboard: reuses loadFromData's bookkeeping, _create picks the
    // Billboard class via the flag. data = {billboard, texture, halfWidth, height, anchorOffsetX?}.
    loadBillboardFromData(code, data) {
        this._creatingBillboard = true;
        let id;
        try {
            id = this.loadFromData(code, data);
        } finally {
            this._creatingBillboard = false;
        }
        return id;
    }

    _initialiseEntityFromUrl(entity) {
        appBootstrap.fetchJson(
            entity.getUrl(),
            data => {
                this._populateFromData(entity, data);
                entity.setLoaded();
            }
        );
    }

    // Texture entries: url string (loaded via TextureLoader) or number (already loaded texture id)
    _populateFromData(entity, data) {
        if (data.billboard === true) {
            entity.setBillboardSize(data.halfWidth, data.height, (data.anchorOffsetX ?? 0), (data.anchorOffsetY ?? 0), (data.anchorTop === true));
            entity.setupQuad(data.textures, (data.animDuration ?? 0), (data.light ?? 255));
            return;
        }
        (data.textures || []).forEach(t => ((typeof t === 'number') ? entity.textureAddById(t) : entity.textureAdd(t)));
        data.points.forEach(p => entity.ptAdd(p[0], p[1], p[2]));
        data.faces.forEach(f => entity.fcAdd(
            f.pts[0],
            f.pts[1],
            f.pts[2],
            (f.color          !== undefined) ? f.color          : null,
            (f.texture        !== undefined) ? f.texture        : null,
            (f.map            !== undefined) ? f.map            : null,
            (f.clampV         !== undefined) ? f.clampV         : false,
            (f.passableUser   !== undefined) ? f.passableUser   : false,
            (f.passableEnemy  !== undefined) ? f.passableEnemy  : false,
            (f.textures       !== undefined) ? f.textures       : null
        ));
    }
}
