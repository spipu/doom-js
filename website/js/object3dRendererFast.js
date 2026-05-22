class Object3dRendererFast extends Object3dRendererBase {
    get code() {
        return 'fast';
    }

    begin(engine) {
        engine.scr_ctx.clearRect(0, 0, engine.scr_width, engine.scr_height);
    }

    end(engine) {
    }

    draw(obj, engine) {
        const order = [];
        for (let k = 0; k < obj.fc_nb; k++) {
            const fc    = obj.fc_lst[k];
            const depth = (obj.pt_3d[fc[0]][2] + obj.pt_3d[fc[1]][2] + obj.pt_3d[fc[2]][2]) / 3;
            order.push(k, depth);
        }
        // order = [k0, d0, k1, d1, ...] — sort pairs by depth descending
        const pairs = [];
        for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i+1]]);
        pairs.sort((a, b) => b[1] - a[1]);

        engine.scr_ctx.fillStyle   = 'rgba(250,250,250,0.7)';
        engine.scr_ctx.strokeStyle = 'rgba(150,150,150,0.7)';

        for (let i = 0; i < pairs.length; i++) {
            const fc = obj.fc_lst[pairs[i][0]];
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
