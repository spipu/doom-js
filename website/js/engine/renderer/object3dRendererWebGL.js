class Object3dRendererWebGL extends Object3dRendererBase {
    constructor() {
        super();
        this._program  = null;
        this._vbo      = null;
        this._texCache = new WeakMap();
        this._groupCache = new WeakMap();      // obj → {version, groups}: draw-state partition, see _groupsFor
        this._vertexData = new Float32Array(0); // grown on demand, never reallocated per frame
        this._texList   = [];       // every uploaded texture, to re-filter them on a smoothing toggle
        this._smoothing = null;     // filter currently applied to them (null = not applied yet)
        this._loc      = {};
        this._skyProgram = null;   // dedicated full-screen sky program (lazy)
        this._skyVbo     = null;
        this._skyLoc     = {};
        this._overlayProgram = null;   // dedicated screen-space overlay-sprite program (lazy)
        this._overlayVbo     = null;
        this._overlayLoc     = {};
        // Neutral depth-shading parameters (engine.depthShading === null):
        // every term zeroes out so the attenuation is exactly 1.0 — rampCount
        // stays non-zero because the shader divides by it.
        this._dsNeutral = {visibility: 0.0, visibilityMax: 0.0, shadeBase: 0.0, shadeScale: 0.0, rampCount: 32.0, strength: 0.0};
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
        this._syncTextureFilter(gl, engine);
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
        this._skyProgram = this._linkProgram(gl, `
            attribute vec2 a_pos;
            void main() {
                gl_Position = vec4(a_pos, 0.0, 1.0);
            }
        `, `
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

    // One textured quad drawn over the scene, depth test OFF, tinted by light
    // (contract on Object3dRendererBase.drawScreenSprite).
    drawScreenSprite(engine, texId, x, y, w, h, light) {
        const gl  = engine.scrCtx;
        const tex = ((texId !== null) ? loader.textures().get(texId) : null);
        if (!gl || !tex) {
            return;
        }
        if (!this._overlayProgram) {
            this._setupOverlay(gl);
        }
        const loc = this._overlayLoc;
        const xl = x * 2.0 - 1.0;
        const xr = (x + w) * 2.0 - 1.0;
        const yt = 1.0 - y * 2.0;
        const yb = 1.0 - (y + h) * 2.0;

        gl.useProgram(this._overlayProgram);
        gl.disable(gl.DEPTH_TEST);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._overlayVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            xl, yt, 0, 0,   xr, yt, 1, 0,   xr, yb, 1, 1,
            xl, yt, 0, 0,   xr, yb, 1, 1,   xl, yb, 0, 1,
        ]), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(loc.aUv);
        gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._getTexture(gl, tex));
        gl.uniform1i(loc.tex, 0);
        gl.uniform1f(loc.light, light);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.enable(gl.DEPTH_TEST);
    }

    _setupOverlay(gl) {
        this._overlayProgram = this._linkProgram(gl, `
            attribute vec2 a_pos;
            attribute vec2 a_uv;
            varying vec2 v_uv;
            void main() {
                gl_Position = vec4(a_pos, 0.0, 1.0);
                v_uv = a_uv;
            }
        `, `
            precision mediump float;
            uniform sampler2D u_tex;
            uniform float u_light;
            varying vec2 v_uv;
            void main() {
                vec4 t = texture2D(u_tex, v_uv);
                if (t.a < 0.5) {
                    discard;
                }
                gl_FragColor = vec4(t.rgb * u_light, t.a);
            }
        `);

        this._overlayLoc = {
            aPos:  gl.getAttribLocation( this._overlayProgram, 'a_pos'),
            aUv:   gl.getAttribLocation( this._overlayProgram, 'a_uv'),
            tex:   gl.getUniformLocation(this._overlayProgram, 'u_tex'),
            light: gl.getUniformLocation(this._overlayProgram, 'u_light'),
        };

        this._overlayVbo = gl.createBuffer();
    }

    // Compile + link a vertex/fragment program (shared by every pass).
    _linkProgram(gl, vsSrc, fsSrc) {
        const program = gl.createProgram();
        gl.attachShader(program, this._compile(gl, gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(program, this._compile(gl, gl.FRAGMENT_SHADER, fsSrc));
        gl.linkProgram(program);
        return program;
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
        gl.uniform1f(loc.near, engine.zBuffer.getNear());
        gl.uniform1f(loc.far,  engine.zBuffer.getFar());

        // Depth shading curve — read every draw so a toggle applies instantly.
        const ds = ((engine.depthShading !== null) ? engine.depthShading : this._dsNeutral);
        gl.uniform1f(loc.dsVis,      ds.visibility);
        gl.uniform1f(loc.dsVisMax,   ds.visibilityMax);
        gl.uniform1f(loc.dsBase,     ds.shadeBase);
        gl.uniform1f(loc.dsScale,    ds.shadeScale);
        gl.uniform1f(loc.dsRamp,     ds.rampCount);
        gl.uniform1f(loc.dsStrength, ds.strength);

        for (const group of this._groupsFor(obj)) {
            const data = this._ensureVertexData(group.faces.length * 3 * 9);
            let di = 0;
            for (const k of group.faces) {
                const fc  = obj.faceList[k];
                // Back-face culling lives here rather than in the grouping: the
                // groups are cached across frames, and which faces turn away
                // from the eye changes with every camera move.
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }
                // Scroll baked into the per-frame VBO: the fract() wrap in the
                // fragment shader absorbs the (already wrapped) offset.
                const scroll = this._uvScrollOffset(fc, engine._sceneMs);
                const lf     = obj.getFaceLightFactor(fc) * engine.instanceLight;
                // Light level (0..1) fed to the depth shading curve: max of the
                // face colour (before the ambient of _pointColor) times the live
                // light factor. Untextured face colours are 0..255.
                const fcMax   = Math.max(fc.color[0], Math.max(fc.color[1], fc.color[2]));
                const fcLight = Math.min(1.0, ((group.texId !== null) ? fcMax : fcMax / 255.0) * lf);
                for (let v = 0; v < 3; v++) {
                    const ptIdx = fc.pts[v];
                    const pt  = obj.pt3d[ptIdx];
                    const col = this._pointColor(engine, fc.color, pt, fc.normal);
                    const uv  = ((fc.map) ? fc.map[v] : [0, 0]);
                    data[di++] = pt[0];  data[di++] = pt[1];  data[di++] = pt[2];
                    data[di++] = col[0] * lf; data[di++] = col[1] * lf; data[di++] = col[2] * lf;
                    data[di++] = uv[0] + scroll[0];  data[di++] = uv[1] + scroll[1];
                    data[di++] = fcLight;
                }
            }
            // Every face of the group turned away: nothing to upload or draw.
            if (di === 0) {
                continue;
            }

            // Additive groups (energy sprites) add their colour to the scene and
            // don't write depth, so overlapping glows accumulate. Textures are
            // premultiplied (alpha already in the RGB), hence the ONE source
            // factor in both modes. State is restored after the loop.
            if (group.blendAdd) {
                gl.blendFunc(gl.ONE, gl.ONE);
                gl.depthMask(false);
            } else {
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.depthMask(true);
            }
            const resolvedTexId = this._resolveTexId({ textureId: group.texId, animTextures: group.animTextures }, engine._sceneMs);
            const texture = ((resolvedTexId !== null) ? loader.textures().get(resolvedTexId) : null);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
            gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, di), gl.DYNAMIC_DRAW);

            const stride = 9 * 4;
            gl.enableVertexAttribArray(loc.aPos);
            gl.vertexAttribPointer(loc.aPos,   3, gl.FLOAT, false, stride,  0);
            gl.enableVertexAttribArray(loc.aColor);
            gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, stride, 12);
            gl.enableVertexAttribArray(loc.aUv);
            gl.vertexAttribPointer(loc.aUv,    2, gl.FLOAT, false, stride, 24);
            gl.enableVertexAttribArray(loc.aLight);
            gl.vertexAttribPointer(loc.aLight, 1, gl.FLOAT, false, stride, 32);

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

            gl.drawArrays(gl.TRIANGLES, 0, di / 9);
        }
        // Restore the default blend state for the next object / pass.
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true);
    }

    /**
     * Faces of an object grouped by draw state (texture / animation set / face
     * opacity / clamp / additive), opaque groups first then translucent ones —
     * alpha faces discard their transparent pixels in the shader, so depth is
     * written only where the texture is opaque.
     *
     * Cached per object: the grouping walks every face and builds a string key
     * for each, which on the level map means tens of thousands of key builds per
     * frame for a partition that almost never changes. It is rebuilt only when
     * the object reports a new face-groups version (a switch swapping SW1↔SW2,
     * a "+change" floor swapping its flat).
     */
    _groupsFor(obj) {
        const cached = this._groupCache.get(obj);
        if ((cached !== undefined) && (cached.version === obj.getFaceGroupsVersion())) {
            return cached.groups;
        }

        const groups = new Map();
        const collect = (faceIndices) => {
            for (const k of faceIndices) {
                const fc       = obj.faceList[k];
                const clampV   = fc.clampV || false;
                const blendAdd = fc.blendAdd || false;
                const animKey  = ((fc.animTextures) ? fc.animTextures.ids.join('-') : fc.textureId);
                const key      = animKey + ',' + fc.alpha + ',' + clampV + ',' + blendAdd;
                if (!groups.has(key)) {
                    groups.set(key, { texId: fc.textureId, animTextures: fc.animTextures, alpha: fc.alpha, clampV, blendAdd, faces: [] });
                }
                groups.get(key).faces.push(k);
            }
        };
        collect(obj._opaqueFaces);
        const opaque = [...groups.values()].sort((a, b) => b.alpha - a.alpha);
        groups.clear();
        collect(obj._alphaFaces);
        const alpha = [...groups.values()].sort((a, b) => b.alpha - a.alpha);

        const built = [...opaque, ...alpha];
        this._groupCache.set(obj, {version: obj.getFaceGroupsVersion(), groups: built});
        return built;
    }

    // Vertex staging buffer, kept and grown instead of reallocated: the level map
    // alone needs ~300 000 floats — a multi-megabyte allocation per frame
    // otherwise. The caller uploads only the slice it filled.
    _ensureVertexData(floats) {
        if (this._vertexData.length < floats) {
            let size = Math.max(this._vertexData.length, 1024);
            while (size < floats) {
                size *= 2;
            }
            this._vertexData = new Float32Array(size);
        }
        return this._vertexData;
    }

    _getTexture(gl, texture) {
        if (this._texCache.has(texture)) {
            return this._texCache.get(texture);
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._premultiply(texture.data));
        this._applyTextureFilter(gl);
        // Always CLAMP_TO_EDGE: repetition is handled by fract() in the fragment shader,
        // preventing LINEAR filter from bleeding across the tile boundary at v=1.0.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._texCache.set(texture, tex);
        this._texList.push(tex);
        return tex;
    }

    // The filter is a per-texture GL parameter, so a toggle of
    // engine.textureSmoothing re-applies it to everything already uploaded —
    // hence the list beside the (non-enumerable) WeakMap cache.
    _syncTextureFilter(gl, engine) {
        if (engine.textureSmoothing === this._smoothing) {
            return;
        }
        this._smoothing = engine.textureSmoothing;
        for (const tex of this._texList) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            this._applyTextureFilter(gl);
        }
    }

    // Filter of the BOUND texture. Sprites and weapons follow the scene: their
    // a<0.5 discard keeps clean edges when smoothed, and raw texels give back
    // the original pixelated look.
    _applyTextureFilter(gl) {
        // Tested on false, so the not-applied-yet state falls back to the
        // smoothed default instead of the opt-in one.
        const filter = ((this._smoothing === false) ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }

    // Premultiplied alpha upload: with straight alpha, LINEAR filtering blends
    // the transparent texels' black RGB into the opaque edges (grey fringe);
    // with RGB×α and (ONE, ONE_MINUS_SRC_ALPHA) the interpolation is correct.
    // Works on a copy: the source ImageData is shared with the software
    // renderers, which expect straight alpha.
    // (UNPACK_PREMULTIPLY_ALPHA_WEBGL is ignored for ArrayBufferView uploads.)
    _premultiply(pixels) {
        const src  = new Uint8Array(pixels.buffer);
        const data = new Uint8Array(src.length);
        for (let i = 0; i < src.length; i += 4) {
            const a = src[i + 3];
            if (a === 255) {
                data[i]     = src[i];
                data[i + 1] = src[i + 1];
                data[i + 2] = src[i + 2];
            }
            if ((a > 0) && (a < 255)) {
                data[i]     = Math.round(src[i]     * a / 255);
                data[i + 1] = Math.round(src[i + 1] * a / 255);
                data[i + 2] = Math.round(src[i + 2] * a / 255);
            }
            data[i + 3] = a;
        }
        return data;
    }

    _setup(gl) {
        this._program = this._linkProgram(gl, `
            attribute vec3 a_pos;
            attribute vec3 a_color;
            attribute vec2 a_uv;
            attribute float a_light;
            uniform float u_sx, u_sy, u_ox, u_oy, u_w, u_h, u_near, u_far;
            varying vec3 v_color;
            varying vec2 v_uv;
            varying float v_light;
            varying float v_depth;
            void main() {
                float z  = ((a_pos.z == 0.0) ? 1e-5 : a_pos.z);
                float xn = 2.0 * (u_sx * a_pos.x / z - u_ox) / u_w - 1.0;
                float yn = 1.0 - 2.0 * (-u_sy * a_pos.y / z - u_oy) / u_h;
                float A  = (u_far + u_near) / (u_far - u_near);
                float B  = -2.0 * u_far * u_near / (u_far - u_near);
                gl_Position = vec4(xn * z, yn * z, A * z + B, z);
                v_color = a_color;
                v_uv    = a_uv;
                v_light = a_light;
                v_depth = z;
            }
        `, `
            precision mediump float;
            uniform sampler2D u_tex;
            uniform int       u_hasTex;
            uniform float     u_alpha;
            uniform int       u_clampV;
            uniform float     u_dsVis, u_dsVisMax, u_dsBase, u_dsScale, u_dsRamp, u_dsStrength;
            varying vec3 v_color;
            varying vec2 v_uv;
            varying float v_light;
            varying float v_depth;
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
                    if (t.a < 0.5) {
                        discard;
                    }
                    col = min(v_color * t.rgb, vec3(1.0));
                    a   = t.a * u_alpha;
                } else {
                    col = min(v_color / 255.0, vec3(1.0));
                    a   = u_alpha;
                }
                // Depth shading (engine.setDepthShading): the pixel darkens
                // with the view depth, the darker the face light the sooner,
                // scaled by the curve strength. Disabled = neutral uniforms
                // => dsIndex 0, one shader path for both states.
                float dsVis   = min(u_dsVis / v_depth, u_dsVisMax);
                float dsIndex = clamp((u_dsBase - (u_dsScale * v_light) - dsVis) * (u_dsRamp - 1.0), 0.0, u_dsRamp - 1.0);
                col = col * (1.0 - (u_dsStrength * dsIndex / u_dsRamp));
                // Premultiplied output: the face opacity also scales the RGB
                // (the texture alpha is already baked into t.rgb at upload).
                gl_FragColor = vec4(col * u_alpha, a);
            }
        `);
        gl.useProgram(this._program);

        this._loc = {
            aPos:       gl.getAttribLocation( this._program, 'a_pos'),
            aColor:     gl.getAttribLocation( this._program, 'a_color'),
            aUv:        gl.getAttribLocation( this._program, 'a_uv'),
            aLight:     gl.getAttribLocation( this._program, 'a_light'),
            sx:         gl.getUniformLocation(this._program, 'u_sx'),
            sy:         gl.getUniformLocation(this._program, 'u_sy'),
            ox:         gl.getUniformLocation(this._program, 'u_ox'),
            oy:         gl.getUniformLocation(this._program, 'u_oy'),
            w:          gl.getUniformLocation(this._program, 'u_w'),
            h:          gl.getUniformLocation(this._program, 'u_h'),
            near:       gl.getUniformLocation(this._program, 'u_near'),
            far:        gl.getUniformLocation(this._program, 'u_far'),
            uTex:       gl.getUniformLocation(this._program, 'u_tex'),
            hasTex:     gl.getUniformLocation(this._program, 'u_hasTex'),
            alpha:      gl.getUniformLocation(this._program, 'u_alpha'),
            clampV:     gl.getUniformLocation(this._program, 'u_clampV'),
            dsVis:      gl.getUniformLocation(this._program, 'u_dsVis'),
            dsVisMax:   gl.getUniformLocation(this._program, 'u_dsVisMax'),
            dsBase:     gl.getUniformLocation(this._program, 'u_dsBase'),
            dsScale:    gl.getUniformLocation(this._program, 'u_dsScale'),
            dsRamp:     gl.getUniformLocation(this._program, 'u_dsRamp'),
            dsStrength: gl.getUniformLocation(this._program, 'u_dsStrength'),
        };

        this._vbo = gl.createBuffer();
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        // Premultiplied-alpha pipeline: the source factor is ONE everywhere.
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
