class SwitchInteraction extends AbstractInteraction {
    constructor(code, targets) {
        super();
        this._code    = code;
        this._targets = targets || [];
    }

    get code() {
        return this._code;
    }

    triggered(instance) {
        console.log('[SwitchInteraction] ' + this._code + ' triggered by: ' + instance.getCode());
    }

    update(dt) {
    }
}
