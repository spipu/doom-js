class Object3dRendererFast extends Object3dRendererBase {
    get code() {
        return 'fast';
    }

    draw(obj, engine) {
        const styleId = this._objectStyleId(obj.getRenderTint());
        for (let k = 0; k < obj.faceCount; k++) {
            const fc = obj.faceList[k];
            if (fc.collisionOnly === true) {
                continue;
            }
            this._pushFace(engine, obj, fc, styleId);
        }
    }

    // One style per tint: the fill keeps the alpha of the untinted one, and the
    // edge is that same hue darkened, so a tinted body keeps readable edges.
    _objectStyleId(tint) {
        const id = this._styleSlot(tint);
        if (id !== -1) {
            return id;
        }

        return this._addStyle(
            tint,
            this._fillStyle(tint ?? Object3dRendererFast.FILL_COLOR),
            ((tint === null) ? Object3dRendererFast.LINE_COLOR : this._edgeStyle(tint))
        );
    }

    _fillStyle(color) {
        return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + Object3dRendererFast.FILL_ALPHA + ')';
    }

    _edgeStyle(color) {
        const factor = Object3dRendererFast.TINT_EDGE_FACTOR;
        return 'rgb(' + Math.trunc(color[0] * factor) + ',' + Math.trunc(color[1] * factor) + ',' + Math.trunc(color[2] * factor) + ')';
    }
}

Object3dRendererFast.FILL_COLOR       = [250, 250, 250];
Object3dRendererFast.FILL_ALPHA       = 0.7;
Object3dRendererFast.LINE_COLOR       = '#222222';
Object3dRendererFast.TINT_EDGE_FACTOR = 0.4;
