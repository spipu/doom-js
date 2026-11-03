/**
 * A scenery object definition: a world sprite that is not picked up (barrel,
 * lamp, corpse, tree…). resetOnNewLevel is irrelevant here: its occurrences are
 * engine Instances rebuilt per level from the THINGS lump.
 *
 * solid + radius drive the collision phase: a solid decoration blocks the player
 * with a vertical cylinder of that radius (Doom MF_SOLID things); non-solid ones
 * are walked through. ceiling marks the hanging decorations (Doom spawnceiling):
 * they hang height map units below the ceiling (info.c), their sprite drawn from
 * there by its own top offset, whatever the size of its picture.
 */
class DoomDecoration extends AbstractDoomObject {
    constructor(definition) {
        super(definition, false);
        this._solid   = (definition.solid === true);
        this._radius  = definition.radius ?? 0;
        this._ceiling = (definition.ceiling === true);
        this._height  = definition.height ?? 0;
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

    // P_SpawnMobj ONCEILINGZ: z = ceilingz - height.
    getHangHeight() {
        return ((this._ceiling) ? this._height : 0);
    }
}
