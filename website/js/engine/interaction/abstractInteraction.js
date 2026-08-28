class AbstractInteraction {
    get code() {
        throw new Error('AbstractInteraction: code not implemented');
    }

    triggered(instance) {
    }

    update(dt) {
    }

    // Plain-data snapshot of the mutable state, restorable by importState
    // after a deterministic rebuild. Stateless interactions return null
    // (nothing to persist).
    exportState() {
        return null;
    }

    importState(state) {
    }
}
