/**
 * Game-side orchestrator of the audio. Owns the engine-side pieces (the
 * SoundEngine born once for the page, the sample registry, the effect player,
 * the music player over its OPL synthesizer adapter), fills them from the
 * selected WAD (profile sound table → DMX lumps, GENMIDI bank → WOPL, song
 * lumps on demand), and is the single entry point the menu and game code call
 * to play a sound or change the music.
 *
 * Global `doomSound` (same shape as doomSettings/doomSaveStore): sounds are
 * WAD-lifetime data — any sound can play in any level — so the system lives
 * outside the global `loader` (reset on every level) and survives the levels;
 * only leaving a WAD (back to the WAD list) empties its libraries. The
 * AudioContext itself is a page-lifetime resource and is never recreated.
 */
class DoomSoundSystem {
    // Synthesized interface tones (SoundSynth.tone parameters), deliberately
    // WAD-independent: light neutral clicks instead of the vanilla gunshot
    // lumps, identical whatever the game. The partial set reproduces the
    // spectral signature of the escape-game UI click (scenario/_default/sound/
    // sound_click.mp3, CC0): a low knock with its 860/2220 Hz companions and a
    // bright ~6.6 kHz transient, all gone within ~10 ms — band ratios and
    // envelope matched by measurement against the source file.
    static UI_TONE_PARTIALS = [
        {ratio: 1,     gain: 1},
        {ratio: 1.39,  gain: 1.15, decayMul: 0.8},
        {ratio: 3.58,  gain: 1.15, decayMul: 0.7},
        {ratio: 10.6,  gain: 3.4,  decayMul: 0.55},
        {ratio: 11.05, gain: 2.4,  decayMul: 0.5}
    ];

    static UI_TONES = {
        tick:    {frequency: 620, durationMs: 45, decayMs: 2.8, gain: 0.85, attackMs: 0.5, harmonics: DoomSoundSystem.UI_TONE_PARTIALS},
        confirm: {frequency: 740, durationMs: 60, decayMs: 4,   gain: 1,    attackMs: 0.5, harmonics: DoomSoundSystem.UI_TONE_PARTIALS},
        back:    {frequency: 470, durationMs: 50, decayMs: 3.2, gain: 0.85, attackMs: 0.5, harmonics: DoomSoundSystem.UI_TONE_PARTIALS},
        invalid: {frequency: 220, durationMs: 90, decayMs: 10,  gain: 0.9,  attackMs: 0.5, harmonics: DoomSoundSystem.UI_TONE_PARTIALS}
    };

    // Vendored OPL synthesizer files (AudioWorklet processor + wasm core).
    static LIBADLMIDI_PROCESSOR_URL = '/js/lib/libadlmidi/libadlmidi.dosbox.slim.processor.js';
    static LIBADLMIDI_WASM_URL      = '/js/lib/libadlmidi/libadlmidi.dosbox.slim.core.wasm';

    // Logical menu event → tone: navigation and value adjust share the
    // discreet tick, validations the brighter one, back/close the lower one.
    static UI_SOUND_TONES = {
        'menu/cursor':   'tick',
        'menu/change':   'tick',
        'menu/choose':   'confirm',
        'menu/activate': 'confirm',
        'menu/prompt':   'confirm',
        'menu/backup':   'back',
        'menu/dismiss':  'back',
        'menu/clear':    'back',
        'menu/invalid':  'invalid'
    };

    constructor() {
        this._engine       = null;
        this._samples      = null;
        this._player       = null;
        this._catalog      = null;
        this._wadId        = null;
        this._listener     = new DoomSoundListener();
        this._pitchRange   = 0;
        this._positional   = [];
        this._uiToneIds    = {};
        this._tracks       = null;
        this._music        = null;
        this._desiredMusic = null;
        this._profile      = null;
        this._wadFile      = null;
        this._sequences    = null;
    }

    // Idempotent — called on every menu boot (the navigator is recreated):
    // the engine and its context are born once, the volumes re-read every time
    // (the settings are loaded just before in the boot chain).
    boot() {
        if (this._engine === null) {
            this._engine  = new SoundEngine().installUnlockListeners();
            this._samples = new SoundSampleLoader(this._engine);
            this._player  = new SoundEffectPlayer(this._engine);
            this._tracks  = new SoundTrackLoader();
            this._music   = new SoundMusicPlayer(this._engine).setSynth(new SoundMusicSynthAdlMidi(
                appBootstrap.buildUrl(DoomSoundSystem.LIBADLMIDI_PROCESSOR_URL),
                appBootstrap.buildUrl(DoomSoundSystem.LIBADLMIDI_WASM_URL)
            ));
            this._registerUiTones();
        }

        return this.applyVolumes();
    }

    // The interface tones come from no WAD, so a reset (which empties the
    // sample registry) has to put them back.
    _registerUiTones() {
        this._uiToneIds = {};
        for (const [code, params] of Object.entries(DoomSoundSystem.UI_TONES)) {
            this._uiToneIds[code] = this._samples.loadFromData('ui/' + code, SoundSynth.tone(params));
        }

        return this;
    }

