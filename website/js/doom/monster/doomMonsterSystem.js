/**
 * Runtime monster driver. Phase A scope: monsters are inert bodies — this
 * system only advances their Spawn-state animation at 35 Hz and picks the
 * rotation view matching the camera position (vanilla R_ProjectSprite: the
 * world angle monster→viewer minus the monster's facing selects one of the
 * 8 octants; rotation 1 faces the viewer).
 *
 * Records are added DURING the loading batch (the world builder) with their
 * engine instance: the entity exists as soon as loadFromData registers it —
 * only its object resolution waits for finalizeInit, which this system never
 * needs before its first update.
 */
class DoomMonsterSystem {
    constructor() {
        this._monsters = [];
        this._user     = null;
        this._timeAcc  = 0;
    }

    /**
     * @param {object} record {code, inst (engine Instance), def,
     *                         facing (Doom degrees), flags,
     *                         frames: {letter → [objId ×1|×8]}}
     */
    add(record) {
        this._monsters.push({
            code:     record.code,
            inst:     record.inst,
            def:      record.def,
            facing:   record.facing,
            flags:    record.flags,
            frames:   record.frames,
            stateKey: 'spawn0',
            ticsLeft: record.def.getState('spawn0').getTics(),
            shownObj: null
        });
        return this;
    }

    setUser(user) {
        this._user = user;
        return this;
    }

    getMonsters() {
        return this._monsters;
    }

    update(dt) {
        if (this._user === null) {
            return;
        }
        this._timeAcc += dt;
        while (this._timeAcc >= DoomMonsterSystem.MS_PER_TIC) {
            this._timeAcc -= DoomMonsterSystem.MS_PER_TIC;
            this._stepTic();
        }
    }

    _stepTic() {
        for (const m of this._monsters) {
            const state = m.def.getState(m.stateKey);
            if (state.getTics() >= 0) {
                m.ticsLeft--;
                if ((m.ticsLeft <= 0) && (state.getNext() !== null)) {
                    m.stateKey = state.getNext();
                    m.ticsLeft = m.def.getState(m.stateKey).getTics();
                }
            }

            this._refreshView(m);
        }
    }

    _refreshView(m) {
        const views = m.frames[m.def.getState(m.stateKey).getFrame()];
        if (views === undefined) {
            return;
        }
        const objId = ((views.length === 1) ? views[0] : views[this._rotationOctant(m)]);
        if (objId !== m.shownObj) {
            m.inst.setObject(objId);
            m.shownObj = objId;
        }
    }

    // Octant of the view angle: world runs on worldX = doomX / worldZ = +doomY,
    // so atan2(dz, dx) IS the Doom angle. (angleToViewer − facing + 22.5°) / 45
    // is the thing→viewer form of the vanilla viewer→thing +202.5° formula.
    _rotationOctant(m) {
        const pos = m.inst.getTransform().position;
        const angleToViewer = Math.atan2(this._user.z - pos[2], this._user.x - pos[0]) * 180 / Math.PI;
        return Math.floor(((((angleToViewer - m.facing + 22.5) % 360) + 360) % 360) / 45);
    }
}

DoomMonsterSystem.MS_PER_TIC = 1000 / 35;
