/**
 * Catalog of the sound sequences (the Hexen-engine SNDSEQ mechanism): parses
 * the SNDSEQ text format — the WAD's own lump when it carries one (Hexen),
 * else the game profile's transcribed text (Heretic's ambient scripts) — into
 * named command lists a DoomSoundSequencePlayer executes.
 *
 * Grammar (zdoom.org/wiki/SNDSEQ): `:Name` opens a sequence, `end` closes it,
 * one command per line, `//` comments; `[Name n Seq …]` blocks define the
 * numbered door/platform groups (parsed and kept for Hexen, unused today).
 * `slot` and `environment` are metadata, not commands: the slot names the
 * random-pick family, the environment number is the one Raven's ambient
 * things (1200+n) address.
 */
class DoomSoundSequences {
    /**
     * @param {string} text SNDSEQ source (lump or profile transcription)
     */
    constructor(text) {
        this._byName        = {};
        this._byEnvironment = {};
        this._groups        = {};
        this._parse(text ?? '');
    }

    /**
     * @param {string} name
     * @returns {object|null} {commands, slot, environment}
     */
    byName(name) {
        return (this._byName[name] ?? null);
    }

    /**
     * @param {number} environment the ambient-thing index (thing 1200+n → n)
     * @returns {string|null} sequence name
     */
    environmentSequence(environment) {
        return (this._byEnvironment[environment] ?? null);
    }

    _parse(text) {
        const lines = text.split('\n');
        let current = null;
        let group   = null;
        for (const raw of lines) {
            const line = raw.replace(/\/\/.*$/, '').trim();
            if (line === '') {
                continue;
            }
            const tokens = line.split(/\s+/);
            if (group !== null) {
                if (tokens[0] === ']') {
                    group = null;
                } else if (tokens.length >= 2) {
                    group[Number(tokens[0])] = tokens[1];
                }
                continue;
            }
            if (line.startsWith('[')) {
                group = {};
                this._groups[tokens[0].slice(1)] = group;
                continue;
            }
            if (line.startsWith(':')) {
                current = {commands: [], slot: null, environment: null};
                this._byName[line.slice(1)] = current;
                continue;
            }
            if (current === null) {
                continue;
            }
            this._parseCommand(current, tokens);
            if (tokens[0] === 'end') {
                current = null;
            }
        }
        for (const [name, sequence] of Object.entries(this._byName)) {
            if (sequence.environment !== null) {
                this._byEnvironment[sequence.environment] = name;
            }
        }
    }

    _parseCommand(sequence, tokens) {
        const op = tokens[0];
        if (op === 'slot') {
            sequence.slot = tokens[1];
            return;
        }
        if (op === 'environment') {
            sequence.environment = Number(tokens[1]);
            return;
        }
        if (op === 'end') {
            return;
        }
        // Numeric arguments stay strings until execution needs them: a sound
        // name and a number both travel as tokens.
        sequence.commands.push({op: op, args: tokens.slice(1)});
    }
}
