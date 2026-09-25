/**
 * Menu of one selected WAD, between the WAD list and the episode screen: new
 * game, load, options, about, bug report. The bottom button reads "Quit {wad}"
 * and returns to the WAD list, like the back inputs.
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
        const {panel, listEl} = this._buildPanel(this._wadTitle(this._wadMeta));

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
        this._addListItem(listEl, appTranslator.get('menu.game.reportBug'), () => {
            window.open(DoomExternalLinks.ISSUES, '_blank', 'noopener');
        });
        this._addBackButton(panel, appTranslator.get('menu.game.quit', {wad: this._wadTitle(this._wadMeta)}));

        this._nav.selectFirst();
    }

    _onBack() {
        this._navigator.showWadList();
    }

    _openOptions() {
        this._openModal(new MenuOptionsModal(this._display)).show();
    }

    // Save slots of this WAD in load mode; picking one launches its level
    // with the saved state restored on top.
    _openLoadGame() {
        this._openModal(new MenuSaveSlotsModal(this._display)
            .setMode(MenuSaveSlotsModal.MODE_LOAD)
            .setWad(this._wadMeta)
            .setOnLoad((saveMeta) => {
                this._navigator.startFromSave(this._wadMeta, saveMeta);
            }))
            .show();
    }
}
