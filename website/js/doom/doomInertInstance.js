/**
 * An instance born in play that nothing touches nor triggers — a body replica,
 * a shot, an effect, a decal: no collision, no trigger, no animation of its
 * own; its owner moves it.
 */
class DoomInertInstance {
    /**
     * @param {string}   objId
     * @param {number[]} position - [x, y, z]
     * @param {number[]} rotation - [x, y, z]
     * @returns {string} the id of the instance spawned
     */
    static spawn(objId, position, rotation = [0, 0, 0]) {
        return loader.instances().spawnFromData(null, {
            object:         objId,
            position:       position,
            rotation:       rotation,
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      []
        });
    }
}

// The animation deltas of a pose imposed from outside (Instance.setPose).
DoomInertInstance.NO_DELTA = [0, 0, 0];
