/**
 * Game-side orchestrator of the audio. Owns the engine-side pieces (the
 * SoundEngine born once for the page, the sample registry, the effect player),
 * fills them from the selected WAD (profile sound table → DMX lumps), and is
 * the single entry point the menu and game code call to play a sound.
 *
 * Global `doomSound` (same shape as doomSettings/doomSaveStore): sounds are
 * WAD-lifetime data — any sound can play in any level — so the system lives
 * outside the global `loader` (reset on every level) and survives the levels;
 * only leaving a WAD (back to the WAD list) empties its libraries. The
 * AudioContext itself is a page-lifetime resource and is never recreated.
 */
class DoomSoundSystem {
    constructor() {
        this._engine     = null;
        this._samples    = null;
        this._player     = null;
        this._catalog    = null;
        this._wadId      = null;
        this._listener   = new DoomSoundListener();
        this._pitchRange = 0;
        this._positional = [];
    }

    // Idempotent — called on every menu boot (the navigator is recreated):
    // the engine and its context are born once, the volumes re-read every time
    // (the settings are loaded just before in the boot chain).
    boot() {
        if (this._engine === null) {
            this._engine  = new SoundEngine().installUnlockListeners();
            this._samples = new SoundSampleLoader(this._engine);
            this._player  = new SoundEffectPlayer(this._engine);
        }

        return this.applyVolumes();
    }

    // Pushes the two volume settings onto the engine buses — called at boot
    // and after every change from the settings UI (the applyToInputs pattern).
    applyVolumes() {
        if (this._engine === null) {
            return this;
        }
        this._engine.setMusicVolume(doomSettings.getSoundVolumeMusic());
        this._engine.setEffectsVolume(doomSettings.getSoundVolumeEffects());

        return this;
    }

    /**
     * Fire-and-forget load used by the menu — no modal: the menu sounds become
     * audible as soon as the decoding lands.
     *
     * @param {WadRegistry} registry
     * @param {object} meta WAD metadata
     */
    loadFromRegistry(registry, meta) {
        if ((this._engine === null) || (this._wadId === meta.id)) {
            return this;
        }
        registry.getWadFile(meta.id)
            .then((wadFile) => this.loadForWad(wadFile, meta.id))
            .catch((error) => {
                console.warn('DoomSoundSystem - unable to load the sounds of [' + meta.id + ']: ' + error.message);
            });

        return this;
    }

    /**
     * Decodes every sound lump the profile table names — a missing or
     * malformed lump degrades to silence. Reloading the same WAD is a no-op.
     *
     * @param {WadFile} wadFile parsed WAD
     * @param {string} wadId
     */
    loadForWad(wadFile, wadId) {
        if ((this._engine === null) || (this._wadId === wadId)) {
            return this;
        }
        this.reset();
        this._wadId   = wadId;
        const profile = new GameProfileList().getForWad(wadFile);
        this._catalog = new DoomSoundCatalog(profile.soundDefs());
        for (const lumpName of this._catalog.lumpNames()) {
            const pcm = WadSoundDecoder.decode(wadFile.getLump(lumpName));
            if (pcm !== null) {
                this._samples.loadFromData(lumpName, pcm);
            }
        }
        this._pitchRange = profile.soundPitchRange();
        this._listener.setRolloff(DoomSoundSystem._buildRolloff(profile, wadFile));

        return this;
    }

    // A Raven profile looks its volumes up in the WAD's own SNDCURVE lump (the
    // lump size IS the max distance); without the lump, the profile's declared
    // max keeps a plain Doom-style curve rather than full silence.
    static _buildRolloff(profile, wadFile) {
        const rolloff = {...profile.soundRolloff(), curve: null};
        if (rolloff.type === 'sndcurve') {
            const lump = wadFile.getLump('SNDCURVE');
            if (lump !== null) {
                rolloff.curve = new Uint8Array(lump.buffer, lump.byteOffset, lump.byteLength);
                rolloff.max   = lump.byteLength;
            }
        }

        return rolloff;
    }

    // Leaving a WAD (back to the WAD list) drops everything it fed: samples,
    // catalog, playing channels. The engine and its context survive.
    reset() {
        if (this._engine === null) {
            return this;
        }
        this._player.stopAll().setPaused(false);
        this._samples.reset();
        this._catalog    = null;
        this._wadId      = null;
        this._positional = [];

        return this;
    }

