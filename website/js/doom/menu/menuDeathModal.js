/**
 * Death modal, shown by the game a moment after the player dies, over the
 * level that keeps running: restart the level, start a new game (episode
 * choice), load a save, leave the level. No way back into the dead body —
 * the back inputs are inert, and the game loop leaves Escape alone while
 * this modal is up.
 */
class MenuDeathModal extends AbstractGameMenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._onRestart = null;
        this._onNewGame = null;
    }

    /**
     * @param {function} callback
     */
    setOnRestart(callback) {
        this._onRestart = callback;

        return this;
    }

    /**
     * @param {function} callback
     */
    setOnNewGame(callback) {
        this._onNewGame = callback;

        return this;
    }

    _addEntries(listEl) {
        this._nav.addItemIn(listEl, appTranslator.get('game.death.restart'), () => this._restart());
        this._nav.addItemIn(listEl, appTranslator.get('menu.game.newGame'), () => this._newGame());
        if (this._saveContext !== null) {
            this._nav.addItemIn(listEl, appTranslator.get('menu.game.load'), () => this._openSlots(MenuSaveSlotsModal.MODE_LOAD));
        }
        this._nav.addItemIn(listEl, appTranslator.get('game.pause.quit'), () => this._quit());
    }

    _onBack() {
    }

    // --- Internal ---

    _restart() {
        if (this._onRestart !== null) {
            this._onRestart();
        }
    }

    _newGame() {
        if (this._onNewGame !== null) {
            this._onNewGame();
        }
    }
}
