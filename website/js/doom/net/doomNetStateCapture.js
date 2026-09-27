/**
 * The replicated state of a turn, built on the main as plain data (no
 * encoding): every value that can diverge from the level the WAD rebuilds and
 * that a sub needs to show the world — the players (camera, HUD, weapon view),
 * the bodies and the shots in flight, the map pickups still there and the
 * drops, the movers away from their rest pose, the switches turned on, the
 * rewritten floors, the moving sector lights, the level statistics — and the
 * events of the turn. What the simulation alone reads stays on the main.
 */
class DoomNetStateCapture {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomBuiltLevel}   builtLevel
     * @param {DoomLevelStats}   stats
     * @param {DoomNetEvents}    events
     */
    constructor(roster, builtLevel, stats, events) {
        this._roster = roster;
        this._level  = builtLevel;
        this._ids    = builtLevel.getEntityIds();
        this._stats  = stats;
        this._events = events;
    }

    /**
     * @param {int}    turn      - counted from the start of the session
     * @param {number} elapsedMs - the time step of the turn
     * @returns {object} the StateSnapshot of the turn
     */
    capture(turn, elapsedMs) {
        const bodies = Array.from(this._level.getBodyViews());

        return {
            turn:        turn,
            elapsedMs:   elapsedMs,
            players:     this._roster.getAll().map((player) => this._player(player)),
            bodies:      bodies.map((view) => this._body(view)),
            bornBodies:  bodies.filter((view) => this._ids.isBornInPlay(view)).map((view) => this._bornBody(view)),
            projectiles: Array.from(this._level.getProjectileViews()).map((view) => this._projectile(view)),
            pickups:     this._pickups(),
            movers:      this._movers(),
            switches:    this._switches(),
            surfaces:    this._surfaces(),
            lights:      ((this._level.getLightEffects() !== null) ? this._level.getLightEffects().getLevels() : []),
            stats:       this._stats.exportCounts(),
            events:      this._events.drain()
        };
    }

    _player(player) {
        const user = player.getUser();
        const view = player.getWeaponView();
        const hud  = user.exportState();

        return {
            id:           player.getId(),
            x:            user.x,
            y:            user.y,
            z:            user.z,
            yaw:          user.yaw,
            pitch:        user.pitch,
            cameraY:      user.getCameraY(),
            lean:         user.getStrafeLean(),
            dead:         user.isDead(),
            energy:       hud.energy,
            armor:        hud.armor,
            maxArmor:     hud.maxArmor,
            armorAbsorb:  hud.armorAbsorb,
            energyFlash:  user.getEnergyFlash(),
            pickupFlash:  user.getPickupFlash(),
            activeWeapon: hud.activeWeapon,
            weapons:      user.getOwnedWeaponCodes(),
            ammo:         Object.keys(hud.ammoMax).map((type) => ({type: type, count: (hud.ammo[type] ?? 0), max: hud.ammoMax[type]})),
            items:        hud.items,
            effects:      Object.keys(hud.effects).map((code) => ({code: code, ms: hud.effects[code]})),
            weapon:       {
                weapon:     view.getWeapon(),
                lump:       view.getWeaponLump(),
                bright:     view.isWeaponBright(),
                flashLump:  view.getFlashLump(),
                offsetX:    view.getOffsetX(),
                offsetY:    view.getOffsetY(),
                lowered:    view.isLowered(),
                extraLight: view.getExtraLight()
            }
        };
    }

    // The frame is the rank of its key among the body's views: both devices
    // hold the same frames for the same kind.
    _body(view) {
        const pos    = view.getInstance().getTransform().position;
        const offset = view.getRenderOffset();

        return {
            id:      this._ids.idOfView(view),
            x:       pos[0],
            y:       pos[1],
            z:       pos[2],
            facing:  view.getFacing(),
            frame:   DoomNetStateCapture.frameIndex(view),
            bright:  view.isBright(),
            crushed: view.isCrushed(),
            sector:  view.getSector(),
            offset:  ((offset !== null) ? [offset[0], offset[1], offset[2]] : null)
        };
    }

    _bornBody(view) {
        return {id: this._ids.idOfView(view), drop: view.isDrop(), kind: view.getKind()};
    }

    _projectile(view) {
        return {id: this._ids.idOfView(view), kind: view.getKind(), frame: view.getFrame(), x: view.getX(), y: view.getY(), z: view.getZ()};
    }

    // One presence bit per map pickup, in table order: a taken one is gone.
    _pickups() {
        return this._ids.getPickupCodes().map((code) => (loader.instances().idByCode(code) !== null));
    }

    // A mover at its rest pose is left out: the sub rebuilt it there. The
    // bodies travel in their own records.
    _movers() {
        const movers = [];
        loader.instances().getAll().forEach((instance) => {
            const id = this._ids.idOfInstance(instance);
            if ((id === null) || instance.getCode().startsWith(DoomGameSnapshot.MONSTER_PREFIX) || !DoomNetStateCapture._isMoved(instance)) {
                return;
            }
            const transform = instance.getTransform();
            movers.push({id: id, position: [...transform.position], translate: [...transform.deltaTranslate], rotate: [...transform.deltaRotate]});
        });

        return movers;
    }

    _switches() {
        const on = [];
        loader.interactions().getAll().forEach((entity) => {
            const interaction = entity.getInteraction();
            if ((interaction instanceof DoomSwitchInteraction) && (interaction.exportState().state === true)) {
                on.push(this._ids.idOfCode(interaction.code));
            }
        });

        return on;
    }

    _surfaces() {
        const surfaces = this._level.getSectorSurfaces();

        return ((surfaces !== null) ? surfaces.exportState().map((entry) => ({si: entry.si, flat: entry.flat})) : []);
    }

    /**
     * @returns {int|null} the rank of the view's frame key among its frames, null for none
     */
    static frameIndex(view) {
        if ((view.getFrames() === null) || (view.getFrameKey() === null)) {
            return null;
        }
        const index = DoomNetStateCapture.frameKeys(view.getFrames()).indexOf(view.getFrameKey());

        return ((index >= 0) ? index : null);
    }

    // Sorted once per frames table (shared by every body of a kind).
    static frameKeys(frames) {
        let keys = DoomNetStateCapture._frameKeys.get(frames);
        if (keys === undefined) {
            keys = Object.keys(frames).sort();
            DoomNetStateCapture._frameKeys.set(frames, keys);
        }

        return keys;
    }

    static _isMoved(instance) {
        const rotate = instance.getTransform().deltaRotate;

        return ((instance.getVerticalShift() !== 0) || (rotate[0] !== 0) || (rotate[1] !== 0) || (rotate[2] !== 0));
    }
}

DoomNetStateCapture._frameKeys = new WeakMap();   // frames table → its sorted view keys
