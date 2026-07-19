/**
 * Help modal of the menus, opened by the ? button of the WAD list screen.
 * A page stack sharing one MenuListNavigation: the root lists the help topics
 * (scrolling list, same mouse/keyboard/gamepad navigation as the screens),
 * entering a topic pushes a page, and the title shows the breadcrumb of the
 * stack ("Aide > À propos"). The bottom-right button reads "Fermer" at the
 * root and "Retour" deeper; Backspace / gamepad circle follow the same back
 * path.
 */
class MenuHelpModal extends MenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._nav          = new MenuListNavigation(() => this._onBack(), () => (this._overlay === null));
        this._titleEl      = null;
        this._bodyEl       = null;
        this._actionButton = null;
        this._stack        = [];
    }

    show() {
        // The page title reuses the screens' subtitle design (uppercase,
        // left-aligned, red underline) instead of the centred modal message.
        const {modal, messageEl} = this._createShell('', 'doom-menu-modal doom-menu-modal-wide doom-menu-modal-help', 'doom-menu-subtitle');
        this._titleEl = messageEl;
        this._bodyEl  = MenuDom.addElement(modal, 'div', 'doom-menu-modal-help-body');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        this._actionButton = MenuDom.addButton(actions, 'doom-menu-button', 'Fermer', () => {
            this._onBack();
        });

        this._nav.attach();
        this._stack = [];
        this._pushPage('Aide', () => this._buildRoot());

        return this;
    }

    close() {
        this._nav.detach().clear();

        return super.close();
    }

    // --- Page stack ---

    _pushPage(title, builder) {
        this._stack.push({title: title, builder: builder});
        this._renderPage();
    }

    // "Fermer" at the root, "Retour" deeper — same path as Backspace and the
    // gamepad back button.
    _onBack() {
        if (this._stack.length <= 1) {
            this.close();
            return;
        }
        this._stack.pop();
        this._renderPage();
    }

    _renderPage() {
        this._titleEl.textContent      = this._stack.map((page) => page.title).join(' > ');
        this._actionButton.textContent = ((this._stack.length > 1) ? 'Retour' : 'Fermer');
        this._bodyEl.innerHTML         = '';
        this._nav.clear();
        this._stack[this._stack.length - 1].builder();
    }

    // --- Pages ---

    _buildRoot() {
        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        this._nav.addItemIn(list, 'Contrôles', () => this._pushPage('Contrôles', () => this._buildControls()));
        this._nav.addItemIn(list, 'À propos', () => this._pushPage('À propos', () => this._buildAbout()));
        this._nav.selectFirst();
    }

    // Next step of the help feature: list the available inputs and let the
    // player test them.
    _buildControls() {
    }

    _buildAbout() {
        const lines = [
            'Spipu-Doom convertit et fait tourner vos fichiers WAD Doom à la volée, entièrement dans le navigateur : rendu WebGL, physique FPS, éléments mouvants et armes fidèles au jeu original.',
            'Développé par Spipu (Laurent Minguet).',
            'Licence MIT — à l\'exception des graphismes de decals d\'impact, repris d\'UZDoom sous licence GPL v3.',
            'Aucun fichier WAD n\'est fourni. Utilisez un WAD libre comme Freedoom, ou vos propres fichiers dont vous détenez les droits — Doom et ses données de jeu restent la propriété de leurs ayants droit.',
            '© 2024-' + new Date().getFullYear() + ' Spipu.'
        ];
        for (const line of lines) {
            MenuDom.addText(this._bodyEl, 'doom-menu-about-line', line);
        }
    }
}
