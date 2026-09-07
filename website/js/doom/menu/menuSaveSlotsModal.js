/**
 * Save slots modal (load and save modes), stacked over the WAD menu or the
 * pause menu. Always shows the MAX_SLOTS slots: a used one displays its level,
 * difficulty and date plus a delete cross (confirmed); a free one reads
 * "empty" — selectable to save, inert to load. Saving over a used slot asks
 * for confirmation; a "saving" loading modal covers the write for at least
 * SAVING_DISPLAY_MS, then the save hands over to the owner's onSaved callback
 * (the pause resumes the game) or, without one, refreshes the list in place.
 * The bottom "Back" button (same path as Backspace / the gamepad back button)
 * closes back to the owner in both modes.
 */
class MenuSaveSlotsModal extends AbstractMenuListModal {
    static MODE_LOAD = 'load';
    static MODE_SAVE = 'save';

    // The write is near-instant: the saving modal is held long enough to be read.
    static SAVING_DISPLAY_MS = 1000;

    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._mode        = MenuSaveSlotsModal.MODE_LOAD;
        this._wadMeta     = null;
        this._onLoad      = null;
        this._onSaved     = null;
        this._saveContext = null;
        this._slots       = {};
        this._bodyEl      = null;
    }

    setMode(mode) {
        this._mode = mode;

        return this;
    }

    /**
     * WAD whose slots are shown — its id partitions the saves and its display
     * title prefixes the modal title.
     * @param {object} wadMeta
     */
    setWad(wadMeta) {
        this._wadMeta = wadMeta;

        return this;
    }

    // Load mode: fired with the chosen slot's metadata; the modal closed
    // itself (onClose neutralized) before the call.
    setOnLoad(callback) {
        this._onLoad = callback;

        return this;
    }

    // Save mode: fired once the slot is written; the modal closed itself
    // (onClose neutralized) before the call.
    setOnSaved(callback) {
        this._onSaved = callback;

        return this;
    }

    // Save mode: {buildMeta(slot), capture()} provided by the running game.
    setSaveContext(context) {
        this._saveContext = context;

        return this;
    }

    async show() {
        // A broken storage degrades to an all-empty list (a save would then
        // surface its own error modal on write).
        try {
            this._slots = await doomSaveStore.list(this._wadMeta.id);
        } catch (error) {
            console.warn('MenuSaveSlotsModal - unable to list the saves: ' + error.message);
            this._slots = {};
        }
        // The owner may have been torn down during the read (an Escape resume
        // closing the pause) — nothing left to build into.
        if (this._display.getContainer() === null) {
            return this;
        }

        const titleCode = ((this._mode === MenuSaveSlotsModal.MODE_SAVE) ? 'menu.save.titleSave' : 'menu.save.titleLoad');
        const title = WadRegistry.displayTitle(this._wadMeta) + ' — ' + appTranslator.get(titleCode);
        this._bodyEl = this._openShell(title, appTranslator.get('menu.back')).bodyEl;
        this._renderList();

        return this;
    }

    // --- Internal ---

    _renderList() {
        this._bodyEl.innerHTML = '';
        this._nav.clear();

        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (let slot = 1; slot <= DoomSaveStore.MAX_SLOTS; slot++) {
            this._buildSlotRow(list, slot, (this._slots[slot] ?? null));
        }
        this._nav.selectFirst();
    }

    _buildSlotRow(listEl, slot, meta) {
        const slotLabel = appTranslator.get('menu.save.slot', {n: slot});

        if (meta === null) {
            const emptyLabel = slotLabel + ' — ' + appTranslator.get('menu.save.empty');
            if (this._mode === MenuSaveSlotsModal.MODE_SAVE) {
                this._nav.addItemIn(listEl, emptyLabel, () => this._doSave(slot));
                return;
            }
            MenuDom.addListItem(listEl, emptyLabel).classList.add('doom-menu-item-disabled');
            return;
        }

        const label  = slotLabel + ' — ' + meta.levelCode + ' — ' + appTranslator.get('difficulty.' + meta.skill);
        const action = ((this._mode === MenuSaveSlotsModal.MODE_SAVE)
            ? () => this._confirmOverwrite(slot)
            : () => this._loadSlot(meta));
        const item = this._nav.addItemIn(listEl, label, action);
        MenuDom.addText(item, 'doom-menu-item-value', MenuDom.formatDate(meta.savedAt, true));

        MenuDom.addDeleteButton(item, appTranslator.get('menu.save.delete'), () => {
            this._confirmDelete(slot);
        });
    }

    _loadSlot(meta) {
        const onLoad = this._onLoad;
        // Closed silently first: the owner's re-render must not race the
        // level launch tearing the menus down.
        this.setOnClose(null).close();
        onLoad(meta);
    }

    _confirmOverwrite(slot) {
        this._confirm(appTranslator.get('menu.save.overwriteConfirm', {n: slot}), () => {
            this._doSave(slot);
        });
    }

    _doSave(slot) {
        const meta     = this._saveContext.buildMeta(slot);
        const snapshot = this._saveContext.capture();
        const saving   = new MenuModal(this._display).showLoading(appTranslator.get('menu.save.saving'));
        const held     = new Promise((resolve) => setTimeout(resolve, MenuSaveSlotsModal.SAVING_DISPLAY_MS));
        Promise.all([doomSaveStore.write(meta, snapshot), held])
            .finally(() => saving.close())
            .then(() => this._onWritten())
            .catch((error) => this._showStorageError(error));
    }

    _onWritten() {
        if (this._onSaved === null) {
            this._refresh();
            return;
        }
        const onSaved = this._onSaved;
        this.setOnClose(null).close();
        onSaved();
    }

    _confirmDelete(slot) {
        this._confirm(appTranslator.get('menu.save.deleteConfirm', {n: slot}), () => {
            doomSaveStore.remove(this._wadMeta.id, slot)
                .then(() => this._refresh())
                .catch((error) => this._showStorageError(error));
        });
    }

    async _refresh() {
        this._slots = await doomSaveStore.list(this._wadMeta.id);
        this._renderList();
    }

    _showStorageError(error) {
        console.error(error);
        new MenuModal(this._display).showError(appTranslator.get('menu.storageUnavailable'), error.message, () => {});
    }
}
