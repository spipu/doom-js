/**
 * Immutable definition of one monster, transcribed from the UZDoom zscript
 * actors (stats + state machine). Shared by every spawned instance of the
 * type — the per-monster runtime state lives on the DoomMonsterSystem records.
 *
 * States come in named groups ('spawn', 'see', 'missile', …) of tuples
 * [frames, tics, action, next, bright?, fast?] where:
 *  - frames  = one letter per state, in zscript order ('AABBCC' expands to six
 *              chained states sharing the tuple's tics/action);
 *  - tics    = duration (35 Hz); -1 = terminal state (never advances);
 *  - action  = zscript action NAME only (string) — the parametric details are
 *              re-transcribed from source when the consuming phase implements
 *              the verb (same policy as the weapon tables);
 *  - next    = state key ('see', 'missile2', …) taken by the LAST state of the
 *              tuple; a bare group name targets its first state; omitted/null
 *              chains to the next tuple of the group (null on the group's last
 *              state = the vanilla Stop);
 *  - bright / fast = optional booleans (fullbright, FastMonsters half-tics).
 */
class DoomMonsterDef {
    constructor(data) {
        this._code       = data.code;
        this._name       = data.name;
        this._sprite     = data.sprite;
        this._health     = data.health;
        this._radius     = data.radius;
        this._height     = data.height;
        this._mass       = (data.mass ?? 100);
        this._speed      = (data.speed ?? 0);
        this._painChance = (data.painChance ?? 0);
        this._alpha      = (data.alpha ?? 1);
        this._ceiling    = (data.ceiling === true);
        this._flags      = (data.flags ?? {});
        this._bossMaps   = (data.bossMaps ?? []);
        this._dropItems  = (data.dropItems ?? []);
        this._params     = (data.params ?? {});
        this._states     = {};
        this._buildStates(data);
    }

    // Two passes: expand every group into raw descriptors first, then resolve
    // the jump keys against the complete set and build the immutable states —
    // no state is ever mutated after construction.
    _buildStates(data) {
        const overrides = (data.spriteOverrides ?? {});
        const raw = {};
        for (const group of Object.keys(data.states)) {
            this._expandGroup(raw, group, (overrides[group] ?? this._sprite), data.states[group]);
        }
        for (const key of Object.keys(raw)) {
            const st = raw[key];
            this._states[key] = new DoomMonsterState(st.sprite, st.frame, st.tics, st.action, this._resolveNext(raw, key, st.next), st.bright, st.fast);
        }
    }

    _expandGroup(raw, group, sprite, tuples) {
        const expanded = [];
        for (const [frames, tics, action, next, bright, fast] of tuples) {
            for (let i = 0; i < frames.length; i++) {
                // The zscript action runs on EVERY state of the multi-letter
                // line ('AABBCCDD 4 A_Chase' = 8 chase steps); only the jump
                // belongs to the last one.
                const last = (i === frames.length - 1);
                expanded.push({
                    sprite: sprite,
                    frame:  frames[i],
                    tics:   tics,
                    action: (action ?? null),
                    next:   ((last) ? (next ?? null) : null),
                    bright: (bright === true),
                    fast:   (fast === true)
                });
            }
        }
        for (let k = 0; k < expanded.length; k++) {
            if ((expanded[k].next === null) && ((k + 1) < expanded.length)) {
                expanded[k].next = group + (k + 1);
            }
            raw[group + k] = expanded[k];
        }
    }

    // A jump may name a bare group ('see'): normalize it to the group's first
    // state key. An unresolvable key is a transcription error.
    _resolveNext(raw, key, next) {
        if ((next === null) || (raw[next] !== undefined)) {
            return next;
        }
        if (raw[next + '0'] !== undefined) {
            return next + '0';
        }
        throw new Error('DoomMonsterDef [' + this._code + '] - unresolvable next state "' + next + '" from "' + key + '"');
    }

    getCode() {
        return this._code;
    }

    getName() {
        return this._name;
    }

    getSprite() {
        return this._sprite;
    }

    getHealth() {
        return this._health;
    }

    getRadius() {
        return this._radius;
    }

    getHeight() {
        return this._height;
    }

    getMass() {
        return this._mass;
    }

    getSpeed() {
        return this._speed;
    }

    getPainChance() {
        return this._painChance;
    }

    getAlpha() {
        return this._alpha;
    }

    isCeiling() {
        return this._ceiling;
    }

    getFlags() {
        return this._flags;
    }

    getBossMaps() {
        return this._bossMaps;
    }

    getDropItems() {
        return this._dropItems;
    }

    getParams() {
        return this._params;
    }

    getState(key) {
        return (this._states[key] ?? null);
    }

    getStateKeys() {
        return Object.keys(this._states);
    }

    // Catalog key of one monster view — the contract between the builders
    // (which prebuild the billboards under it) and the runtime (_refreshView).
    static viewKey(sprite, frame) {
        return (sprite + frame);
    }

    // Distinct {sprite, frame} pairs of the given state groups (the sprite is
    // per-state: spriteOverrides groups differ from the base — barrel BEXP).
    getFramePairs(groups) {
        const seen  = new Set();
        const pairs = [];
        for (const key of Object.keys(this._states)) {
            if (!groups.some((g) => key.startsWith(g))) {
                continue;
            }
            const state   = this._states[key];
            const pairKey = DoomMonsterDef.viewKey(state.getSprite(), state.getFrame());
            if (!seen.has(pairKey)) {
                seen.add(pairKey);
                pairs.push({sprite: state.getSprite(), frame: state.getFrame()});
            }
        }
        return pairs;
    }
}