    /**
     * The level's player becomes the listener — rebound by DoomGame._init on
     * every level (the game is recreated, this system survives). Also lifts
     * the pause freeze a leftover exit modal may have armed.
     *
     * @param {User} user
     */
    bindLevel(user) {
        this._listener.setUser(user);
        if (this._player !== null) {
            this._player.setPaused(false);
        }

        return this;
    }

    // Level teardown: every game channel stops (ui feedback survives — the
    // menus keep talking), the listener lets its player go.
    unbindLevel() {
        this._listener.clearUser();
        this._positional = [];
        if (this._player !== null) {
            this._player.stopAll(false).setPaused(false);
        }

        return this;
    }

    /**
     * Freeze/unfreeze of the game channels (pause menu, end-of-level modals):
     * playing sounds hold their position, non-ui starts are refused, the
     * interface feedback stays audible.
     *
     * @param {boolean} paused
     */
    setPaused(paused) {
        if (this._player !== null) {
            this._player.setPaused(paused);
        }

        return this;
    }

    /**
     * World sound at a position: gain and pan from the listener, refreshed
     * every frame while it plays (update below) — the listener moves even when
     * the emitter does not.
     *
     * @param {string} name logical name
     * @param {number[]|null} origin world [x, y, z]; null = full volume, centred
     * @param {{attenuation?: number, loop?: boolean, replaceKey?: string}} options
     * @returns {object|null} the channel handle, null when refused or unknown
     */
    playAt(name, origin, options = {}) {
        // One single resolution: a $random group must hand the SAME pick to
        // the sample lookup and to the start rules (key, limit, pitch).
        const entry = this._resolvedSample(name);
        if (entry === null) {
            return null;
        }
        const {resolved, sample} = entry;
        const attenuation = (options.attenuation ?? WadConstants.SOUND_ATTN.norm);
        const params      = this._listener.paramsFor(origin, attenuation);
        const handle      = this._player.play(sample, {
            gain:       params.gain,
            pan:        params.pan,
            pitch:      DoomSoundListener.pitchFor(resolved.pitch ?? this._pitchRange),
            loop:       (options.loop === true),
            key:        resolved.lump,
            origin:     origin,
            limit:      resolved.limit,
            limitRange: (resolved.limitRange * WadConstants.SCALE),
            singular:   resolved.singular,
            replaceKey: (options.replaceKey ?? null)
        });
        if ((handle !== null) && (origin !== null) && (attenuation !== 0)) {
            this._positional.push({handle: handle, origin: origin, attenuation: attenuation});
        }

        return handle;
    }

    // Per-frame refresh of the playing world channels against the moving
    // listener (S_UpdateSounds) — called by the game loop; the origin arrays
    // are live references, a moving emitter updates them in place.
    update() {
        for (let i = this._positional.length - 1; i >= 0; i--) {
            const entry = this._positional[i];
            if (!entry.handle.isPlaying()) {
                this._positional.splice(i, 1);
                continue;
            }
            const params = this._listener.paramsFor(entry.origin, entry.attenuation);
            entry.handle.setGain(params.gain);
            entry.handle.setPan(params.pan);
        }

        return this;
    }

    /**
     * Interface sound: position-less, at the UZDoom menu volume, on a channel
     * exempt from the game pause, pitch fixed. Unknown names and missing lumps
     * stay silent.
     *
     * @param {string} name logical name ('menu/choose')
     */
    playUi(name) {
        const entry = this._resolvedSample(name);
        if (entry !== null) {
            this._player.play(entry.sample, {gain: WadConstants.MENU_SOUND_VOLUME, ui: true});
        }

        return this;
    }

    _resolvedSample(name) {
        if (this._catalog === null) {
            return null;
        }
        const resolved = this._catalog.resolve(name);
        if (resolved === null) {
            return null;
        }
        const id = this._samples.idByCode(resolved.lump);
        if (id === null) {
            return null;
        }

        return {resolved: resolved, sample: this._samples.get(id)};
    }
}

const doomSound = new DoomSoundSystem();
