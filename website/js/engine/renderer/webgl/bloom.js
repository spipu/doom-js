/**
 * Selective bloom of the WebGL renderer (Engine3d.setBloom): the scene is drawn into a texture, the faces marked
 * glow are drawn a second time into a glow texture sharing the scene's depth (a glowing face hidden by an opaque one
 * is rejected), the glow is reduced and blurred over a chain of halved levels, then the scene, anti-aliased by FXAA,
 * is composed with the blurred levels on the screen. Without bloom none of this exists and nothing is drawn twice.
 *
 * The glowing vertices are recorded by the renderer in batches keeping every value the scene program reads for them,
 * so the glow pass draws them exactly where the scene pass did.
 */
class RendererWebglBloom {
    constructor() {
        this._width        = 0;
        this._height       = 0;
        this._levelCount   = 0;
        this._sceneTexture = null;
        this._glowTexture  = null;
        this._depthBuffer  = null;
        this._sceneFbo     = null;
        this._glowFbo      = null;
        this._levels       = [];       // {width, height, textureA, fboA, textureB, fboB}
        this._quadVbo      = null;
        this._downProgram  = null;
        this._blurProgram  = null;
        this._composePrograms = new Map();   // level count -> {program, loc}
        this._downLoc      = {};
        this._blurLoc      = {};
        this._glowData     = new Float32Array(0);
        this._glowFloats   = 0;
        this._batches      = [];
        this._batchCount   = 0;
        this._weights      = new Float32Array(RendererWebglBloom.MAX_LEVELS);
    }

    /**
     * @returns {boolean} true when resources exist (a bloom was active)
     */
    hasResources() {
        return (this._sceneFbo !== null);
    }

