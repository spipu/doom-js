class Object3dRendererWebGL extends Object3dRendererBase {

    constructor() {
        super();
        this._program  = null;
        this._vbo      = null;
        this._texCache = new WeakMap();
        this._loc      = {};
    }

    get code() {
        return 'webgl';
    }

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
        if (!ctx) {
            throw new Error('WebGL not available');
        }
        return ctx;
    }

    begin(engine) {
        const gl = engine.scrCtx;
        if (!gl) {
            return;
        }
        if (!this._program) {
            this._setup(gl);
        }
        gl.useProgram(this._program);
        gl.viewport(0, 0, engine.scrWidth, engine.scrHeight);
        const bg = engine.background;
        gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    end(engine) {
    }

    draw(obj, engine) {
        const gl  = engine.scrCtx;
        if (!gl) {
            return;
        }
        const loc = this._loc;

        gl.uniform1f(loc.sx,   engine.projScaleX);
        gl.uniform1f(loc.sy,   engine.projScaleY);
        gl.uniform1f(loc.ox,   engine.projOffsetX);
        gl.uniform1f(loc.oy,   engine.projOffsetY);
        gl.uniform1f(loc.w,    engine.scrWidth);
        gl.uniform1f(loc.h,    engine.scrHeight);
        gl.uniform1f(loc.near, engine.zBuffer._z_near);
        gl.uniform1f(loc.far,  engine.zBuffer._z_far);

        const buildGroups = (faceIndices, isAlpha) => {
            const groups = new Map();
            for (const k of faceIndices) {
                const fc     = obj.faceList[k];
                const n      = fc.normal;
                const p      = obj.pt3d[fc.pts[0]];
                if (n[0]*p[0] + n[1]*p[1] + n[2]*p[2] >= 0) {
                    continue;
                }
                const clampV = fc.clampV || false;
                const key    = fc.textureId + ',' + fc.alpha + ',' + clampV;
                if (!groups.has(key)) {
                    groups.set(key, { texId: fc.textureId, animTextures: fc.animTextures, alpha: fc.alpha, isAlpha, clampV, faces: [] });
                }
                groups.get(key).faces.push(k);
            }
            return [...groups.values()].sort((a, b) => b.alpha - a.alpha);
        };

        // Draw opaque faces first (depth write on), then alpha faces (depth write off)
        const allGroups = [
            ...buildGroups(obj._opaqueFaces, false),
            ...buildGroups(obj._alphaFaces,  true),
        ];
        let depthWriting = true;

        for (const group of allGroups) {
            const resolvedTexId = this._resolveTexId({ textureId: group.texId, animTextures: group.animTextures }, engine._sceneMs);
            const texture = ((resolvedTexId !== null) ? obj.textureList[resolvedTexId] : null);
            const opaque  = !group.isAlpha;

            if (opaque && !depthWriting) { gl.depthMask(true);  depthWriting = true;  }
            if (!opaque && depthWriting) { gl.depthMask(false); depthWriting = false; }

            const data = new Float32Array(group.faces.length * 3 * 8);
            let di = 0;
            for (const k of group.faces) {
                const fc  = obj.faceList[k];
                for (let v = 0; v < 3; v++) {
                    const ptIdx = fc.pts[v];
                    const pt  = obj.pt3d[ptIdx];
                    const col = this._pointColor(engine, fc.color, pt, fc.normal);
                    const uv  = ((fc.map) ? fc.map[v] : [0, 0]);
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

            gl.uniform1f(loc.alpha, group.alpha);
            gl.uniform1i(loc.clampV, ((group.clampV) ? 1 : 0));
            if (texture) {
                gl.uniform1i(loc.hasTex, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this._getTexture(gl, texture));
                gl.uniform1i(loc.uTex, 0);
            } else {
                gl.uniform1i(loc.hasTex, 0);
            }

            gl.drawArrays(gl.TRIANGLES, 0, group.faces.length * 3);
        }

        if (!depthWriting) {
            gl.depthMask(true);
        }
    }

    _getTexture(gl, texture) {
        if (this._texCache.has(texture)) {
            return this._texCache.get(texture);
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(texture.data.buffer));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        // Always CLAMP_TO_EDGE: repetition is handled by fract() in the fragment shader,
        // preventing LINEAR filter from bleeding across the tile boundary at v=1.0.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._texCache.set(texture, tex);
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
                float z  = ((a_pos.z == 0.0) ? 1e-5 : a_pos.z);
                float xn = 2.0 * (u_sx * a_pos.x / z - u_ox) / u_w - 1.0;
                float yn = 1.0 - 2.0 * (-u_sy * a_pos.y / z - u_oy) / u_h;
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
            uniform int       u_clampV;
            varying vec3 v_color;
            varying vec2 v_uv;
            void main() {
                vec3  col;
                float a;
                if (u_hasTex == 1) {
                    vec2 uv;
                    if (u_clampV == 1) {
                        uv.x = fract(v_uv.x);
                        uv.y = clamp(v_uv.y, 0.0, 1.0);
                    } else {
                        uv = fract(v_uv);
                    }
                    vec4 t  = texture2D(u_tex, uv);
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
            clampV: gl.getUniformLocation(this._program, 'u_clampV'),
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
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
        }
        return shader;
    }
}
