class Object3dRendererFlat extends Object3dRendererBase {
    get code() {
        return 'flat';
    }

    begin(engine) {
        engine.scr_ctx.clearRect(0, 0, engine.scr_width, engine.scr_height);
    }

    end(engine) {}

    draw(obj, engine) {
        const faces = [];

        for (let k = 0; k < obj.fc_nb; k++) {
            const fc      = obj.fc_lst[k];
            const normal  = this._faceNormal(obj.pt_3d[fc[0]], obj.pt_3d[fc[1]], obj.pt_3d[fc[2]]);
            const normal2d = this._faceNormal2d(obj.pt_2d[fc[0]], obj.pt_2d[fc[1]], obj.pt_2d[fc[2]]);

            if (normal2d >= 0) continue;

            const c0 = this._pointColor(engine, fc[3], obj.pt_3d[fc[0]], normal);
            const c1 = this._pointColor(engine, fc[3], obj.pt_3d[fc[1]], normal);
            const c2 = this._pointColor(engine, fc[3], obj.pt_3d[fc[2]], normal);

            const r = Math.trunc((c0[0] + c1[0] + c2[0]) / 3);
            const g = Math.trunc((c0[1] + c1[1] + c2[1]) / 3);
            const b = Math.trunc((c0[2] + c1[2] + c2[2]) / 3);

            const depth = (obj.pt_3d[fc[0]][2] + obj.pt_3d[fc[1]][2] + obj.pt_3d[fc[2]][2]) / 3;

            faces.push({ k, r, g, b, depth });
        }

        faces.sort((a, b) => b.depth - a.depth);

        for (const face of faces) {
            const fc = obj.fc_lst[face.k];
            engine.scr_ctx.fillStyle = 'rgb(' + face.r + ',' + face.g + ',' + face.b + ')';
            engine.scr_ctx.beginPath();
            engine.scr_ctx.moveTo(obj.pt_2d[fc[0]][0], obj.pt_2d[fc[0]][1]);
            engine.scr_ctx.lineTo(obj.pt_2d[fc[1]][0], obj.pt_2d[fc[1]][1]);
            engine.scr_ctx.lineTo(obj.pt_2d[fc[2]][0], obj.pt_2d[fc[2]][1]);
            engine.scr_ctx.closePath();
            engine.scr_ctx.fill();
        }
    }
}
