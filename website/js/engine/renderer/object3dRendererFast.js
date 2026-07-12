class Object3dRendererFast extends Object3dRendererBase {
    get code() {
        return 'fast';
    }

    draw(obj, engine) {
        const pairs = [];
        for (let k = 0; k < obj.faceCount; k++) {
            const fc    = obj.faceList[k];
            const depth = (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3;
            pairs.push([k, depth]);
        }
        pairs.sort((a, b) => b[1] - a[1]);

        engine.scrCtx.fillStyle   = 'rgba(250,250,250,0.7)';
        engine.scrCtx.strokeStyle = 'rgba(150,150,150,0.7)';

        for (let i = 0; i < pairs.length; i++) {
            this._traceTriangle(engine.scrCtx, obj, obj.faceList[pairs[i][0]]);
        }
    }
}
