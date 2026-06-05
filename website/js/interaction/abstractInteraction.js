class AbstractInteraction {
    get code() {
        throw new Error('AbstractInteraction: code not implemented');
    }

    triggered(instance) {
    }

    update(dt) {
    }
}
