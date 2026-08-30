/**
 * Playback of the sound effects on the engine's effects bus: one channel per
 * playing sound (source → gain → stereo pan), returned as a handle the caller
 * drives while the sound plays. The player knows nothing about games, menus,
 * emitters or listeners: it receives ready-made gains and pans, plain per-call
 * start limits, and opaque origins it only measures distances between.
 *
 * Start regulation (all of it skipped for 'ui' channels):
 *  - a sound already playing on the same replaceKey is replaced (a restart,
 *    always accepted);
 *  - a 'singular' sound refuses to start while a copy of its key plays;
 *  - at most `limit` copies of the same key within `limitRange` units;
 *  - at the channel cap, the positional channel with the lowest gain (the
 *    best proxy of the farthest one) is evicted — never a ui channel, never a
 *    position-less one.
 */
class SoundEffectPlayer {
    static MAX_CHANNELS_DEFAULT = 64;

    /**
     * @param {SoundEngine} soundEngine
     */
    constructor(soundEngine) {
        this._engine      = soundEngine;
        this._channels    = [];
        this._maxChannels = SoundEffectPlayer.MAX_CHANNELS_DEFAULT;
        this._paused      = false;
    }

    setMaxChannels(count) {
        this._maxChannels = count;
        return this;
    }

    /**
     * @param {SoundSample} sample
     * @param {object} options
     *   - gain / pan / pitch / loop: playback parameters, ready-made
     *   - ui: interface channel — exempt from the pause and from every start rule
     *   - key: identity of the SOUND (the unit the limit and singular rules count)
     *   - origin: [x, y, z] of the emitter, null for a position-less sound
     *   - limit / limitRange: start limit of the key (limit 0 = unlimited)
     *   - singular: only one copy of the key at a time
     *   - replaceKey: identity of the (emitter, logical channel) slot
     * @returns {{setGain: function, setPan: function, stop: function, isPlaying: function}|null}
     *          null when the start is refused
     */
    play(sample, options = {}) {
        const ui = (options.ui === true);
        // Started while frozen, a one-shot would ring right after the resume,
        // which would not sound right (UZDoom rule). Loops are game state and
        // restart with the game itself.
        if (this._paused && !ui) {
            return null;
        }
        if ((options.replaceKey ?? null) !== null) {
            this._stopByReplaceKey(options.replaceKey);
        }
        if (!ui && !this._startAllowed(options)) {
            return null;
        }
        if (!this._makeRoom(ui)) {
            return null;
        }

        const context = this._engine.getContext();
        const gain    = context.createGain();
        const pan     = context.createStereoPanner();
        gain.gain.value = (options.gain ?? 1);
        pan.pan.value   = SoundEffectPlayer._clampPan(options.pan ?? 0);
        gain.connect(pan);
        pan.connect(this._engine.getEffectsBus());

        const channel = {
            sample:       sample,
            source:       null,
            gain:         gain,
            pan:          pan,
            ui:           ui,
            key:          (options.key ?? null),
            origin:       (options.origin ?? null),
            replaceKey:   (options.replaceKey ?? null),
            loop:         (options.loop === true),
            pitch:        (options.pitch ?? 1),
            gainValue:    (options.gain ?? 1),
            // Pause bookkeeping: a BufferSource cannot pause, so the position
            // is tracked and the source recreated at resume.
            startedAt:    0,
            bufferOffset: 0,
            suspended:    false,
            playing:      true
        };
        this._startSource(channel, 0);
        this._channels.push(channel);

        return {
            setGain:   (value) => {
                channel.gainValue = value;
                gain.gain.value   = value;
            },
            setPan:    (value) => {
                pan.pan.value = SoundEffectPlayer._clampPan(value);
            },
            stop:      () => {
                this._release(channel);
            },
            isPlaying: () => channel.playing
        };
    }

    /**
     * Freezes the game channels in place (they resume where they were) and
     * refuses new non-ui starts; the interface channels are exempt from both.
     *
     * @param {boolean} paused
     */
    setPaused(paused) {
        if (this._paused === (paused === true)) {
            return this;
        }
        this._paused = (paused === true);
        for (const channel of this._channels.slice()) {
            if (channel.ui) {
                continue;
            }
            if (this._paused) {
                this._suspendChannel(channel);
            } else {
                this._resumeChannel(channel);
            }
        }

        return this;
    }

