class Object3dRendererFast {
    get code() {
        return 'fast';
    }

    begin(engine) {
        engine.scr_ctx.clearRect(0, 0, engine.scr_width, engine.scr_height);
    }

    end(engine) {}

    draw(obj, engine) {
        for (let k = 0; k < obj.fc_nb; k++) {
            const fc = obj.fc_lst[k];
            obj.fc_inf[k][0] = k;
            obj.fc_inf[k][1] = (obj.pt_3d[fc[0]][2] + obj.pt_3d[fc[1]][2] + obj.pt_3d[fc[2]][2]) / 3.;
        }
        obj.fc_inf.sort((a, b) => b[1] - a[1]);

        engine.scr_ctx.fillStyle   = 'rgba(250,250,250,0.7)';
        engine.scr_ctx.strokeStyle = 'rgba(150,150,150,0.7)';

        for (let k = 0; k < obj.fc_nb; k++) {
            const fc = obj.fc_lst[obj.fc_inf[k][0]];
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
