/**
 * Applies a map patch list to a freshly parsed level. The verbs are the UZDoom
 * LevelPostProcessor ones (see website/assets/uzdoom/), already resolved to
 * doom-format values: the patcher only edits the parsed records in place.
 */
class WadLevelPatcher {
    static HANDLERS = {
        setWallTexture:    '_setWallTexture',
        offsetSectorPlane: '_offsetSectorPlane',
        clearSectorTags:   '_clearSectorTags',
        addSectorTag:      '_addSectorTag',
        setSectorSpecial:  '_setSectorSpecial',
        setLineFlags:      '_setLineFlags',
        setLineSpecial:    '_setLineSpecial',
        setThingSkills:    '_setThingSkills',
        setThingFlags:     '_setThingFlags'
    };

    /**
     * @param {{linedefs: object[], sidedefs: object[], sectors: object[], things: object[]}} level
     * @param {object[]} actions
     * @returns {int} number of actions applied
     */
    apply(level, actions) {
        let applied = 0;
        for (const action of actions) {
            const handler = WadLevelPatcher.HANDLERS[action.op];
            if (handler === undefined) {
                throw new WadError('invalid-format', 'Level patch: unknown action "' + action.op + '"');
            }
            if (this[handler](level, action)) {
                applied++;
            }
        }

        return applied;
    }

    _setWallTexture(level, action) {
        const linedef = this._record(level.linedefs, action.line, 'linedef');
        if (linedef === null) {
            return false;
        }
        const sidedef = this._record(level.sidedefs, ((action.side === 'front') ? linedef.right : linedef.left), 'sidedef');
        if (sidedef === null) {
            return false;
        }
        sidedef[action.part] = action.texture;

        return true;
    }

    _offsetSectorPlane(level, action) {
        const sector = this._record(level.sectors, action.sector, 'sector');
        if (sector === null) {
            return false;
        }
        sector[((action.plane === 'floor') ? 'fh' : 'ch')] += action.delta;

        return true;
    }

    _clearSectorTags(level, action) {
        const sector = this._record(level.sectors, action.sector, 'sector');
        if (sector === null) {
            return false;
        }
        sector.tag = 0;

        return true;
    }

    _addSectorTag(level, action) {
        const sector = this._record(level.sectors, action.sector, 'sector');
        if (sector === null) {
            return false;
        }
        sector.tag = action.tag;

        return true;
    }

    _setSectorSpecial(level, action) {
        const sector = this._record(level.sectors, action.sector, 'sector');
        if (sector === null) {
            return false;
        }
        sector.special = action.special;

        return true;
    }

    _setLineFlags(level, action) {
        const linedef = this._record(level.linedefs, action.line, 'linedef');
        if (linedef === null) {
            return false;
        }
        linedef.flags = ((linedef.flags | (action.set ?? 0)) & ~(action.clear ?? 0));

        return true;
    }

    _setLineSpecial(level, action) {
        const linedef = this._record(level.linedefs, action.line, 'linedef');
        if (linedef === null) {
            return false;
        }
        linedef.special = action.special;
        if (action.tag !== undefined) {
            linedef.tag = action.tag;
        }

        return true;
    }

    _setThingSkills(level, action) {
        const thing = this._record(level.things, action.thing, 'thing');
        if (thing === null) {
            return false;
        }
        const mask = WadConstants.MTF_SKILL_MASK;
        thing.flags = ((action.enabled === true) ? (thing.flags | mask) : (thing.flags & ~mask));

        return true;
    }

    _setThingFlags(level, action) {
        const thing = this._record(level.things, action.thing, 'thing');
        if (thing === null) {
            return false;
        }
        thing.flags = ((thing.flags | (action.set ?? 0)) & ~(action.clear ?? 0));

        return true;
    }

    // The checksum vouches for the map: an index out of range is a
    // transcription error, reported, never fatal.
    _record(list, index, kind) {
        if ((index < 0) || (index >= list.length)) {
            console.warn('WadLevelPatcher - ' + kind + ' #' + index + ' out of range');
            return null;
        }

        return list[index];
    }
}
