/**
 * Screen 1: list of the stored WAD files, with add (url or local file) and
 * delete, and the way to join a game whatever WAD it is played on.
 */
class WadListScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     * @param {WadRegistry}   registry
     */
    constructor(navigator, display, registry) {
        super(navigator, display);

        const links = new DoomNetLinks();

        this._registry       = registry;
        this._join           = new MenuJoinFlow(navigator, display, links, new DoomNetAvailability(links));
        this._listEl         = null;
        this._urlInput       = null;
        this._fileInput      = null;
        this._formButtons    = [];
        this._languageButton = null;
    }

    _build() {
        this._listEl      = null;
        this._urlInput    = null;
        this._fileInput   = null;
        this._formButtons = [];

        const {panel, listEl} = this._buildPanel(appTranslator.get('menu.wad.title'));
        this._listEl = listEl;

        const joinCorner = this._addElement('div', 'doom-menu-corner doom-menu-corner-left');
        const joinButton = MenuDom.addButton(joinCorner, 'doom-menu-button', appTranslator.get('multiplayer.join'),
            () => this._join.start());
        this._join.greyWhenUnavailable(joinButton);

        const corner = this._addElement('div', 'doom-menu-corner');
        this._languageButton = MenuDom.addButton(corner, 'doom-menu-button doom-menu-language',
            doomSettings.getListLabel(this._languageDefinition()),
            () => this._cycleLanguage());
        this._nav.setSideButtons([
            joinButton,
            this._languageButton,
            MenuDom.addButton(corner, 'doom-menu-button', appTranslator.get('help.guide'),
                () => this._openHelp())
        ]);

        this._buildAddForm(panel);

        this._addStatus(panel);

        this._refresh();
    }

    // --- Build ---

    _buildAddForm(panel) {
        const form = this._addElement('div', 'doom-menu-form', panel);

        this._urlInput = this._addElement('input', 'doom-menu-input', form);
        this._urlInput.type = 'text';
        this._urlInput.placeholder = appTranslator.get('menu.wad.urlPlaceholder');
        this._urlInput.addEventListener('keydown', (event) => {
            if ((event.code === 'Enter') || (event.code === 'NumpadEnter')) {
                event.preventDefault();
                addUrlButton.click();
            }
        });

        const addUrlButton = this._addButton(appTranslator.get('menu.wad.addUrl'), () => {
            this._onAddUrl();
        }, form);
        this._formButtons.push(addUrlButton);

        this._fileInput = this._addElement('input', 'doom-menu-file-input', form);
        this._fileInput.type = 'file';
        this._fileInput.accept = '.wad';
        this._fileInput.addEventListener('change', (event) => {
            this._onAddFile(event);
        });

        this._formButtons.push(this._addButton(appTranslator.get('menu.wad.addFile'), () => {
            this._fileInput.click();
        }, form));
    }

    async _refresh() {
        let list;
        try {
            list = await this._registry.getList();
        } catch (error) {
            this._showError(error);
            return;
        }

        this._clearList(this._listEl);

        if (list.length === 0) {
            this._addListEmpty(this._listEl, appTranslator.get('menu.wad.empty'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHint'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHintHelp'));
            MenuDom.addText(this._listEl, 'doom-menu-empty-hint', appTranslator.get('menu.wad.emptyHintSteps', {
                help: appTranslator.get('help.guide')
            }));
            return;
        }

        const titles = list.map((meta) => WadRegistry.displayTitle(meta));
        const shared = new Set(titles.filter((title, i) => (titles.indexOf(title) !== i)));
        list.forEach((meta, i) => {
            this._buildItem(meta, shared.has(titles[i]));
        });
        this._nav.selectFirst();
        this._completeIdentities(list.filter((meta) => !WadRegistry.isDescribed(meta)));
    }

    async _completeIdentities(pending) {
        if (pending.length === 0) {
            return;
        }
        const results = await Promise.allSettled(pending.map((meta) => this._registry.ensureIdentity(meta)));
        for (const result of results.filter((r) => (r.status === 'rejected'))) {
            console.warn('WadListScreen - unable to describe a WAD: ' + result.reason.message);
        }
        // Only a description actually stored changes the list: anything else would describe it again, endlessly.
        const described = results.some((r) => ((r.status === 'fulfilled') && (r.value !== null)));
        if (described && (this._container !== null)) {
            await this._refresh();
        }
    }

    _buildItem(meta, ambiguousTitle) {
        const item = this._addListItem(this._listEl, WadRegistry.displayTitle(meta), () => {
            this._onSelectWad(meta);
        });

        const infos = [((ambiguousTitle) ? meta.name : null), WadRegistry.versionLabel(meta), MenuDom.formatSize(meta.size), MenuDom.formatDay(meta.addedAt)];
        this._addListItemInfos(item, infos.filter((info) => (info !== null)).join(' — '));

        MenuDom.addDeleteButton(item, appTranslator.get('menu.wad.delete'), () => {
            this._onDeleteWad(meta);
        });
    }

    // --- Handlers ---

    async _onAddUrl() {
        const url = WadRegistry.normalizeUrl(this._urlInput.value);
        if (url === '') {
            this._setError(appTranslator.get('menu.wad.urlMissing'));
            return;
        }
        this._urlInput.value = url;

        this._setBusy(true);
        this._setStatus(appTranslator.get('menu.wad.downloading'));
        try {
            const wadImport = await this._registry.addFromUrl(url);
            this._urlInput.value = '';
            await this._offerImport(wadImport);
        } catch (error) {
            this._showError(error);
        }
        this._setBusy(false);
    }

    async _onAddFile(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        this._setBusy(true);
        this._setStatus(appTranslator.get('menu.wad.reading'));
        try {
            await this._offerImport(await this._registry.addFromFile(file));
        } catch (error) {
            this._showError(error);
        }
        this._fileInput.value = '';
        this._setBusy(false);
    }

    async _offerImport(wadImport) {
        if (wadImport.replaced === null) {
            await this._applyImport(wadImport);
            return;
        }
        this._clearStatus();
        this._confirm(WadListScreen._updateMessage(wadImport), async () => {
            this._setBusy(true);
            this._setStatus(appTranslator.get('menu.wad.updating', {wad: WadRegistry.displayTitle(wadImport.meta)}));
            try {
                await this._applyImport(wadImport);
            } catch (error) {
                this._showError(error);
            }
            this._setBusy(false);
        });
    }

    async _applyImport(wadImport) {
        const meta = await this._registry.applyImport(wadImport);
        const code = ((wadImport.replaced !== null) ? 'menu.wad.updated' : 'menu.wad.added');
        this._setStatus(appTranslator.get(code, {wad: WadRegistry.displayLabel(meta)}));
        await this._refresh();
    }

    static _updateMessage(wadImport) {
        const lines = [appTranslator.get('menu.wad.updateConfirm', {
            wad:  WadRegistry.displayTitle(wadImport.meta),
            from: WadRegistry.versionLabel(wadImport.replaced),
            to:   WadRegistry.versionLabel(wadImport.meta)
        })];
        if (wadImport.saves.restarted.length > 0) {
            lines.push(appTranslator.get('menu.wad.updateRestarted', {slots: WadListScreen._slotList(wadImport.saves.restarted)}));
        }
        if (wadImport.saves.removed.length > 0) {
            lines.push(appTranslator.get('menu.wad.updateRemoved', {slots: WadListScreen._slotList(wadImport.saves.removed)}));
        }

        return lines.join('\n\n');
    }

    static _slotList(saves) {
        return saves.map((save) => appTranslator.get('menu.wad.updateSlot', {n: save.meta.slot, level: save.meta.levelCode})).join(', ');
    }

    _onDeleteWad(meta) {
        this._confirm(appTranslator.get('menu.wad.deleteConfirm', {wad: WadRegistry.displayLabel(meta)}), async () => {
            try {
                await this._registry.remove(meta.id);
                this._clearStatus();
                await this._refresh();
            } catch (error) {
                this._showError(error);
            }
        });
    }

    _onSelectWad(meta) {
        this._navigator.openWadMenu(meta);
    }

    // Every label is built once: only a rebuild follows the new language.
    _cycleLanguage() {
        const definition = this._languageDefinition();
        doomSettings
            .set(definition.key, doomSettings.nextListValue(definition))
            .applyToTranslator(appTranslator);

        // The rebuild drops every highlight: hand it back to the button just
        // pressed.
        this.show();
        this._nav.focusSideButton(this._languageButton);
    }

    _languageDefinition() {
        return doomSettings.getDefinition(WadListScreen.LANGUAGE_KEY);
    }

    // --- Internal ---

    _setBusy(busy) {
        for (const button of this._formButtons) {
            button.disabled = busy;
        }
    }
}

WadListScreen.LANGUAGE_KEY = 'display.language';
