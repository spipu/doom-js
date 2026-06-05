class Interaction extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._interaction = null;
    }

    setInteraction(interaction) {
        this._interaction = interaction;
        this._code = interaction.code;
        this.setLoaded();
    }

    triggered(instance) {
        this._interaction.triggered(instance);
    }

    update(dt) {
        this._interaction.update(dt);
    }
}
