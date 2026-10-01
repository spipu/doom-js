/**
 * Brings a map pickup back into the level, the same on every device: the
 * instance the level was built with — same code, so the same network id and
 * the same pickup interaction —, on the floor it follows as that floor stands
 * now (P_RespawnSpecials spawns ONFLOORZ).
 */
class DoomPickupSpawner {
    /**
     * @param {object} pickup - a DoomBuiltLevel pickup entry, with its spawnData and rideCode
     * @returns {Instance}
     */
    static respawn(pickup) {
        const instance = loader.instances().get(loader.instances().spawnFromData(null, Object.assign({}, pickup.spawnData, {
            position: DoomPickupSpawner.spotOf(pickup),
            rotation: [...pickup.spawnData.rotation]
        })));
        const floor = DoomPickupSpawner._floorOf(pickup);
        if (floor !== null) {
            instance.setRideOn(floor);
        }

        return instance;
    }

    /**
     * @param {object} pickup - a DoomBuiltLevel pickup entry
     * @returns {number[]} [x, y, z] where it stands, its floor where that floor is now
     */
    static spotOf(pickup) {
        const floor = DoomPickupSpawner._floorOf(pickup);
        const shift = ((floor !== null) ? floor.getTransform().deltaTranslate[1] : 0);
        const rest  = pickup.spawnData.position;

        return [rest[0], rest[1] + shift, rest[2]];
    }

    static _floorOf(pickup) {
        return ((pickup.rideCode !== null) ? loader.instances().getByCode(pickup.rideCode) : null);
    }
}
