/**
 * A scenery object definition: a world sprite that is not picked up (barrel,
 * lamp, corpse, tree…). Like the other catalog definitions it is immutable and
 * shared; the actual occurrences are engine Instances rebuilt per level from the
 * WAD THINGS lump, so resetOnNewLevel is irrelevant here (no player state).
 *
 * solid + radius drive the collision phase: a solid decoration blocks the player
 * with a vertical cylinder of that radius (Doom MF_SOLID things); non-solid ones
 * are walked through. ceiling marks the hanging decorations (Doom spawnceiling):
 * they anchor their top to the ceiling instead of their foot to the floor.
 */
class DoomDecoration extends AbstractDoomObject {
    constructor(data) {
        super(data, false);
        this._solid   = (data.solid === true);
        this._radius  = data.radius ?? 0;
        this._ceiling = (data.ceiling === true);
    }

    isSolid() {
        return this._solid;
    }

    getRadius() {
        return this._radius;
    }

    isCeiling() {
        return this._ceiling;
    }
}
