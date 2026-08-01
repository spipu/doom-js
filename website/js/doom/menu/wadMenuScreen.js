/**
 * Menu of one selected WAD, between the WAD list and the difficulty screen:
 * new game, options, about, quit. The panel subtitle is the WAD title alone,
 * and the screen carries no bottom back button — its "Quitter" entry and the
 * back inputs (Backspace / gamepad circle) both return to the WAD list.
 */
class WadMenuScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        super(navigator, display);

        this._wadMeta = null;
    }

    /**
     * @param {object} meta
     */
    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {listEl} = this._buildPanel(this._wadTitle(this._wadMeta));

        this._addListItem(listEl, appTranslator.get('menu.game.newGame'), () => {
            this._navigator.openEpisodes(this._wadMeta);
        });
        this._addListItem(listEl, appTranslator.get('menu.game.load'), () => {
            this._openLoadGame();
        });
        this._addListItem(listEl, appTranslator.get('menu.game.options'), () => {
            this._openOptions();
        });
        this._addListItem(listEl, appTranslator.get('help.about'), () => {
            this._openAbout();
        });
        this._addListItem(listEl, appTranslator.get('menu.game.quit', {wad: this._wadTitle(this._wadMeta)}), () => {
            this._onBack();
        });

        this._nav.selectFirst();
    }

    _onBack() {
        this._navigator.showWadList();
    }

    // Rebuilt on close: a setting changed in the modal (the language, the size
    // units…) must reach this screen too, which stayed untouched underneath it.
    _openOptions() {
        new MenuOptionsModal(this._display).setOnClose(() => this.show()).show();
    }

    // Save slots of this WAD in load mode; picking one launches its level
    // with the saved state restored on top.
    _openLoadGame() {
        new MenuSaveSlotsModal(this._display)
            .setMode(MenuSaveSlotsModal.MODE_LOAD)
            .setWad(this._wadMeta)
            .setOnClose(() => this.show())
            .setOnLoad((saveMeta) => {
                this._navigator.startFromSave(this._wadMeta, saveMeta);
            })
            .show();
    }

    _openAbout() {
        new MenuOptionsModal(this._display).setOnClose(() => this.show()).showAbout();
    }
}
