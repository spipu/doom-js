class Object3dRendererWebGL extends Object3dRendererBase {
    constructor() {
        super();
        this._program          = null;
        this._vbo              = null;
        this._texCache         = new WeakMap();
        this._groupCache       = new WeakMap();       // obj → {version, groups}: draw-state partition, see _groupsFor
        this._vertexData       = new Float32Array(0); // grown on demand, never reallocated per frame
        this._uploadedTextures = [];                  // to re-filter them on a smoothing toggle
        this._appliedSmoothing = null;                // null = no filter applied yet
        this._loc              = {};
        this._skyProgram       = null;                // built on the first sky frame
        this._skyVbo           = null;
        this._skyLoc           = {};
        this._overlayProgram   = null;                // built on the first screen sprite
        this._overlayVbo       = null;
        this._overlayLoc       = {};
        // Attenuation exactly 1.0; rampCount stays non-zero because the shader
        // divides by it.
        this._neutralDepthShading = {visibility: 0.0, visibilityMax: 0.0, shadeBase: 0.0, shadeScale: 0.0, rampCount: 32.0, strength: 0.0};
        // Engine3d.setBloom: resources made on the first bloom frame, freed on the first frame without it.
        this._bloom      = new RendererWebglBloom();
        this._bloomState = new Float32Array(RendererWebglBloom.STATE_SIZE);
    }

    get code() {
        return 'webgl';
    }

    needsProjection() {
        return false;
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
        const ctx = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
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
        if (engine.bloom !== null) {
            this._bloom.begin(gl, engine);
        } else if (this._bloom.hasResources()) {
            this._bloom.release(gl);
        }
        gl.viewport(0, 0, engine.scrWidth, engine.scrHeight);
        const bg = engine.background;
        gl.clearColor(bg[0] / 255, bg[1] / 255, bg[2] / 255, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (engine.sky !== null) {
            this._drawSky(gl, engine);
        }
        gl.useProgram(this._program);
        gl.uniform1f(this._loc.coreWhite, 0);
    }

    // With bloom, the glowing faces of the layer are drawn against its depth before it is cleared.
    clearDepth(engine) {
        const gl = engine.scrCtx;
        if (!gl) {
            return;
        }
        if (engine.bloom !== null) {
            this._bloom.flushGlow(gl, this);
        }
        gl.clear(gl.DEPTH_BUFFER_BIT);
    }

    end(engine) {
        super.end(engine);
        const gl = engine.scrCtx;
        if (gl && (engine.bloom !== null)) {
            this._bloom.end(gl, engine, this);
        }
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
        gl.uniform1f(loc.yaw,    engine.viewYaw * DEG);
        gl.uniform1f(loc.pitch,  engine.viewPitch * DEG);
        // The sky leans with the camera when it asks for it (a car rolling on the road); a Doom sky stays level.
        gl.uniform1f(loc.roll,   ((engine.sky.followRoll === true) ? (engine.viewRoll * DEG) : 0));
        gl.uniform1f(loc.fov,    engine.fov);
        gl.uniform1f(loc.wrap,   engine.sky.wrap);
        gl.uniform1f(loc.elTop,    (engine.sky.top ?? Object3dRendererWebGL.SKY_TOP));
        gl.uniform1f(loc.elBottom, (engine.sky.bottom ?? Object3dRendererWebGL.SKY_BOTTOM));
        gl.uniform1f(loc.mirror,   ((engine.sky.mirrorBelow === false) ? 0 : 1));
        // Cap colours above and below the textured band: top = the scene
        // background, bottom = the sky's own bottom cap when it declares one
        // (looking down past the band, e.g. through a sky floor).
        const cap  = engine.background;
        const capB = (engine.sky.capBottom ?? cap);
        gl.uniform3f(loc.cap,  cap[0] / 255, cap[1] / 255, cap[2] / 255);
        gl.uniform3f(loc.capB, capB[0] / 255, capB[1] / 255, capB[2] / 255);

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
            uniform vec3  u_cap, u_capB;
            uniform float u_w, u_h, u_yaw, u_pitch, u_roll, u_fov, u_wrap, u_elTop, u_elBottom, u_mirror;
            const float PI = 3.14159265;
            void main() {
                // Per-pixel 3D view ray → spherical (azimuth, elevation): the
                // perspective curves the sky like a dome and converges looking up.
                float nx = 2.0 * gl_FragCoord.x / u_w - 1.0;
                float ny = 2.0 * gl_FragCoord.y / u_h - 1.0;             // bottom-up
                float t  = tan(u_fov);                                    // half horizontal FOV
                vec3 r = normalize(vec3(nx * t, ny * t * (u_h / u_w), 1.0));
                float cp = cos(u_pitch), sp = sin(u_pitch);              // pitch rotation (X)
                vec3 rq = vec3(r.x, r.y * cp + r.z * sp, -r.y * sp + r.z * cp);
                float cr = cos(u_roll), sr = sin(u_roll);                // camera lean (Z) after the pitch, the inverse of setCamera's
                vec3 rp = vec3(rq.x * cr + rq.y * sr, -rq.x * sr + rq.y * cr, rq.z);
                float az = atan(rp.x, rp.z) + u_yaw;
                float el = asin(clamp(rp.y, -1.0, 1.0));                 // 0 = horizon
                float u  = fract(az * u_wrap / (2.0 * PI));
                float vv = (el - u_elBottom) / (u_elTop - u_elBottom);    // 0 = texture bottom, 1 = texture top
                if (u_mirror < 0.5) {
                    // Panorama: the texture holds its own ground; plain caps beyond it.
                    vec3 band = texture2D(u_sky, vec2(u, 1.0 - clamp(vv, 0.0, 1.0))).rgb;
                    gl_FragColor = vec4(((vv > 1.0) ? u_cap : ((vv < 0.0) ? u_capB : band)), 1.0);
                    return;
                }
                // Below the band the texture is MIRRORED downward (GZDoom's
                // lower sky dome — sky floors show sky, not a flat cap), and
                // each side fades into its own cap when looking steeply.
                float vs = abs(vv);
                vec3 col = texture2D(u_sky, vec2(u, 1.0 - clamp(vs, 0.0, 1.0))).rgb;
                col = mix(col, ((vv < 0.0) ? u_capB : u_cap), smoothstep(0.7, 1.0, vs));
                gl_FragColor = vec4(col, 1.0);
            }
        `);

        this._skyLoc = {
            aPos:   gl.getAttribLocation( this._skyProgram, 'a_pos'),
            sky:    gl.getUniformLocation(this._skyProgram, 'u_sky'),
            cap:    gl.getUniformLocation(this._skyProgram, 'u_cap'),
            capB:   gl.getUniformLocation(this._skyProgram, 'u_capB'),
            w:      gl.getUniformLocation(this._skyProgram, 'u_w'),
            h:      gl.getUniformLocation(this._skyProgram, 'u_h'),
            yaw:    gl.getUniformLocation(this._skyProgram, 'u_yaw'),
            pitch:  gl.getUniformLocation(this._skyProgram, 'u_pitch'),
            roll:   gl.getUniformLocation(this._skyProgram, 'u_roll'),
            fov:    gl.getUniformLocation(this._skyProgram, 'u_fov'),
            wrap:   gl.getUniformLocation(this._skyProgram, 'u_wrap'),
            elTop:    gl.getUniformLocation(this._skyProgram, 'u_elTop'),
            elBottom: gl.getUniformLocation(this._skyProgram, 'u_elBottom'),
            mirror:   gl.getUniformLocation(this._skyProgram, 'u_mirror'),
        };

        this._skyVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._skyVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,   1, -1,   1, 1,
            -1, -1,   1,  1,  -1, 1
        ]), gl.STATIC_DRAW);
    }

    // One textured quad drawn over the scene, depth test OFF, tinted by light,
    // faded by alpha (contract on Object3dRendererBase.drawScreenSprite). The
    // scene-wide light floor and boost apply to the tint here too — the overlay
    // is part of the scene (view sprites), so a fullbright or flashing scene
    // lights it as well.
    drawScreenSprite(engine, texId, x, y, w, h, light, alpha = 1) {
        light = Math.max(light, (engine.lightOverride ?? 0));
        if (light < 1) {
            light = Math.min(1, light + engine.lightBoost);
        }
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
        gl.uniform1f(loc.alpha, alpha);
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
            uniform float u_light, u_alpha;
            varying vec2 v_uv;
            void main() {
                vec4 t = texture2D(u_tex, v_uv);
                if (t.a < 0.5) {
                    discard;
                }
                // Premultiplied output (the frame blends ONE, ONE_MINUS_SRC_ALPHA)
                gl_FragColor = vec4(t.rgb * u_light * u_alpha, t.a * u_alpha);
            }
        `);

        this._overlayLoc = {
            aPos:  gl.getAttribLocation( this._overlayProgram, 'a_pos'),
            aUv:   gl.getAttribLocation( this._overlayProgram, 'a_uv'),
            tex:   gl.getUniformLocation(this._overlayProgram, 'u_tex'),
            light: gl.getUniformLocation(this._overlayProgram, 'u_light'),
            alpha: gl.getUniformLocation(this._overlayProgram, 'u_alpha'),
        };

        this._overlayVbo = gl.createBuffer();
    }

    _linkProgram(gl, vsSrc, fsSrc) {
        const program = gl.createProgram();
        gl.attachShader(program, this._compileShader(gl, gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(program, this._compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
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
        gl.uniform1f(loc.depthBias, engine.instanceDepthBias);

        const lightOverride = ((((engine.lightOverride ?? 0) > 0)) ? engine.lightOverride : null);
        const bloomOn       = (engine.bloom !== null);
        const coreWhite     = ((bloomOn) ? (engine.bloom.coreWhite ?? RendererWebglBloom.DEFAULTS.coreWhite) : 0);
        const shading       = (Object3dRendererBase.frameShading(engine) ?? this._neutralDepthShading);
        gl.uniform1f(loc.dsVis,      shading.visibility);
        gl.uniform1f(loc.dsVisMax,   shading.visibilityMax);
        gl.uniform1f(loc.dsBase,     shading.shadeBase);
        gl.uniform1f(loc.dsScale,    shading.shadeScale);
        gl.uniform1f(loc.dsRamp,     shading.rampCount);
        gl.uniform1f(loc.dsStrength, shading.strength);

        for (const group of this._groupsFor(obj)) {
            const vertices = this._ensureVertexData(group.faces.length * 3 * 9);
            let floatCount = 0;
            for (const k of group.faces) {
                const fc  = obj.faceList[k];
                // Back-face culling lives here rather than in the grouping: the
                // groups are cached across frames, and which faces turn away
                // from the eye changes with every camera move.
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }
                // The fract() wrap in the fragment shader absorbs the (already
                // wrapped) scroll offset baked in here.
                const scroll      = this._uvOffset(fc, engine.sceneMs);
                const lightFactor = obj.getFaceLightFactor(fc) * engine.instanceLight;
                const faceLight   = Object3dRendererBase.faceLight(fc, lightFactor, (group.texId !== null));
                for (let v = 0; v < 3; v++) {
                    const ptIdx = fc.pts[v];
                    const pt    = obj.pt3d[ptIdx];
                    const col   = this._pointColor(engine, fc.color, pt, fc.normal);
                    const uv    = ((fc.map) ? fc.map[v] : [0, 0]);
                    vertices[floatCount++] = pt[0];  vertices[floatCount++] = pt[1];  vertices[floatCount++] = pt[2];
                    vertices[floatCount++] = col[0] * lightFactor; vertices[floatCount++] = col[1] * lightFactor; vertices[floatCount++] = col[2] * lightFactor;
                    vertices[floatCount++] = uv[0] + scroll[0];  vertices[floatCount++] = uv[1] + scroll[1];
                    vertices[floatCount++] = faceLight;
                }
            }
            if (floatCount === 0) {
                continue;
            }

            // Additive groups (energy sprites) add their colour to the scene.
            // Translucent groups, additive or below full alpha, write no depth:
            // they must never hide what is drawn behind them after them.
            // Textures are premultiplied (alpha already in the RGB), hence the
            // ONE source factor in both modes. State is restored after the loop.
            gl.blendFunc(gl.ONE, ((group.blendAdd) ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA));
            gl.depthMask(!group.blendAdd && (group.alpha >= 1));
            const resolvedTexId = this._resolveTexId({ textureId: group.texId, animTextures: group.animTextures }, engine.sceneMs);
            const texture = ((resolvedTexId !== null) ? loader.textures().get(resolvedTexId) : null);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
            gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, floatCount), gl.DYNAMIC_DRAW);
            this._bindVertexLayout(gl);

            const lightFloor = (((lightOverride !== null) && !group.blendAdd) ? lightOverride : 0);
            const lightBoost = ((group.blendAdd) ? 0 : engine.lightBoost);
            gl.uniform1f(loc.alpha, group.alpha);
            gl.uniform1i(loc.clampV, ((group.clampV) ? 1 : 0));
            // Flooring or boosting an additive glow would oversaturate the
            // accumulation.
            gl.uniform1f(loc.lightFloor, lightFloor);
            gl.uniform1f(loc.lightBoost, lightBoost);
            const glTexture = ((texture) ? this._getTexture(gl, texture) : null);
            if (glTexture !== null) {
                gl.uniform1i(loc.hasTex, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, glTexture);
                gl.uniform1i(loc.uTex, 0);
            } else {
                gl.uniform1i(loc.hasTex, 0);
            }
            if (bloomOn) {
                gl.uniform1f(loc.coreWhite, ((group.glow) ? coreWhite : 0));
            }

            gl.drawArrays(gl.TRIANGLES, 0, floatCount / 9);
            if (bloomOn && group.glow) {
                this._recordGlow(engine, shading, group, vertices, floatCount, lightFloor, lightBoost, glTexture);
            }
        }
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true);
    }

    // The 9-float vertex layout of the scene program on the bound buffer: position, colour, uv, light.
    _bindVertexLayout(gl) {
        const loc    = this._loc;
        const stride = 9 * 4;
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos,   3, gl.FLOAT, false, stride,  0);
        gl.enableVertexAttribArray(loc.aColor);
        gl.vertexAttribPointer(loc.aColor, 3, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(loc.aUv);
        gl.vertexAttribPointer(loc.aUv,    2, gl.FLOAT, false, stride, 24);
        gl.enableVertexAttribArray(loc.aLight);
        gl.vertexAttribPointer(loc.aLight, 1, gl.FLOAT, false, stride, 32);
    }

    // Every value the scene program read for this glowing group, kept with its vertices for the glow pass.
    _recordGlow(engine, shading, group, vertices, floatCount, lightFloor, lightBoost, glTexture) {
        const state = this._bloomState;
        state[RendererWebglBloom.STATE_SX]          = engine.projScaleX;
        state[RendererWebglBloom.STATE_SY]          = engine.projScaleY;
        state[RendererWebglBloom.STATE_OX]          = engine.projOffsetX;
        state[RendererWebglBloom.STATE_OY]          = engine.projOffsetY;
        state[RendererWebglBloom.STATE_W]           = engine.scrWidth;
        state[RendererWebglBloom.STATE_H]           = engine.scrHeight;
        state[RendererWebglBloom.STATE_NEAR]        = engine.zBuffer.getNear();
        state[RendererWebglBloom.STATE_FAR]         = engine.zBuffer.getFar();
        state[RendererWebglBloom.STATE_DEPTH_BIAS]  = engine.instanceDepthBias;
        state[RendererWebglBloom.STATE_DS_VIS]      = shading.visibility;
        state[RendererWebglBloom.STATE_DS_VIS_MAX]  = shading.visibilityMax;
        state[RendererWebglBloom.STATE_DS_BASE]     = shading.shadeBase;
        state[RendererWebglBloom.STATE_DS_SCALE]    = shading.shadeScale;
        state[RendererWebglBloom.STATE_DS_RAMP]     = shading.rampCount;
        state[RendererWebglBloom.STATE_DS_STRENGTH] = shading.strength;
        state[RendererWebglBloom.STATE_ALPHA]       = group.alpha;
        state[RendererWebglBloom.STATE_CLAMP_V]     = ((group.clampV) ? 1 : 0);
        state[RendererWebglBloom.STATE_LIGHT_FLOOR] = lightFloor;
        state[RendererWebglBloom.STATE_LIGHT_BOOST] = lightBoost;
        this._bloom.record(vertices, floatCount, state, glTexture, group.blendAdd);
    }

    // Faces grouped by draw state, opaque groups first. Cached per object and
    // rebuilt only on a new face-groups version: the string keys cost tens of
    // thousands of builds per frame on a level map.
    _groupsFor(obj) {
        const cached = this._groupCache.get(obj);
        if ((cached !== undefined) && (cached.version === obj.getFaceGroupsVersion())) {
            return cached.groups;
        }

        const groups = new Map();
        const collect = (faceIndices) => {
            for (const k of faceIndices) {
                const fc       = obj.faceList[k];
                const clampV   = (fc.clampV || false);
                const blendAdd = (fc.blendAdd || false);
                const glow     = (fc.glow || false);
                const animKey  = ((fc.animTextures) ? fc.animTextures.ids.join('-') : fc.textureId);
                const key      = animKey + ',' + fc.alpha + ',' + clampV + ',' + blendAdd + ',' + glow;
                if (!groups.has(key)) {
                    groups.set(key, { texId: fc.textureId, animTextures: fc.animTextures, alpha: fc.alpha, clampV, blendAdd, glow, faces: [] });
                }
                groups.get(key).faces.push(k);
            }
        };
        collect(obj.opaqueFaces);
        const opaque = [...groups.values()].sort((a, b) => b.alpha - a.alpha);
        groups.clear();
        collect(obj.alphaFaces);
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
        const glTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, glTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._premultiply(texture.data));
        this._applyTextureFilter(gl);
        // Repetition is done by fract() in the shader, so LINEAR filtering
        // cannot bleed across the tile boundary at v=1.0.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._texCache.set(texture, glTexture);
        this._uploadedTextures.push(glTexture);
        return glTexture;
    }

    // The filter is a per-texture GL parameter, hence the list beside the
    // (non-enumerable) WeakMap cache.
    _syncTextureFilter(gl, engine) {
        if (engine.textureSmoothing === this._appliedSmoothing) {
            return;
        }
        this._appliedSmoothing = engine.textureSmoothing;
        for (const tex of this._uploadedTextures) {
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
        const filter = ((this._appliedSmoothing === false) ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }

    // Straight alpha would let LINEAR filtering blend the transparent texels'
    // black into opaque edges. A copy: the software renderers share the source
    // and expect straight alpha (UNPACK_PREMULTIPLY_ALPHA_WEBGL ignores typed arrays).
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
            uniform float u_sx, u_sy, u_ox, u_oy, u_w, u_h, u_near, u_far, u_depthBias;
            varying vec3 v_color;
            varying vec2 v_uv;
            varying float v_light;
            varying float v_depth;
            void main() {
                // Linear clip coordinates (no division by z), and vertices
                // pushed off the camera plane sign-preservingly: a w near 0
                // overflows the rasterizer guard band (software GL included)
                // and smears corrupt depth wedges over the screen. The nudge
                // only moves geometry that the near plane clips anyway.
                float z  = a_pos.z;
                float e  = u_near * 0.5;
                if (abs(z) < e) {
                    z = ((z < 0.0) ? -e : e);
                }
                float xc = 2.0 * (u_sx * a_pos.x - u_ox * z) / u_w - z;
                float yc = z + 2.0 * (u_sy * a_pos.y + u_oy * z) / u_h;
                float A  = (u_far + u_near) / (u_far - u_near);
                float B  = -2.0 * u_far * u_near / (u_far - u_near);
                gl_Position = vec4(xc, yc, A * z + B, z);
                if (u_depthBias > 0.0) {
                    // The depth only is pulled towards the camera, never past the near plane: close to it, it is
                    // squeezed rather than stopped, so the faces there keep their order.
                    float zd = max((z - u_depthBias), min(z, (u_near + ((z - u_near) * 0.125))));
                    gl_Position.z = (A * zd + B) * z / zd;
                }
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
            uniform float     u_lightFloor;
            uniform float     u_lightBoost;
            uniform float     u_dsVis, u_dsVisMax, u_dsBase, u_dsScale, u_dsRamp, u_dsStrength;
            uniform float     u_coreWhite;
            uniform float     u_glowFar, u_glowFarMax;
            varying vec3 v_color;
            varying vec2 v_uv;
            varying float v_light;
            varying float v_depth;
            void main() {
                vec3  col;
                float a;
                vec4  t   = vec4(0.0);
                vec3  lit = v_color;
                if (u_hasTex == 1) {
                    vec2 uv;
                    if (u_clampV == 1) {
                        uv.x = fract(v_uv.x);
                        uv.y = clamp(v_uv.y, 0.0, 1.0);
                    } else {
                        uv = fract(v_uv);
                    }
                    t = texture2D(u_tex, uv);
                    if (t.a < 0.5) {
                        discard;
                    }
                } else {
                    lit = lit / 255.0;
                }
                // Scene-wide light floor (engine.setLightOverride, 0 = off):
                // lifts the vertex LIGHT to the floor before the texture
                // applies — hue-preserving scale, a black face goes grey.
                if (u_lightFloor > 0.0) {
                    float m = max(lit.r, max(lit.g, lit.b));
                    lit = ((m > 0.0) ? (lit * max(1.0, u_lightFloor / m)) : vec3(u_lightFloor));
                }
                // Scene-wide light boost (engine.setLightBoost, 0 = off): a
                // flat addition to the faces below full light, saturating —
                // a fullbright or over-lit face keeps its light untouched.
                if (max(lit.r, max(lit.g, lit.b)) < 1.0) {
                    lit = min(lit + vec3(u_lightBoost), vec3(1.0));
                }
                if (u_hasTex == 1) {
                    col = min(lit * t.rgb, vec3(1.0));
                    a   = t.a * u_alpha;
                } else {
                    col = min(lit, vec3(1.0));
                    a   = u_alpha;
                }
                // Bloom: the core of a glowing face goes towards white, its halo keeps the colour (0 = off).
                col = col + (vec3(1.0) - col) * u_coreWhite;
                // Depth shading (engine.setDepthShading): the pixel darkens
                // with the view depth, the darker the face light the sooner,
                // scaled by the curve strength. Disabled = neutral uniforms
                // => dsIndex 0, one shader path for both states. The light
                // boost raises the level the curve reads, like the face.
                float dsVis   = min(u_dsVis / v_depth, u_dsVisMax);
                float dsLight = v_light + u_lightBoost;
                float dsIndex = clamp((u_dsBase - (u_dsScale * dsLight) - dsVis) * (u_dsRamp - 1.0), 0.0, u_dsRamp - 1.0);
                col = col * (1.0 - (u_dsStrength * dsIndex / u_dsRamp));
                // Bloom's glow pass only (0 = off): past u_glowFar the glow grows with the depth, up to u_glowFarMax
                // times, so the halo of a thinning distant line keeps its size on screen.
                if (u_glowFar > 0.0) {
                    col = col * clamp(v_depth / u_glowFar, 1.0, u_glowFarMax);
                }
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
            depthBias:  gl.getUniformLocation(this._program, 'u_depthBias'),
            uTex:       gl.getUniformLocation(this._program, 'u_tex'),
            hasTex:     gl.getUniformLocation(this._program, 'u_hasTex'),
            alpha:      gl.getUniformLocation(this._program, 'u_alpha'),
            clampV:     gl.getUniformLocation(this._program, 'u_clampV'),
            lightFloor: gl.getUniformLocation(this._program, 'u_lightFloor'),
            lightBoost: gl.getUniformLocation(this._program, 'u_lightBoost'),
            dsVis:      gl.getUniformLocation(this._program, 'u_dsVis'),
            dsVisMax:   gl.getUniformLocation(this._program, 'u_dsVisMax'),
            dsBase:     gl.getUniformLocation(this._program, 'u_dsBase'),
            dsScale:    gl.getUniformLocation(this._program, 'u_dsScale'),
            dsRamp:     gl.getUniformLocation(this._program, 'u_dsRamp'),
            dsStrength: gl.getUniformLocation(this._program, 'u_dsStrength'),
            coreWhite:  gl.getUniformLocation(this._program, 'u_coreWhite'),
            glowFar:    gl.getUniformLocation(this._program, 'u_glowFar'),
            glowFarMax: gl.getUniformLocation(this._program, 'u_glowFarMax'),
        };

        this._vbo = gl.createBuffer();
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        // Premultiplied-alpha pipeline: the source factor is ONE everywhere.
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    _compileShader(gl, type, src) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
        }
        return shader;
    }
}

// Default sky band (radians above the horizon): Doom's sky, its bottom dipping just below the walls.
Object3dRendererWebGL.SKY_TOP    = 0.48;
Object3dRendererWebGL.SKY_BOTTOM = -0.12;
