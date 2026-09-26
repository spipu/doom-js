class AbstractInteraction {
    get code() {
        throw new Error('AbstractInteraction: code not implemented');
    }

    /**
     * @param {Instance} instance  - the instance whose trigger fired
     * @param {*}        activator - the user (or game actor) that fired it, null when unknown
     */
    triggered(instance, activator = null) {
    }

    update(dt) {
    }

    // Plain-data snapshot restorable by importState after a deterministic
    // rebuild; null when stateless.
    exportState() {
        return null;
    }

    importState(state) {
    }
}
