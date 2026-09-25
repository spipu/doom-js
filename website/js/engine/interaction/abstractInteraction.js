class AbstractInteraction {
    get code() {
        throw new Error('AbstractInteraction: code not implemented');
    }

    triggered(instance) {
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
