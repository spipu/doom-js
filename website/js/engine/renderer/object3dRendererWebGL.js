class Object3dRendererWebGL extends Object3dRendererBase {

    constructor() {
        super();
        this._program  = null;
        this._vbo      = null;
        this._texCache = new WeakMap();
        this._loc      = {};
        this._skyProgram = null;   // dedicated full-screen sky program (lazy)
        this._skyVbo     = null;
        this._skyLoc     = {};
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
        gl.viewport(0, 0, engine.scrWidth, engine.scrHeight);
        const bg = engine.background;
        gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (engine.sky !== null) {
            this._drawSky(gl, engine);
        }
        gl.useProgram(this._program);
    }

    // Cylindrical-sky pre-pass: a full-screen quad sampling the sky texture by
    // view angle. Drawn first with depth test OFF (no depth write), so geometry
    // overwrites it wherever it draws — only the un-drawn sky holes keep it.
    _drawSky(gl, engine) {
        const tex = loader.textures().get(engine.sky.loaderId);
        if (!tex) {
            return;
        }
        if (!this._skyProgram) {
            this._setupSky(gl);
        }
        const loc = this._skyLoc;
        const DEG = Math.PI / 180;

        gl.useProgram(this._skyProgram);
        gl.disable(gl.DEPTH_TEST);

        gl.uniform1f(loc.w,      engine.scrWidth);
        gl.uniform1f(loc.h,      engine.scrHeight);
        gl.uniform1f(loc.yaw,    engine._viewYaw * DEG);
        gl.uniform1f(loc.pitch,  engine._viewPitch * DEG);
        gl.uniform1f(loc.fov,    engine.fov);
        gl.uniform1f(loc.wrap,   engine.sky.wrap);
        const cap = engine.background;   // sky cap colour (= scene background), above and below the band
        gl.uniform3f(loc.cap, cap[0] / 255, cap[1] / 255, cap[2] / 255);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._getTexture(gl, tex));
        gl.uniform1i(loc.sky, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyVbo);
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.enable(gl.DEPTH_TEST);
    }

    _setupSky(gl) {
        const vs = this._compile(gl, gl.VERTEX_SHADER, `
            attribute vec2 a_pos;
            void main() {
                gl_Position = vec4(a_pos, 0.0, 1.0);
            }
        `);
        const fs = this._compile(gl, gl.FRAGMENT_SHADER, `
            precision mediump float;
            uniform sampler2D u_sky;
            uniform vec3  u_cap;
            uniform float u_w, u_h, u_yaw, u_pitch, u_fov, u_wrap;
            const float PI = 3.14159265;
            const float EL_MAX  = 0.6;    // elevation (rad) the texture spans
            const float EL_DOWN = 0.12;   // shift the whole sky down a touch so its bottom dips just below the walls
            void main() {
                // Per-pixel 3D view ray → spherical (azimuth, elevation): the
                // perspective curves the sky like a dome and converges looking up.
                float nx = 2.0 * gl_FragCoord.x / u_w - 1.0;
                float ny = 2.0 * gl_FragCoord.y / u_h - 1.0;             // bottom-up
                float t  = tan(u_fov);                                    // half horizontal FOV
                vec3 r = normalize(vec3(nx * t, ny * t * (u_h / u_w), 1.0));
                float cp = cos(u_pitch), sp = sin(u_pitch);              // pitch rotation (X)
                vec3 rp = vec3(r.x, r.y * cp + r.z * sp, -r.y * sp + r.z * cp);
                float az = atan(rp.x, rp.z) + u_yaw;
                float el = asin(clamp(rp.y, -1.0, 1.0));                 // 0 = horizon
                float u  = fract(az * u_wrap / (2.0 * PI));
                float vv = (el + EL_DOWN) / EL_MAX;                       // texture bottom sits EL_DOWN below the horizon → 1 texture top
                vec3 col = texture2D(u_sky, vec2(u, 1.0 - clamp(vv, 0.0, 1.0))).rgb;
                col = mix(col, u_cap, smoothstep(0.7, 1.0, vv));         // fade up into the cap (top)
                col = ((vv < 0.0) ? u_cap : col);                        // below the lowered texture bottom: background, sharp (like GZDoom)
                gl_FragColor = vec4(col, 1.0);
            }
        `);

        this._skyProgram = gl.createProgram();
        gl.attachShader(this._skyProgram, vs);
        gl.attachShader(this._skyProgram, fs);
        gl.linkProgram(this._skyProgram);

        this._skyLoc = {
            aPos:   gl.getAttribLocation( this._skyProgram, 'a_pos'),
            sky:    gl.getUniformLocation(this._skyProgram, 'u_sky'),
            cap:    gl.getUniformLocation(this._skyProgram, 'u_cap'),
            w:      gl.getUniformLocation(this._skyProgram, 'u_w'),
            h:      gl.getUniformLocation(this._skyProgram, 'u_h'),
            yaw:    gl.getUniformLocation(this._skyProgram, 'u_yaw'),
            pitch:  gl.getUniformLocation(this._skyProgram, 'u_pitch'),
            fov:    gl.getUniformLocation(this._skyProgram, 'u_fov'),
            wrap:   gl.getUniformLocation(this._skyProgram, 'u_wrap'),
        };

        this._skyVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,   1, -1,   1, 1,
            -1, -1,   1,  1,  -1, 1
        ]), gl.STATIC_DRAW);
    }

    end(engine) {
        // no-op
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
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }
                const clampV   = fc.clampV || false;
                const animKey  = ((fc.animTextures) ? fc.animTextures.ids.join('-') : fc.textureId);
                const key      = animKey + ',' + fc.alpha + ',' + clampV;
                if (!groups.has(key)) {
                    groups.set(key, { texId: fc.textureId, animTextures: fc.animTextures, alpha: fc.alpha, isAlpha, clampV, faces: [] });
                }
                groups.get(key).faces.push(k);
            }
            return [...groups.values()].sort((a, b) => b.alpha - a.alpha);
        };

        // Draw opaque faces first, then alpha faces.
        // Alpha faces use discard in the fragment shader for transparent pixels,
        // so depth is written only where the texture is opaque (alpha >= 0.5).
        const allGroups = [
            ...buildGroups(obj._opaqueFaces, false),
            ...buildGroups(obj._alphaFaces,  true),
        ];

        for (const group of allGroups) {
            const resolvedTexId = this._resolveTexId({ textureId: group.texId, animTextures: group.animTextures }, engine._sceneMs);
            const texture = ((resolvedTexId !== null) ? loader.textures().get(resolvedTexId) : null);

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

    }

    _getTexture(gl, texture) {
        if (this._texCache.has(texture)) {
            return this._texCache.get(texture);
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(texture.data.buffer));
        const filter = (texture.isAlpha() ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
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
                    if (t.a < 0.5) { discard; }
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
