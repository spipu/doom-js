class Object3dLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('object3d', loadedCallback);
    }

    // objects.html reloads the same URL into a fresh entity on purpose
    _alreadyLoaded(url) {
        return null;
    }

    _create(id, url, callback) {
        return new Object3d(id, url, callback);
    }

    // Billboards share the Object3d id space so instances can resolve them.
    // data: see Billboard.configure.
    loadBillboardFromData(code, data) {
        const entity = new Billboard(this._entities.length, null, () => this._checkFullyLoaded());
        this._registerNewEntity(code, entity);
        entity.configure(data);
        entity.setLoaded();

        return entity.getId();
    }

    // Texture entries: a url, or an already loaded texture id
    _populateFromData(entity, data) {
        entity.setRenderTint(data.tint ?? null);
        (data.textures || []).forEach((t) => ((typeof t === 'number') ? entity.textureAddById(t) : entity.textureAdd(t)));
        data.points.forEach((p) => entity.ptAdd(p[0], p[1], p[2]));
        data.faces.forEach((f) => {
            entity.fcAdd(
                f.pts[0],
                f.pts[1],
                f.pts[2],
                ((f.color          !== undefined) ? f.color          : null),
                ((f.texture        !== undefined) ? f.texture        : null),
                ((f.map            !== undefined) ? f.map            : null),
                ((f.clampV         !== undefined) ? f.clampV         : false),
                ((f.passableUser   !== undefined) ? f.passableUser   : false),
                ((f.passableEnemy  !== undefined) ? f.passableEnemy  : false),
                ((f.textures       !== undefined) ? f.textures       : null),
                ((f.uvScroll       !== undefined) ? f.uvScroll       : null),
                ((f.lightGroup     !== undefined) ? f.lightGroup     : null),
                ((f.uvAnchor       !== undefined) ? f.uvAnchor       : null)
            );
            const fc = entity.faceList[entity.getFaceCount() - 1];
            if (f.collisionOnly === true) {
                fc.collisionOnly = true;
            }
            if (f.passableShot === true) {
                fc.passableShot = true;
            }
            if (f.noDecal === true) {
                fc.noDecal = true;
            }
        });
    }
}