    /**
     * Frame start with bloom: resources fitting the screen, the glow texture cleared once, the scene target bound.
     *
     * @param {WebGLRenderingContext} gl
     * @param {Engine3d}              engine
     */
    begin(gl, engine) {
        const levelCount = RendererWebglBloom._param(engine.bloom, 'levels');
        if ((this._width !== engine.scrWidth) || (this._height !== engine.scrHeight) || (this._levelCount !== levelCount) || !this.hasResources()) {
            this.release(gl);
            this._create(gl, engine.scrWidth, engine.scrHeight, levelCount, RendererWebglBloom._param(engine.bloom, 'resolution'));
        }
        this._glowFloats = 0;
        this._batchCount = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._glowFbo);
        gl.viewport(0, 0, this._width, this._height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneFbo);
    }

    /**
     * Records the vertices of a glowing group just drawn by the scene program, with the state it was drawn with.
     *
     * @param {Float32Array} vertices   - 9 floats a vertex, as uploaded
     * @param {number}       floatCount
     * @param {Float32Array} state      - RendererWebglBloom.STATE_SIZE uniform values (see STATE_*)
     * @param {WebGLTexture|null} texture
     * @param {boolean}      blendAdd
     */
    record(vertices, floatCount, state, texture, blendAdd) {
        if ((this._glowFloats + floatCount) > this._glowData.length) {
            let size = Math.max(this._glowData.length, RendererWebglBloom.MIN_GLOW_FLOATS);
            while (size < (this._glowFloats + floatCount)) {
                size *= 2;
            }
            const grown = new Float32Array(size);
            grown.set(this._glowData.subarray(0, this._glowFloats));
            this._glowData = grown;
        }
        this._glowData.set(vertices.subarray(0, floatCount), this._glowFloats);
        const last = ((this._batchCount > 0) ? this._batches[this._batchCount - 1] : null);
        if ((last !== null) && (last.texture === texture) && (last.blendAdd === blendAdd) && RendererWebglBloom._sameState(last.state, state)) {
            last.count      += floatCount;
            this._glowFloats += floatCount;
            return;
        }
        if (this._batchCount === this._batches.length) {
            this._batches.push({state: new Float32Array(RendererWebglBloom.STATE_SIZE), texture: null, blendAdd: false, start: 0, count: 0});
        }
        const batch = this._batches[this._batchCount++];
        batch.state.set(state);
        batch.texture  = texture;
        batch.blendAdd = blendAdd;
        batch.start    = this._glowFloats;
        batch.count    = floatCount;
        this._glowFloats += floatCount;
    }

    /**
     * Draws the recorded glowing faces into the glow texture against the scene depth, then empties the record; the
     * scene target is bound again.
     *
     * @param {WebGLRenderingContext}   gl
     * @param {Object3dRendererWebGL}   renderer
     */
    flushGlow(gl, renderer) {
        if (this._batchCount === 0) {
            return;
        }
        const loc = renderer._loc;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._glowFbo);
        gl.viewport(0, 0, this._width, this._height);
        gl.useProgram(renderer._program);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform1f(loc.coreWhite, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, renderer._vbo);
        for (let b = 0; b < this._batchCount; b++) {
            const batch = this._batches[b];
            RendererWebglBloom._applyState(gl, loc, batch.state);
            if (batch.texture !== null) {
                gl.uniform1i(loc.hasTex, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, batch.texture);
                gl.uniform1i(loc.uTex, 0);
            } else {
                gl.uniform1i(loc.hasTex, 0);
            }
            gl.bufferData(gl.ARRAY_BUFFER, this._glowData.subarray(batch.start, (batch.start + batch.count)), gl.DYNAMIC_DRAW);
            renderer._bindVertexLayout(gl);
            gl.drawArrays(gl.TRIANGLES, 0, (batch.count / RendererWebglBloom.VERTEX_FLOATS));
        }
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._glowFloats = 0;
        this._batchCount = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneFbo);
    }

    /**
     * Frame end: glow pass, reduction and blur of every level, composition with FXAA on the screen, GL state back to
     * the renderer's defaults.
     *
     * @param {WebGLRenderingContext}   gl
     * @param {Engine3d}                engine
     * @param {Object3dRendererWebGL}   renderer
     */
    end(gl, engine, renderer) {
        this.flushGlow(gl, renderer);
        if (this._quadVbo === null) {
            this._setupPrograms(gl);
        }
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVbo);

        let source = this._glowTexture;
        let sourceWidth  = this._width;
        let sourceHeight = this._height;
        for (const level of this._levels) {
            this._downsample(gl, source, sourceWidth, sourceHeight, level);
            this._blur(gl, level.textureA, level.width, level.height, level.fboB, level.width, level.height, 1, 0);
            this._blur(gl, level.textureB, level.width, level.height, level.fboA, level.width, level.height, 0, 1);
            source       = level.textureA;
            sourceWidth  = level.width;
            sourceHeight = level.height;
        }
        this._compose(gl, engine);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, engine.scrWidth, engine.scrHeight);
        gl.enable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(renderer._program);
    }

    /**
     * Frees the textures, buffers and framebuffers; the programs are kept for a later bloom.
     *
     * @param {WebGLRenderingContext} gl
     */
    release(gl) {
        for (const texture of [this._sceneTexture, this._glowTexture]) {
            if (texture !== null) {
                gl.deleteTexture(texture);
            }
        }
        for (const fbo of [this._sceneFbo, this._glowFbo]) {
            if (fbo !== null) {
                gl.deleteFramebuffer(fbo);
            }
        }
        if (this._depthBuffer !== null) {
            gl.deleteRenderbuffer(this._depthBuffer);
        }
        for (const level of this._levels) {
            gl.deleteTexture(level.textureA);
            gl.deleteTexture(level.textureB);
            gl.deleteFramebuffer(level.fboA);
            gl.deleteFramebuffer(level.fboB);
        }
        this._sceneTexture = null;
        this._glowTexture  = null;
        this._sceneFbo     = null;
        this._glowFbo      = null;
        this._depthBuffer  = null;
        this._levels       = [];
        this._width        = 0;
        this._height       = 0;
        this._levelCount   = 0;
        this._batchCount   = 0;
        this._glowFloats   = 0;
    }

    _create(gl, width, height, levelCount, resolution) {
        this._width        = width;
        this._height       = height;
        this._levelCount   = levelCount;
        this._sceneTexture = RendererWebglBloom._texture(gl, width, height);
        this._glowTexture  = RendererWebglBloom._texture(gl, width, height);
        this._depthBuffer  = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, width, height);
        this._sceneFbo = RendererWebglBloom._framebuffer(gl, this._sceneTexture, this._depthBuffer);
        this._glowFbo  = RendererWebglBloom._framebuffer(gl, this._glowTexture, this._depthBuffer);
        let levelWidth  = Math.max(1, Math.round(width * resolution));
        let levelHeight = Math.max(1, Math.round(height * resolution));
        for (let i = 0; i < levelCount; i++) {
            const textureA = RendererWebglBloom._texture(gl, levelWidth, levelHeight);
            const textureB = RendererWebglBloom._texture(gl, levelWidth, levelHeight);
            this._levels.push({
                width:    levelWidth,
                height:   levelHeight,
                textureA: textureA,
                fboA:     RendererWebglBloom._framebuffer(gl, textureA, null),
                textureB: textureB,
                fboB:     RendererWebglBloom._framebuffer(gl, textureB, null)
            });
            levelWidth  = Math.max(1, Math.floor(levelWidth / 2));
            levelHeight = Math.max(1, Math.floor(levelHeight / 2));
        }
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // RGBA8, any size: clamped, linear, no mipmap (allowed for non power of two textures in WebGL 1).
    static _texture(gl, width, height) {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return texture;
    }

    // The texture cleared once made: an uninitialised texture costs a lazy clear on its first read.
    static _framebuffer(gl, texture, depthBuffer) {
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (depthBuffer !== null) {
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return fbo;
    }

    _downsample(gl, source, sourceWidth, sourceHeight, level) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, level.fboA);
        gl.viewport(0, 0, level.width, level.height);
        gl.useProgram(this._downProgram);
        gl.uniform2f(this._downLoc.texel, (1 / sourceWidth), (1 / sourceHeight));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.uniform1i(this._downLoc.source, 0);
        this._drawQuad(gl, this._downLoc.aPos);
    }

    _blur(gl, source, sourceWidth, sourceHeight, target, width, height, dx, dy) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this._blurProgram);
        gl.uniform2f(this._blurLoc.step, (dx / sourceWidth), (dy / sourceHeight));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.uniform1i(this._blurLoc.source, 0);
        this._drawQuad(gl, this._blurLoc.aPos);
    }

    _compose(gl, engine) {
        const levelCount = this._levels.length;
        const compose    = this._composeProgram(gl, levelCount);
        const weights    = RendererWebglBloom._param(engine.bloom, 'levelWeights');
        let total = 0;
        for (let i = 0; i < levelCount; i++) {
            total += (weights[i] ?? 0);
        }
        for (let i = 0; i < RendererWebglBloom.MAX_LEVELS; i++) {
            this._weights[i] = ((i < levelCount) ? (((weights[i] ?? 0) / total) * RendererWebglBloom._param(engine.bloom, 'strength')) : 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, engine.scrWidth, engine.scrHeight);
        gl.useProgram(compose.program);
        gl.uniform2f(compose.loc.texel, (1 / this._width), (1 / this._height));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneTexture);
        gl.uniform1i(compose.loc.scene, 0);
        for (let i = 0; i < levelCount; i++) {
            gl.activeTexture(gl.TEXTURE1 + i);
            gl.bindTexture(gl.TEXTURE_2D, this._levels[i].textureA);
            gl.uniform1i(compose.loc.levels[i], (1 + i));
        }
        gl.uniform1fv(compose.loc.weights, this._weights);
        this._drawQuad(gl, compose.loc.aPos);
        // A texture left bound to a unit while its framebuffer is the target is a feedback loop: the browser drops
        // the draw, even when the program does not sample it (next frame's scene pass).
        for (let unit = 0; unit <= levelCount; unit++) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.activeTexture(gl.TEXTURE0);
    }

    _drawQuad(gl, aPos) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVbo);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    _setupPrograms(gl) {
        this._quadVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

        this._downProgram = RendererWebglBloom._link(gl, RendererWebglBloom.QUAD_VERTEX, `
            precision mediump float;
            uniform sampler2D u_source;
            uniform vec2      u_texel;
            varying vec2      v_uv;
            vec3 s(float x, float y) {
                return texture2D(u_source, v_uv + vec2(x, y) * u_texel).rgb;
            }
            void main() {
                // 13 taps: the centre, an inner box and an outer ring, weighted to stay free of aliasing.
                vec3 inner = s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0);
                vec3 cross = s(0.0, 2.0) + s(-2.0, 0.0) + s(2.0, 0.0) + s(0.0, -2.0);
                vec3 outer = s(-2.0, 2.0) + s(2.0, 2.0) + s(-2.0, -2.0) + s(2.0, -2.0);
                vec3 c = s(0.0, 0.0) * 0.125 + inner * 0.125 + cross * 0.0625 + outer * 0.03125;
                gl_FragColor = vec4(c, 1.0);
            }
        `);
        this._downLoc = {
            aPos:   gl.getAttribLocation(this._downProgram, 'a_pos'),
            source: gl.getUniformLocation(this._downProgram, 'u_source'),
            texel:  gl.getUniformLocation(this._downProgram, 'u_texel')
        };

        const w = RendererWebglBloom.BLUR_WEIGHTS;
        this._blurProgram = RendererWebglBloom._link(gl, RendererWebglBloom.QUAD_VERTEX, `
            precision mediump float;
            uniform sampler2D u_source;
            uniform vec2      u_step;
            varying vec2      v_uv;
            void main() {
                vec3 c = texture2D(u_source, v_uv).rgb * ${w[0].toFixed(4)};
                c += (texture2D(u_source, v_uv + u_step).rgb + texture2D(u_source, v_uv - u_step).rgb) * ${w[1].toFixed(4)};
                c += (texture2D(u_source, v_uv + u_step * 2.0).rgb + texture2D(u_source, v_uv - u_step * 2.0).rgb) * ${w[2].toFixed(4)};
                c += (texture2D(u_source, v_uv + u_step * 3.0).rgb + texture2D(u_source, v_uv - u_step * 3.0).rgb) * ${w[3].toFixed(4)};
                c += (texture2D(u_source, v_uv + u_step * 4.0).rgb + texture2D(u_source, v_uv - u_step * 4.0).rgb) * ${w[4].toFixed(4)};
                gl_FragColor = vec4(c, 1.0);
            }
        `);
        this._blurLoc = {
            aPos:   gl.getAttribLocation(this._blurProgram, 'a_pos'),
            source: gl.getUniformLocation(this._blurProgram, 'u_source'),
            step:   gl.getUniformLocation(this._blurProgram, 'u_step')
        };
    }

    // The composition of a level count, built on first use: FXAA on the scene, plus the weighted levels.
    _composeProgram(gl, levelCount) {
        if (this._composePrograms.has(levelCount)) {
            return this._composePrograms.get(levelCount);
        }
        let samplers = '';
        let sum      = '';
        for (let i = 0; i < levelCount; i++) {
            samplers += 'uniform sampler2D u_level' + i + ';\n';
            sum      += 'bloom += texture2D(u_level' + i + ', v_uv).rgb * u_weights[' + i + '];\n';
        }
        const program = RendererWebglBloom._link(gl, RendererWebglBloom.QUAD_VERTEX, `
            precision mediump float;
            uniform sampler2D u_scene;
            uniform vec2      u_texel;
            uniform float     u_weights[${RendererWebglBloom.MAX_LEVELS}];
            ${samplers}
            varying vec2      v_uv;
            const vec3 LUMA = vec3(0.299, 0.587, 0.114);
            // FXAA 3.11, short version: the scene target has no multisampling (WebGL 1).
            vec3 fxaa(vec2 uv) {
                vec3 nw = texture2D(u_scene, uv + vec2(-1.0, -1.0) * u_texel).rgb;
                vec3 ne = texture2D(u_scene, uv + vec2(1.0, -1.0) * u_texel).rgb;
                vec3 sw = texture2D(u_scene, uv + vec2(-1.0, 1.0) * u_texel).rgb;
                vec3 se = texture2D(u_scene, uv + vec2(1.0, 1.0) * u_texel).rgb;
                vec3 m  = texture2D(u_scene, uv).rgb;
                float lNw = dot(nw, LUMA);
                float lNe = dot(ne, LUMA);
                float lSw = dot(sw, LUMA);
                float lSe = dot(se, LUMA);
                float lM  = dot(m, LUMA);
                float lMin = min(lM, min(min(lNw, lNe), min(lSw, lSe)));
                float lMax = max(lM, max(max(lNw, lNe), max(lSw, lSe)));
                vec2 dir = vec2(-((lNw + lNe) - (lSw + lSe)), ((lNw + lSw) - (lNe + lSe)));
                float reduce = max((lNw + lNe + lSw + lSe) * 0.25 * ${RendererWebglBloom.FXAA_REDUCE_MUL.toFixed(6)}, ${RendererWebglBloom.FXAA_REDUCE_MIN.toFixed(6)});
                float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
                dir = clamp(dir * rcpMin, vec2(-${RendererWebglBloom.FXAA_SPAN_MAX.toFixed(1)}), vec2(${RendererWebglBloom.FXAA_SPAN_MAX.toFixed(1)})) * u_texel;
                vec3 a = 0.5 * (texture2D(u_scene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(u_scene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
                vec3 b = a * 0.5 + 0.25 * (texture2D(u_scene, uv - dir * 0.5).rgb + texture2D(u_scene, uv + dir * 0.5).rgb);
                float lB = dot(b, LUMA);
                return (((lB < lMin) || (lB > lMax)) ? a : b);
            }
            void main() {
                vec3 bloom = vec3(0.0);
                ${sum}
                gl_FragColor = vec4(min(fxaa(v_uv) + bloom, vec3(1.0)), 1.0);
            }
        `);
        const loc = {
            aPos:    gl.getAttribLocation(program, 'a_pos'),
            scene:   gl.getUniformLocation(program, 'u_scene'),
            texel:   gl.getUniformLocation(program, 'u_texel'),
            weights: gl.getUniformLocation(program, 'u_weights'),
            levels:  []
        };
        for (let i = 0; i < levelCount; i++) {
            loc.levels.push(gl.getUniformLocation(program, 'u_level' + i));
        }
        const built = {program: program, loc: loc};
        this._composePrograms.set(levelCount, built);

        return built;
    }

    static _link(gl, vertexSource, fragmentSource) {
        const program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Bloom shader error:', gl.getShaderInfoLog(shader));
            }
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);

        return program;
    }

    static _applyState(gl, loc, state) {
        gl.uniform1f(loc.sx, state[RendererWebglBloom.STATE_SX]);
        gl.uniform1f(loc.sy, state[RendererWebglBloom.STATE_SY]);
        gl.uniform1f(loc.ox, state[RendererWebglBloom.STATE_OX]);
        gl.uniform1f(loc.oy, state[RendererWebglBloom.STATE_OY]);
        gl.uniform1f(loc.w, state[RendererWebglBloom.STATE_W]);
        gl.uniform1f(loc.h, state[RendererWebglBloom.STATE_H]);
        gl.uniform1f(loc.near, state[RendererWebglBloom.STATE_NEAR]);
        gl.uniform1f(loc.far, state[RendererWebglBloom.STATE_FAR]);
        gl.uniform1f(loc.depthBias, state[RendererWebglBloom.STATE_DEPTH_BIAS]);
        gl.uniform1f(loc.dsVis, state[RendererWebglBloom.STATE_DS_VIS]);
        gl.uniform1f(loc.dsVisMax, state[RendererWebglBloom.STATE_DS_VIS_MAX]);
        gl.uniform1f(loc.dsBase, state[RendererWebglBloom.STATE_DS_BASE]);
        gl.uniform1f(loc.dsScale, state[RendererWebglBloom.STATE_DS_SCALE]);
        gl.uniform1f(loc.dsRamp, state[RendererWebglBloom.STATE_DS_RAMP]);
        gl.uniform1f(loc.dsStrength, state[RendererWebglBloom.STATE_DS_STRENGTH]);
        gl.uniform1f(loc.alpha, state[RendererWebglBloom.STATE_ALPHA]);
        gl.uniform1i(loc.clampV, state[RendererWebglBloom.STATE_CLAMP_V]);
        gl.uniform1f(loc.lightFloor, state[RendererWebglBloom.STATE_LIGHT_FLOOR]);
        gl.uniform1f(loc.lightBoost, state[RendererWebglBloom.STATE_LIGHT_BOOST]);
    }

    static _sameState(a, b) {
        for (let i = 0; i < RendererWebglBloom.STATE_SIZE; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }

        return true;
    }

    // A bloom parameter, its default when left out.
    static _param(params, name) {
        return (params[name] ?? RendererWebglBloom.DEFAULTS[name]);
    }
}

