class Object3dLoader extends AbstractLoader {
    _create(id, url, callback) {
        const entity = new Object3d(id, url, callback);

        if (entity.getUrl()) {
            this._initialiseEntityFromUrl(entity);
        }

        return entity;
    }

    _alreadyLoaded(url) {
        return null;
    }

    _initialiseEntityFromUrl(entity) {
        this._fetchJson(
            entity.getUrl(),
            data => {
                (data.textures || []).forEach(t => entity.textureAdd(t));
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

                entity.setLoaded();
            }
        );
    }
}