    // Pushes the two volume settings onto the engine buses — called at boot
    // and after every change from the settings UI (the applyToInputs pattern).
    applyVolumes() {
        if (this._engine === null) {
            return this;
        }
        this._engine.setMusicVolume(doomSettings.getSoundVolumeMusic());
        this._engine.setEffectsVolume(doomSettings.getSoundVolumeEffects());
        this._music.setVolumeGate(doomSettings.getSoundVolumeMusic());

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
        // Switching WADs empties everything, but a music request made while
        // the load was still in flight (the menu asks before the decode lands)
        // must survive it — it plays at the end of this very call.
        const desiredMusic = this._desiredMusic;
        this.reset();
        this._desiredMusic = desiredMusic;
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
        this._wadFile = wadFile;
        this._profile = profile;
        const wopl    = WadGenmidi.toWopl(wadFile.getLump('GENMIDI'));
        this._music.setBank((wopl !== null) ? wopl.buffer : null);
        // Sound sequences: the WAD's own SNDSEQ lump wins (Hexen), else the
        // profile's transcription (Heretic ambients), else an empty catalog.
        const sndseq    = wadFile.getLump('SNDSEQ');
        this._sequences = new DoomSoundSequences(((sndseq !== null)
            ? WadFile.lumpText(sndseq)
            : profile.soundSequencesText()));
        this._applyDesiredMusic();

        return this;
    }

    /**
     * @returns {DoomSoundSequences|null} the loaded WAD's sequence catalog
     */
    getSequences() {
        return this._sequences;
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
        this._registerUiTones();
        this._music.stop().setBank(null);
        this._tracks.reset();
        this._desiredMusic = null;
        this._wadFile      = null;
        this._profile      = null;
        this._sequences    = null;
        this._catalog      = null;
        this._wadId        = null;
        this._positional   = [];

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
     * Interface sound: a synthesized tone, never a WAD lump — the menus tick
     * the same whatever the game, even before a WAD is selected. Position-less,
     * at the UZDoom menu volume, on a channel exempt from the game pause.
     * Unknown names stay silent.
     *
     * @param {string} name logical name ('menu/choose')
     */
    playUi(name) {
        if (this._engine === null) {
            return this;
        }
        const tone = (DoomSoundSystem.UI_SOUND_TONES[name] ?? null);
        if (tone !== null) {
            this._player.play(this._samples.get(this._uiToneIds[tone]), {gain: WadConstants.MENU_SOUND_VOLUME, ui: true});
        }

        return this;
    }

    // --- Music (OPL synthesis of the WAD's own songs) ---

    playMenuMusic() {
        return this._requestMusic({kind: 'menu'});
    }

    playIntermissionMusic() {
        return this._requestMusic({kind: 'intermission'});
    }

    playFinaleMusic() {
        return this._requestMusic({kind: 'finale'});
    }

    /**
     * @param {string[]} lumps candidate song lumps of the level (WadMapInfo)
     */
    playLevelMusic(lumps) {
        return this._requestMusic({kind: 'level', lumps: lumps});
    }

    stopMusic() {
        this._desiredMusic = null;
        if (this._music !== null) {
            this._music.stop();
        }

        return this;
    }

    // The desired music survives an unloaded WAD: asked for while the sounds
    // still decode, it starts when loadForWad lands.
    _requestMusic(desired) {
        this._desiredMusic = desired;
        return this._applyDesiredMusic();
    }

    _applyDesiredMusic() {
        if ((this._music === null) || (this._wadFile === null) || (this._desiredMusic === null)) {
            return this;
        }
        const desired = this._desiredMusic;
        const byKind  = {
            menu:         () => this._profile.menuMusicLumps(),
            intermission: () => this._profile.intermissionMusicLumps(),
            finale:       () => this._profile.finaleMusicLumps(),
            level:        () => desired.lumps
        };
        const lumps = byKind[desired.kind]();
        const track = this._resolveTrack(lumps ?? []);
        if (track === null) {
            this._music.stop();
        } else {
            // The title tune plays ONCE (d_main.cpp S_ChangeMusic looping
            // false); every other screen loops its song like the original.
            this._music.play(track, (desired.kind !== 'menu'));
        }

        return this;
    }

    // First candidate lump with a recognized music magic wins; its bytes are
    // registered once and replayed from the registry afterwards.
    _resolveTrack(lumpNames) {
        for (const name of lumpNames) {
            const known = this._tracks.idByCode(name);
            if (known !== null) {
                return this._tracks.get(known);
            }
            const lump   = this._wadFile.getLump(name);
            const format = WadSoundDecoder.musicFormat(lump);
            if (format === null) {
                continue;
            }
            const bytes = lump.buffer.slice(lump.byteOffset, lump.byteOffset + lump.byteLength);

            return this._tracks.get(this._tracks.loadFromData(name, {format: format, bytes: bytes}));
        }

        return null;
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
