/**
 * One running sound sequence: executes the commands of a DoomSoundSequences
 * entry at the 35 Hz tic clock — plays, timed and until-done waits, random
 * delays, volume moves, random picks among the level's candidate sequences
 * (Heretic's ambient scheduler), restart loops.
 *
 * Today's machines are position-less (the ambient scripts): the sequence
 * volume is pushed straight onto the channel. A positioned machine (Hexen's
 * mover sequences) will need the live attenuation × volume product — the
 * origin already travels, the product is the part left for that chantier.
 */
class DoomSoundSequencePlayer {
    // Volume commands are percentages (zdoom.org/wiki/SNDSEQ).
    static FULL_VOLUME = 100;
    // Commands executed per update at most — a data loop must never hang the
    // frame (a well-formed sequence always reaches a wait or its end).
    static STEP_GUARD  = 64;

    /**
     * @param {DoomSoundSequences} sequences
     * @param {string} name sequence to run
     * @param {{origin?: number[]|null, candidates?: string[]|null}} options
     *        candidates = the random-pick pool of `randomsequence` (the
     *        sequences of the ambient things the level actually holds)
     */
    constructor(sequences, name, options = {}) {
        this._sequences   = sequences;
        this._origin      = (options.origin ?? null);
        this._candidates  = (options.candidates ?? null);
        this._current     = sequences.byName(name);
        this._stack       = [];
        this._pc          = 0;
        this._volume      = DoomSoundSequencePlayer.FULL_VOLUME;
        this._attenuation = WadConstants.SOUND_ATTN.norm;
        this._waitTics    = 0;
        this._waitHandle  = null;
        this._onceDone    = false;
        this._done        = (this._current === null);
        this._ticBudget   = 0;
    }

    isDone() {
        return this._done;
    }

    /**
     * @param {number} dt ms of game time (frozen frames never reach it)
     */
    update(dt) {
        if (this._done) {
            return this;
        }
        if (this._waitHandle !== null) {
            if (this._waitHandle.isPlaying()) {
                this._ticBudget = 0;
                return this;
            }
            this._waitHandle = null;
        }
        this._ticBudget += (dt / 1000) / WadConstants.SECONDS_PER_TIC;
        if (this._waitTics > 0) {
            if (this._ticBudget < this._waitTics) {
                this._waitTics -= this._ticBudget;
                this._ticBudget = 0;
                return this;
            }
            this._ticBudget -= this._waitTics;
            this._waitTics = 0;
        }

        let guard = 0;
        while (!this._done && (this._waitTics <= 0) && (this._waitHandle === null)
            && (guard < DoomSoundSequencePlayer.STEP_GUARD)) {
            guard++;
            this._step();
        }

        return this;
    }

    _step() {
        const commands = this._current.commands;
        if (this._pc >= commands.length) {
            this._endOfSequence();
            return;
        }
        const {op, args} = commands[this._pc];
        this._pc++;
        switch (op) {
            case 'play':
                this._play(args[0]);
                break;
            case 'playuntildone':
                this._waitHandle = this._play(args[0]);
                break;
            case 'playtime':
                this._play(args[0]);
                this._waitTics = Number(args[1]);
                break;
            case 'playrepeat':
                this._waitHandle = this._play(args[0], true);
                break;
            case 'delay':
                this._waitTics = Number(args[0]);
                break;
            case 'delayonce':
                if (!this._onceDone) {
                    this._onceDone = true;
                    this._waitTics = Number(args[0]);
                }
                break;
            case 'delayrand':
                this._waitTics = DoomSoundSequencePlayer._randBetween(Number(args[0]), Number(args[1]));
                break;
            case 'volume':
                this._volume = Number(args[0]);
                break;
            case 'volumerel':
                this._volume += Number(args[0]);
                break;
            case 'volumerand':
                this._volume = DoomSoundSequencePlayer._randBetween(Number(args[0]), Number(args[1]));
                break;
            case 'attenuation':
                this._attenuation = (WadConstants.SOUND_ATTN[args[0]] ?? WadConstants.SOUND_ATTN.norm);
                break;
            case 'randomsequence':
                this._enterRandomSequence();
                break;
            case 'restart':
                this._pc = 0;
                break;
            case 'stopsound':
            case 'nostopcutoff':
                // Stop-time behaviour of the mover sequences — no machine is
                // externally stopped today (ambient scripts run forever).
                break;
            default:
                break;
        }
    }

    // A sub-sequence drawn from the level's candidates; its end returns here.
    _enterRandomSequence() {
        const pool = (this._candidates ?? []);
        if (pool.length === 0) {
            return;
        }
        const next = this._sequences.byName(pool[Math.floor(Math.random() * pool.length)]);
        if (next === null) {
            return;
        }
        this._stack.push({sequence: this._current, pc: this._pc});
        this._current = next;
        this._pc      = 0;
    }

    _endOfSequence() {
        const parent = this._stack.pop();
        if (parent === undefined) {
            this._done = true;
            return;
        }
        this._current = parent.sequence;
        this._pc      = parent.pc;
    }

    _play(name, loop = false) {
        const gain   = Math.min(Math.max(this._volume / DoomSoundSequencePlayer.FULL_VOLUME, 0), 1);
        const handle = doomSound.playAt(name, this._origin, {attenuation: this._attenuation, loop: loop});
        if (handle !== null) {
            handle.setGain(gain);
        }

        return handle;
    }

    static _randBetween(min, max) {
        return (min + Math.random() * (max - min));
    }
}
