class Object3dRendererWebGL extends Object3dRendererBase {

    constructor() {
        super();
        this._program  = null;
        this._vbo      = null;
        this._texCache = new WeakMap();
        this._loc      = {};
    }

    get code() { return 'webgl'; }

    isAvailable() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    initCanvas(canvas) {
        const ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!ctx) throw new Error('WebGL not available');
        return ctx;
    }

    begin(engine) {
        const gl = engine.scr_ctx;
        if (!gl) return;
        if (!this._program) this._setup(gl);
        gl.useProgram(this._program);
        gl.viewport(0, 0, engine.scr_width, engine.scr_height);
        const bg = engine.background;
        gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    end(engine) {}

    draw(obj, engine) {
        const gl  = engine.scr_ctx;
        if (!gl) return;
        const loc = this._loc;

        for (let k = 0; k < obj.fc_nb; k++) {
            const fc = obj.fc_lst[k];
            obj.fc_inf[k][0] = this._faceNormal(obj.pt_3d[fc[0]], obj.pt_3d[fc[1]], obj.pt_3d[fc[2]]);
        }

        gl.uniform1f(loc.sx,   engine.proj_scaleX);
        gl.uniform1f(loc.sy,   engine.proj_scaleY);
        gl.uniform1f(loc.ox,   engine.proj_offsetX);
        gl.uniform1f(loc.oy,   engine.proj_offsetY);
        gl.uniform1f(loc.w,    engine.scr_width);
        gl.uniform1f(loc.h,    engine.scr_height);
        gl.uniform1f(loc.near, engine.zBuffer._z_near);
        gl.uniform1f(loc.far,  engine.zBuffer._z_far);

        // Group visible faces by texture — back-face cull in 3D camera space:
        // dot(normal, vertex_pos) < 0 means face points toward camera
        const groups = new Map();
        for (let k = 0; k < obj.fc_nb; k++) {
            const fc = obj.fc_lst[k];
            const n  = obj.fc_inf[k][0];
            const p  = obj.pt_3d[fc[0]];
            if (n[0]*p[0] + n[1]*p[1] + n[2]*p[2] >= 0) continue;
            const texId = fc[4];
            if (!groups.has(texId)) groups.set(texId, []);
            groups.get(texId).push(k);
        }

        for (const [texId, faceList] of groups) {
            const texture = (texId !== null) ? obj.tx_lst[texId] : null;

            // Build interleaved VBO: [x, y, z, r, g, b, u, v] × 3 vertices × N faces
            const data = new Float32Array(faceList.length * 3 * 8);
            let di = 0;
            for (const k of faceList) {
                const fc     = obj.fc_lst[k];
                const normal = obj.fc_inf[k][0];
                const map    = fc[5];
                for (let v = 0; v < 3; v++) {
                    const pt  = obj.pt_3d[fc[v]];
                    const col = this._pointColor(engine, fc[3], pt, normal);
                    const uv  = map ? map[v] : [0, 0];
                    data[di++] = pt[0];  data[di++] = pt[1];  data[di++] = pt[2];
                    data[di++] = col[0]; data[di++] = col[1]; data[di++] = col[2];
                    data[di++] = uv[0];  data[di++] = uv[1];
                }
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

            const stride = 8 * 4;
            gl.enableVertexAttribArray(loc.aPos);
            gl.vertexAttribPointer(loc.aPos,   3, gl.FLOAT, false, stride,  0);
            gl.enableVertexAttribArray(loc.aColor);
            gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, stride, 12);
            gl.enableVertexAttribArray(loc.aUv);
            gl.vertexAttribPointer(loc.aUv,    2, gl.FLOAT, false, stride, 24);

            if (texture) {
                gl.uniform1i(loc.hasTex, 1);
                gl.uniform1f(loc.alpha,  1.0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this._getTexture(gl, texture));
                gl.uniform1i(loc.uTex, 0);
            } else {
                gl.uniform1i(loc.hasTex, 0);
                gl.uniform1f(loc.alpha,  1.0);
            }

            gl.drawArrays(gl.TRIANGLES, 0, faceList.length * 3);
        }
    }

    _getTexture(gl, imageData) {
        if (this._texCache.has(imageData)) return this._texCache.get(imageData);
        const tex  = gl.createTexture();
        const w    = imageData.width;
        const h    = imageData.height;
        const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;
        const wrap = (pow2(w) && pow2(h)) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(imageData.data.buffer));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        this._texCache.set(imageData, tex);
        return tex;
    }

    _setup(gl) {
        const vs = this._compile(gl, gl.VERTEX_SHADER, `
            attribute vec3 a_pos;
            attribute vec3 a_color;
            attribute vec2 a_uv;
            uniform float u_sx, u_sy, u_ox, u_oy, u_w, u_h, u_near, u_far;
            varying vec3 v_color;
            varying vec2 v_uv;
            void main() {
                float z  = a_pos.z;
                float xn = 2.0 * (u_sx * a_pos.x / z - u_ox) / u_w - 1.0;
                float yn = 1.0 - 2.0 * (u_sy * a_pos.y / z - u_oy) / u_h;
                float A  = (u_far + u_near) / (u_far - u_near);
                float B  = -2.0 * u_far * u_near / (u_far - u_near);
                gl_Position = vec4(xn * z, yn * z, A * z + B, z);
                v_color = a_color;
                v_uv    = a_uv;
            }
        `);
        const fs = this._compile(gl, gl.FRAGMENT_SHADER, `
            precision mediump float;
            uniform sampler2D u_tex;
            uniform int       u_hasTex;
            uniform float     u_alpha;
            varying vec3 v_color;
            varying vec2 v_uv;
            void main() {
                vec3  col;
                float a;
                if (u_hasTex == 1) {
                    vec4 t = texture2D(u_tex, v_uv);
                    col = min(v_color * t.rgb, vec3(1.0));
                    a   = t.a * u_alpha;
                } else {
                    col = min(v_color / 255.0, vec3(1.0));
                    a   = u_alpha;
                }
                gl_FragColor = vec4(col, a);
            }
        `);

        this._program = gl.createProgram();
        gl.attachShader(this._program, vs);
        gl.attachShader(this._program, fs);
        gl.linkProgram(this._program);
        gl.useProgram(this._program);

        this._loc = {
            aPos:   gl.getAttribLocation( this._program, 'a_pos'),
            aColor: gl.getAttribLocation( this._program, 'a_color'),
            aUv:    gl.getAttribLocation( this._program, 'a_uv'),
            sx:     gl.getUniformLocation(this._program, 'u_sx'),
            sy:     gl.getUniformLocation(this._program, 'u_sy'),
            ox:     gl.getUniformLocation(this._program, 'u_ox'),
            oy:     gl.getUniformLocation(this._program, 'u_oy'),
            w:      gl.getUniformLocation(this._program, 'u_w'),
            h:      gl.getUniformLocation(this._program, 'u_h'),
            near:   gl.getUniformLocation(this._program, 'u_near'),
            far:    gl.getUniformLocation(this._program, 'u_far'),
            uTex:   gl.getUniformLocation(this._program, 'u_tex'),
            hasTex: gl.getUniformLocation(this._program, 'u_hasTex'),
            alpha:  gl.getUniformLocation(this._program, 'u_alpha'),
        };

        this._vbo = gl.createBuffer();
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    _compile(gl, type, src) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            console.error('Shader error:', gl.getShaderInfoLog(shader));
        return shader;
    }
}
