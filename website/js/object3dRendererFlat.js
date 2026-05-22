class Object3dRendererFlat extends Object3dRendererBase {
    get code() {
        return 'flat';
    }

    begin(engine) {
        engine.scr_ctx.clearRect(0, 0, engine.scr_width, engine.scr_height);
    }

    end(engine) {
    }

    draw(obj, engine) {
        const faces = [];

        for (let k = 0; k < obj.fc_nb; k++) {
            const fc      = obj.fc_lst[k];
            const normal = this._faceNormal(obj.pt_3d[fc[0]], obj.pt_3d[fc[1]], obj.pt_3d[fc[2]]);
            const p      = obj.pt_3d[fc[0]];
            if (normal[0]*p[0] + normal[1]*p[1] + normal[2]*p[2] >= 0) continue;

            const center = [
                (obj.pt_3d[fc[0]][0] + obj.pt_3d[fc[1]][0] + obj.pt_3d[fc[2]][0]) / 3,
                (obj.pt_3d[fc[0]][1] + obj.pt_3d[fc[1]][1] + obj.pt_3d[fc[2]][1]) / 3,
                (obj.pt_3d[fc[0]][2] + obj.pt_3d[fc[1]][2] + obj.pt_3d[fc[2]][2]) / 3,
                1,
            ];
            const baseColor = fc[4] !== null ? [255, 255, 255] : fc[3];
            const col = this._pointColor(engine, baseColor, center, normal);
            const r = Math.trunc(col[0]);
            const g = Math.trunc(col[1]);
            const b = Math.trunc(col[2]);

            const depth = (obj.pt_3d[fc[0]][2] + obj.pt_3d[fc[1]][2] + obj.pt_3d[fc[2]][2]) / 3;

            faces.push({ k, r, g, b, depth });
        }

        faces.sort((a, b) => b.depth - a.depth);

        for (const face of faces) {
            const fc = obj.fc_lst[face.k];
            const color = 'rgb(' + face.r + ',' + face.g + ',' + face.b + ')';
            engine.scr_ctx.fillStyle   = color;
            engine.scr_ctx.strokeStyle = color;
            engine.scr_ctx.beginPath();
            engine.scr_ctx.moveTo(obj.pt_2d[fc[0]][0], obj.pt_2d[fc[0]][1]);
            engine.scr_ctx.lineTo(obj.pt_2d[fc[1]][0], obj.pt_2d[fc[1]][1]);
            engine.scr_ctx.lineTo(obj.pt_2d[fc[2]][0], obj.pt_2d[fc[2]][1]);
            engine.scr_ctx.closePath();
            engine.scr_ctx.fill();
            engine.scr_ctx.stroke();
        }
    }
}
