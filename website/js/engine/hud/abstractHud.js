class AbstractHud {
    constructor(engine) {
        this._engine = engine;
        this._user   = null;
        this._inputs = null;
        this._ratio  = 1;
    }

    setRatio(ratio) {
        this._ratio = ratio;
        return this;
    }

    bindUser(user) {
        this._user = user;
        return this;
    }

    bindInputs(inputs) {
        this._inputs = inputs;
        return this;
    }

    init(container) {
    }

    update() {
    }
}
