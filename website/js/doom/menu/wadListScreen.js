/**
 * Screen 1: list of the stored WAD files, with add (url or local file) and delete.
 */
class WadListScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     * @param {WadRegistry}   registry
     */
    constructor(navigator, display, registry) {
        super(navigator, display);

        this._registry  = registry;
        this._listEl    = null;
        this._urlInput  = null;
        this._fileInput = null;
        this._buttons   = [];
    }

    _build() {
        this._listEl    = null;
        this._urlInput  = null;
        this._fileInput = null;
        this._buttons   = [];

        this._addTitle('Spipu-Doom');

        const panel = this._addElement('div', 'doom-menu-panel');

        const subTitle = this._addElement('div', 'doom-menu-subtitle', panel);
        subTitle.textContent = 'Fichiers WAD';

        this._listEl = this._addList(panel);

        this._buildAddForm(panel);

        this._statusEl = this._addElement('div', 'doom-menu-status', panel);

        this._refresh();
    }

    // --- Build ---

    _buildAddForm(panel) {
        const form = this._addElement('div', 'doom-menu-form', panel);

        this._urlInput = this._addElement('input', 'doom-menu-input', form);
        this._urlInput.type = 'text';
        this._urlInput.placeholder = 'https://exemple.com/fichier.wad';

        this._buttons.push(this._addButton('Ajouter par URL', () => {
            this._onAddUrl();
        }, form));

        this._fileInput = this._addElement('input', 'doom-menu-file-input', form);
        this._fileInput.type = 'file';
        this._fileInput.accept = '.wad';
        this._fileInput.addEventListener('change', (event) => {
            this._onAddFile(event);
        });

        this._buttons.push(this._addButton('Fichier local', () => {
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

        this._listEl.innerHTML = '';

        if (list.length === 0) {
            const empty = this._addElement('div', 'doom-menu-empty', this._listEl);
            empty.textContent = 'Aucun WAD — ajoutez-en un ci-dessous';
            return;
        }

        for (const meta of list) {
            this._buildItem(meta);
        }
    }

    _buildItem(meta) {
        const item = this._addElement('div', 'doom-menu-item', this._listEl);
        item.addEventListener('click', () => {
            this._onSelectWad(meta);
        });

        const label = this._addElement('div', 'doom-menu-item-label', item);
        label.textContent = meta.name;

        const infos = this._addElement('div', 'doom-menu-item-infos', item);
        infos.textContent = this._formatSize(meta.size) + ' — ' + this._formatDate(meta.addedAt);

        const deleteButton = this._addElement('button', 'doom-menu-item-delete', item);
        deleteButton.type = 'button';
        deleteButton.textContent = '✕';
        deleteButton.title = 'Supprimer';
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this._onDeleteWad(meta);
        });
    }

    // --- Handlers ---

    async _onAddUrl() {
        const url = this._urlInput.value.trim();
        if (url === '') {
            this._setError('Saisissez une URL');
            return;
        }

        this._setBusy(true);
        this._setStatus('Téléchargement...');
        try {
            const meta = await this._registry.addFromUrl(url);
            this._urlInput.value = '';
            this._setStatus(meta.name + ' ajouté');
            await this._refresh();
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
        this._setStatus('Lecture du fichier...');
        try {
            const meta = await this._registry.addFromFile(file);
            this._setStatus(meta.name + ' ajouté');
            await this._refresh();
        } catch (error) {
            this._showError(error);
        }
        this._fileInput.value = '';
        this._setBusy(false);
    }

    _onDeleteWad(meta) {
        this._confirm('Supprimer ' + meta.name + ' ?', async () => {
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
        this._navigator.openWad(meta);
    }

    // --- Internal ---

    _setBusy(busy) {
        for (const button of this._buttons) {
            button.disabled = busy;
        }
    }
}
