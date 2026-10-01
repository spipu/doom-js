/**
 * The pairing of one sub, over the menus: the code this device shows as a QR
 * code, the camera reading the other side's code, each with its caption, and
 * a cancel button. The session runs the flow; this modal is its view, and
 * turns every failure into an explicit message.
 */
class MenuPairingModal extends MenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._view = null;
    }

    // The main invites one more sub: its code shown, the sub's answer read.
    openForMain(session) {
        return this._open(appTranslator.get('multiplayer.lobby.add'), {
            show: appTranslator.get('multiplayer.pairing.showToSub'),
            read: appTranslator.get('multiplayer.pairing.readSub')
        }, false, session, (view) => session.addPlayer(view), () => {});
    }

    /**
     * A sub answers the main: its code read, then the answer shown, one at a time.
     *
     * @param {DoomNetSubSession} session
     * @param {function}          onPaired - once the link to the main is open
     * @param {function}          onFailed - the pairing was cancelled or failed: the session is over
     */
    openForSub(session, onPaired, onFailed) {
        return this._open(appTranslator.get('multiplayer.join'), {
            show: appTranslator.get('multiplayer.pairing.showToMain'),
            read: appTranslator.get('multiplayer.pairing.readMain')
        }, true, session, (view) => session.join(view), onPaired, onFailed);
    }

    /**
     * @param {string}                       title
     * @param {{show: string, read: string}} captions   - under the code shown, under the camera while it reads
     * @param {boolean}                      sequential - reads first, then shows: one frame at a time
     * @param {object}                       session    - its cancelPairing() and getCodeChannel()
     * @param {function(object): Promise}    pair       - runs the session's flow through the view
     * @param {function}                     onPaired
     * @param {function}                     onFailed
     */
    _open(title, captions, sequential, session, pair, onPaired, onFailed = () => {}) {
        const {modal}  = this._createShell(title, 'doom-menu-modal doom-menu-modal-wide doom-menu-modal-pairing', 'doom-menu-subtitle');
        const stage    = MenuDom.addElement(modal, 'div', 'doom-menu-pairing-stage'
            + ((sequential) ? ' doom-menu-pairing-stage-sequential' : ''));
        const elements = {
            qr:            MenuPairingModal._tile(stage, 'div', 'doom-menu-pairing-qr'),
            camera:        MenuPairingModal._tile(stage, 'video', 'doom-menu-pairing-camera'),
            qrCaption:     null,
            cameraCaption: null
        };
        elements.qrCaption     = MenuDom.addElement(elements.qr.parentElement, 'div', 'doom-menu-pairing-caption');
        elements.cameraCaption = MenuDom.addElement(elements.camera.parentElement, 'div', 'doom-menu-pairing-caption');
        elements.camera.muted       = true;
        elements.camera.playsInline = true;

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        const button  = MenuDom.addButton(actions, 'doom-menu-button', appTranslator.get('menu.cancel'), () => session.cancelPairing());
        this._attachButtonsNav([button], button, 0);

        this._view = new QrPairingView(new QrScanner(), elements, captions, session.getCodeChannel())
            .setSequential(sequential)
            .enableZoom();
        this._run(pair, onPaired, onFailed);

        return this;
    }

    // A cancel simply closes the modal; any other failure explains itself.
    async _run(pair, onPaired, onFailed) {
        try {
            await QrModule.prepare(appBootstrap.buildUrl(MenuPairingModal.WASM_URL));
            await pair(this._view);
        } catch (error) {
            this.close();
            onFailed();
            this._fail(error);
            return;
        }
        this.close();
        onPaired();
    }

    _fail(error) {
        if ((error instanceof NetError) && (error.getCode() === NetError.CANCELLED)) {
            return;
        }
        const code = MenuPairingModal._errorCode(error);
        // A refusal the player can act on (another WAD, another version) is no bug.
        if (code === MenuPairingModal.ERROR_DEFAULT) {
            console.error(error);
        }
        doomSound.playUi('menu/invalid');
        new MenuModal(this._display).info(appTranslator.get(code));
    }

    static _errorCode(error) {
        if (error instanceof NetError) {
            return (MenuPairingModal.ERROR_CODES[error.getCode()] ?? MenuPairingModal.ERROR_DEFAULT);
        }
        if ((error instanceof DOMException) && MenuPairingModal.CAMERA_ERRORS.includes(error.name)) {
            return 'multiplayer.error.camera';
        }

        return MenuPairingModal.ERROR_DEFAULT;
    }

    // The element of a tile of the stage, its caption added under it by the caller.
    static _tile(stage, tagName, className) {
        const tile = MenuDom.addElement(stage, 'div', 'doom-menu-pairing-tile');

        return MenuDom.addElement(tile, tagName, 'doom-menu-pairing-frame ' + className);
    }
}

MenuPairingModal.WASM_URL      = '/js/lib/zxing-wasm/zxing_full.wasm';
MenuPairingModal.ERROR_DEFAULT = 'multiplayer.error.pairing';
MenuPairingModal.ERROR_CODES   = {
    [NetError.VERSION_MISMATCH]:  'multiplayer.error.version',
    [DoomNetInvite.WAD_MISMATCH]: 'multiplayer.error.wad',
    [NetError.INVITE_USED]:       'multiplayer.error.invite',
    [NetError.UNKNOWN_INVITE]:    'multiplayer.error.invite',
    [NetError.LINK_LOST]:         'multiplayer.error.linkLost'
};
// The camera refused, missing or busy (getUserMedia).
MenuPairingModal.CAMERA_ERRORS = ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError'];