RendererWebglBloom.DEFAULTS        = Object.freeze({strength: 2.5, levels: 4, levelWeights: Object.freeze([1.0, 0.8, 0.6, 0.4]), resolution: 0.5, coreWhite: 0.5});
RendererWebglBloom.MAX_LEVELS      = 6;
RendererWebglBloom.VERTEX_FLOATS   = 9;
RendererWebglBloom.MIN_GLOW_FLOATS = 1024;
// Gaussian, sigma 2, 9 taps, normalised: the centre, then 1 to 4 texels away.
RendererWebglBloom.BLUR_WEIGHTS    = Object.freeze([0.2042, 0.1802, 0.1238, 0.0663, 0.0276]);
RendererWebglBloom.FXAA_REDUCE_MUL = 1 / 8;
RendererWebglBloom.FXAA_REDUCE_MIN = 1 / 128;
RendererWebglBloom.FXAA_SPAN_MAX   = 8;
// The values the scene program reads for a draw, in the order of a recorded state.
RendererWebglBloom.STATE_SX          = 0;
RendererWebglBloom.STATE_SY          = 1;
RendererWebglBloom.STATE_OX          = 2;
RendererWebglBloom.STATE_OY          = 3;
RendererWebglBloom.STATE_W           = 4;
RendererWebglBloom.STATE_H           = 5;
RendererWebglBloom.STATE_NEAR        = 6;
RendererWebglBloom.STATE_FAR         = 7;
RendererWebglBloom.STATE_DEPTH_BIAS  = 8;
RendererWebglBloom.STATE_DS_VIS      = 9;
RendererWebglBloom.STATE_DS_VIS_MAX  = 10;
RendererWebglBloom.STATE_DS_BASE     = 11;
RendererWebglBloom.STATE_DS_SCALE    = 12;
RendererWebglBloom.STATE_DS_RAMP     = 13;
RendererWebglBloom.STATE_DS_STRENGTH = 14;
RendererWebglBloom.STATE_ALPHA       = 15;
RendererWebglBloom.STATE_CLAMP_V     = 16;
RendererWebglBloom.STATE_LIGHT_FLOOR = 17;
RendererWebglBloom.STATE_LIGHT_BOOST = 18;
RendererWebglBloom.STATE_SIZE        = 19;
RendererWebglBloom.QUAD_VERTEX       = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
    }
`;
