class AbstractHud {
    constructor(engine) {
        this._engine   = engine;
        this._user     = null;
        this._keyboard = null;
        this._mouse    = null;
    }

    bindUser(user) {
        this._user = user;
        return this;
    }

    bindKeyboard(keyboard) {
        this._keyboard = keyboard;
        return this;
    }

    bindMouse(mouse) {
        this._mouse = mouse;
        return this;
    }

    init(container) {
    }

    update() {
    }
}
