class Object3dRendererFast extends Object3dRendererBase {
    get code() {
        return 'fast';
    }

    begin(engine) {
        engine.scrCtx.clearRect(0, 0, engine.scrWidth, engine.scrHeight);
    }

    end(engine) {
        // no-op
    }

    draw(obj, engine) {
        const order = [];
        for (let k = 0; k < obj.faceCount; k++) {
            const fc    = obj.faceList[k];
            const depth = (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3;
            order.push(k, depth);
        }
        // order = [k0, d0, k1, d1, ...] — sort pairs by depth descending
        const pairs = [];
        for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i+1]]);
        pairs.sort((a, b) => b[1] - a[1]);

        engine.scrCtx.fillStyle   = 'rgba(250,250,250,0.7)';
        engine.scrCtx.strokeStyle = 'rgba(150,150,150,0.7)';

        for (let i = 0; i < pairs.length; i++) {
            const fc = obj.faceList[pairs[i][0]];
            engine.scrCtx.beginPath();
            engine.scrCtx.moveTo(obj.pt2d[fc.pts[0]][0], obj.pt2d[fc.pts[0]][1]);
            engine.scrCtx.lineTo(obj.pt2d[fc.pts[1]][0], obj.pt2d[fc.pts[1]][1]);
            engine.scrCtx.lineTo(obj.pt2d[fc.pts[2]][0], obj.pt2d[fc.pts[2]][1]);
            engine.scrCtx.closePath();
            engine.scrCtx.fill();
            engine.scrCtx.stroke();
        }
    }
}