    /**
     * @param {boolean} uiToo false keeps the interface channels playing
     */
    stopAll(uiToo = true) {
        for (const channel of this._channels.slice()) {
            if (uiToo || !channel.ui) {
                this._release(channel);
            }
        }

        return this;
    }

    // --- Start rules ---

    _startAllowed(options) {
        const key = (options.key ?? null);
        if (key === null) {
            return true;
        }
        if (options.singular === true) {
            return !this._channels.some((channel) => (channel.playing && (channel.key === key)));
        }
        const limit = (options.limit ?? 0);
        if (limit <= 0) {
            return true;
        }
        const range  = (options.limitRange ?? 0);
        const origin = (options.origin ?? null);
        let count = 0;
        for (const channel of this._channels) {
            if (!channel.playing || (channel.key !== key)) {
                continue;
            }
            // A position-less copy (or a position-less start) counts whatever
            // the distance — its range is effectively infinite.
            if ((origin === null) || (channel.origin === null)
                || (SoundEffectPlayer._distance(origin, channel.origin) <= range)) {
                count++;
            }
        }

        return (count < limit);
    }

    // At the cap, evict the positional channel with the lowest gain — never a
    // ui channel, never a position-less one. Interface sounds always start.
    _makeRoom(ui) {
        if (this._channels.length < this._maxChannels) {
            return true;
        }
        let quietest = null;
        for (const channel of this._channels) {
            if (channel.ui || (channel.origin === null)) {
                continue;
            }
            if ((quietest === null) || (channel.gainValue < quietest.gainValue)) {
                quietest = channel;
            }
        }
        if (quietest !== null) {
            this._release(quietest);
            return true;
        }

        return ui;
    }

    _stopByReplaceKey(replaceKey) {
        for (const channel of this._channels.slice()) {
            if (channel.replaceKey === replaceKey) {
                this._release(channel);
            }
        }
    }

    // --- Source lifecycle ---

    _startSource(channel, bufferOffset) {
        const source = this._engine.getContext().createBufferSource();
        source.buffer              = channel.sample.getBuffer();
        source.loop                = channel.loop;
        source.playbackRate.value  = channel.pitch;
        source.connect(channel.gain);
        source.onended = () => {
            this._release(channel);
        };
        source.start(0, bufferOffset);
        channel.source       = source;
        channel.startedAt    = this._engine.getContext().currentTime;
        channel.bufferOffset = bufferOffset;
    }

    _suspendChannel(channel) {
        if (!channel.playing || channel.suspended) {
            return;
        }
        const elapsed = (this._engine.getContext().currentTime - channel.startedAt) * channel.pitch;
        let position  = channel.bufferOffset + elapsed;
        const length  = channel.sample.getDuration();
        if (channel.loop && (length > 0)) {
            position = (position % length);
        }
        channel.suspended    = true;
        channel.bufferOffset = position;
        this._dropSource(channel);
        // A one-shot frozen past its own end has nothing left to resume.
        if (!channel.loop && (position >= length)) {
            this._release(channel);
        }
    }

    _resumeChannel(channel) {
        if (!channel.playing || !channel.suspended) {
            return;
        }
        channel.suspended = false;
        this._startSource(channel, channel.bufferOffset);
    }

    _dropSource(channel) {
        if (channel.source === null) {
            return;
        }
        channel.source.onended = null;
        channel.source.stop();
        channel.source.disconnect();
        channel.source = null;
    }

    _release(channel) {
        if (!channel.playing) {
            return;
        }
        channel.playing = false;
        this._dropSource(channel);
        channel.gain.disconnect();
        channel.pan.disconnect();
        const index = this._channels.indexOf(channel);
        if (index >= 0) {
            this._channels.splice(index, 1);
        }
    }

    static _distance(a, b) {
        const dx = (a[0] - b[0]);
        const dy = (a[1] - b[1]);
        const dz = (a[2] - b[2]);

        return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    static _clampPan(value) {
        return Math.min(Math.max(value, -1), 1);
    }
}
