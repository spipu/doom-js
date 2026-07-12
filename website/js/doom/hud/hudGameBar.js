/**
 * Modern graphical Doom game HUD (custom, drawn by us — no WAD lumps). A DOM/CSS
 * overlay laid out in the four screen corners over the letterboxed display:
 *   - bottom-left : health bar + armor bar (+ numeric values)
 *   - bottom-right: current weapon ammo (cur/max of its ammo type, '—' if none)
 *   - top-left    : the three coloured keys (lit when owned)
 *   - top-right   : the ARMS panel (weapon slots 1-7) + active weapon name
 *
 * It shows the same information as the classic Doom status bar, minus the face.
 * Values are read from the bound DoomUser; the active weapon's ammo type and
 * name come from the DoomGame weapon catalog. Sizes scale with the rendered
 * display height (engine.scrHeight), like HudDebug.
 */
class HudGameBar extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._game    = null;
        this._root    = null;
        this._els     = {};
        this._keyEls  = {};
        this._armsEls = {};
    }

    // Doom canonical weapon slots; the ARMS panel shows slots 1..7 (slot 1 is
    // the fist, always owned, upgraded-look when the chainsaw is owned).
    static get SLOT_BY_WEAPON() {
        return {
            fist: 1, chainsaw: 1, pistol: 2, shotgun: 3, supershotgun: 3,
            chaingun: 4, rocket: 5, plasma: 6, bfg: 7
        };
    }

    static get KEY_COLORS() {
        return { blueKey: '#3d7bff', yellowKey: '#ffd23d', redKey: '#ff4444' };
    }

    bindGame(game) {
        this._game = game;
        return this;
    }

    init(container) {
        super.init(container);

        this._root = this._createEl('div', {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', color: '#fff'
        });
        container.appendChild(this._root);

        this._buildHealthArmor();
        this._buildAmmo();
        this._buildKeys();
        this._buildArms();
    }

    setVisible(visible) {
        if (this._root !== null) {
            this._root.style.display = ((visible) ? 'block' : 'none');
        }
    }

    update() {
        if ((this._user === null) || (this._root === null)) {
            return;
        }
        this._applyScale();

        const u = this._user;

        // Health — green bar + value
        const energy    = u.getEnergy();
        const maxEnergy = u.getMaxEnergy();
        this._els.healthFill.style.width = this._ratioPct(energy, maxEnergy);
        this._els.healthValue.innerText  = Math.ceil(energy);

        // Armor — value + bar coloured by the armour tier (green ⅓, blue ½)
        const armor    = u.getArmor();
        const maxArmor = u.getMaxArmor();
        const armorColor = ((u.getArmorAbsorb() >= 0.5) ? '#4d9fff' : '#5dd35d');
        this._els.armorFill.style.width           = this._ratioPct(armor, maxArmor);
        this._els.armorFill.style.backgroundColor = armorColor;
        this._els.armorValue.innerText            = Math.ceil(armor);

        this._updateAmmo(u);
        this._updateArms(u);
        this._updateKeys(u);

        if (this._game !== null) {
            this._els.secretsValue.innerText = this._game.getSecretsFound() + '/' + this._game.getSecretsTotal();
        }
    }

    _updateAmmo(u) {
        const code   = u.getActiveWeapon();
        const weapon = ((this._game !== null) ? this._game.getWeapon(code) : null);
        const type   = ((weapon !== null) ? weapon.getAmmoType() : null);
        this._els.ammoValue.innerText = ((type === null) ? '—' : u.getAmmo(type) + '/' + u.getAmmoMax(type));
    }

    _updateArms(u) {
        const slotByWeapon = HudGameBar.SLOT_BY_WEAPON;
        const code         = u.getActiveWeapon();
        const activeSlot   = (slotByWeapon[code] ?? null);

        const ownedCodes = new Set(u.getOwnedWeaponCodes());
        const ownedSlots = new Set();
        for (const owned of ownedCodes) {
            const slot = slotByWeapon[owned];
            if (slot !== undefined) {
                ownedSlots.add(slot);
            }
        }

        for (let slot = 1; slot <= 7; slot++) {
            const el       = this._armsEls[slot];
            const isActive = (slot === activeSlot);
            // Slot 1 (the fist) is always owned, so its cell is always lit.
            const isOwned  = ((slot === 1) ? true : ownedSlots.has(slot));
            el.style.color      = ((isActive) ? '#111' : ((isOwned) ? '#fff' : '#555'));
            el.style.background = ((isActive) ? '#ffcc00' : 'transparent');
            // Slot 1 gets a green accent border when the chainsaw is owned, to
            // signal the upgrade over the bare fist (name shows it when active).
            if (slot === 1) {
                el.style.borderColor = ((!isActive && ownedCodes.has('chainsaw')) ? '#5dd35d' : 'rgba(255, 255, 255, 0.25)');
            }
        }

        const weapon = ((this._game !== null) ? this._game.getWeapon(code) : null);
        this._els.weaponName.innerText = ((weapon !== null) ? weapon.getName() : '—');
    }

    _updateKeys(u) {
        const keyColors = HudGameBar.KEY_COLORS;
        const owned     = new Set(u.getItemCodes());
        for (const key of Object.keys(keyColors)) {
            const el  = this._keyEls[key];
            const lit = owned.has(key);
            el.style.backgroundColor = ((lit) ? keyColors[key] : 'transparent');
            el.style.opacity         = ((lit) ? '1' : '0.25');
        }
    }

    // --- Build ---

    _buildHealthArmor() {
        const block = this._createEl('div', this._cornerStyle({ bottom: '1em', left: '1em' }));

        const health = this._buildBarRow('HP', '#5dd35d');
        this._els.healthFill  = health.fill;
        this._els.healthValue = health.value;
        block.appendChild(health.row);

        const armor = this._buildBarRow('AR', '#5dd35d');
        this._els.armorFill  = armor.fill;
        this._els.armorValue = armor.value;
        block.appendChild(armor.row);

        this._root.appendChild(block);
    }

    _buildBarRow(label, color) {
        const row = this._createEl('div', {
            display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.25em'
        });

        const labelEl = this._createEl('div', {
            width: '1.6em', fontSize: '0.8em', fontWeight: '700', color: '#ccc'
        });
        labelEl.innerText = label;

        const track = this._createEl('div', {
            width: '8em', height: '0.9em', borderRadius: '0.45em',
            backgroundColor: 'rgba(0, 0, 0, 0.55)', overflow: 'hidden'
        });
        const fill = this._createEl('div', {
            width: '0%', height: '100%', borderRadius: '0.45em', backgroundColor: color
        });
        track.appendChild(fill);

        const value = this._createEl('div', {
            minWidth: '2.2em', fontSize: '1.1em', fontWeight: '700', textAlign: 'right'
        });

        row.appendChild(labelEl);
        row.appendChild(track);
        row.appendChild(value);

        return { row, fill, value };
    }

    _buildAmmo() {
        const block = this._createEl('div', this._cornerStyle({ bottom: '1em', right: '1em' }));
        block.style.textAlign = 'right';

        const label = this._createEl('div', { fontSize: '0.7em', fontWeight: '700', color: '#ccc', letterSpacing: '0.15em' });
        label.innerText = 'AMMO';

        this._els.ammoValue = this._createEl('div', { fontSize: '1.6em', fontWeight: '800', lineHeight: '1' });
        this._els.ammoValue.innerText = '—';

        block.appendChild(label);
        block.appendChild(this._els.ammoValue);
        this._root.appendChild(block);
    }

    _buildKeys() {
        const block = this._createEl('div', this._cornerStyle({ top: '1em', left: '1em' }));

        const keysRow = this._createEl('div', { display: 'flex', gap: '0.4em' });
        for (const key of Object.keys(HudGameBar.KEY_COLORS)) {
            const pip = this._createEl('div', {
                width: '1em', height: '1em', borderRadius: '50%',
                border: '0.12em solid rgba(255, 255, 255, 0.5)', opacity: '0.25'
            });
            this._keyEls[key] = pip;
            keysRow.appendChild(pip);
        }
        block.appendChild(keysRow);

        const secrets = this._createEl('div', {
            display: 'flex', alignItems: 'center', gap: '0.35em',
            marginTop: '0.5em', fontSize: '0.9em', fontWeight: '700'
        });
        const icon = this._createEl('div', { color: '#ffd23d', lineHeight: '1' });
        icon.innerText = '★';
        this._els.secretsValue = this._createEl('div', { color: '#eee' });
        this._els.secretsValue.innerText = '0/0';
        secrets.appendChild(icon);
        secrets.appendChild(this._els.secretsValue);
        block.appendChild(secrets);

        this._root.appendChild(block);
    }

    _buildArms() {
        const block = this._createEl('div', this._cornerStyle({ top: '1em', right: '1em' }));
        block.style.textAlign = 'right';

        const panel = this._createEl('div', { display: 'flex', gap: '0.3em', justifyContent: 'flex-end' });
        for (let slot = 1; slot <= 7; slot++) {
            const el = this._createEl('div', {
                width: '1.3em', height: '1.3em', borderRadius: '0.2em',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.95em', fontWeight: '700', color: '#555',
                border: '0.1em solid rgba(255, 255, 255, 0.25)'
            });
            el.innerText = slot;
            this._armsEls[slot] = el;
            panel.appendChild(el);
        }

        this._els.weaponName = this._createEl('div', { fontSize: '0.85em', fontWeight: '700', color: '#eee', marginTop: '0.3em' });
        this._els.weaponName.innerText = '—';

        block.appendChild(panel);
        block.appendChild(this._els.weaponName);
        this._root.appendChild(block);
    }

    // --- Helpers ---

    // Scale the root font size to the rendered display height so every em-based
    // measure stays proportional in letterbox (same idea as HudDebug).
    _applyScale() {
        if (!this._engine || !this._engine.scrHeight) {
            return;
        }
        const fontPx = Math.max(12, Math.min(30, Math.round(this._engine.scrHeight * 0.03)));
        this._root.style.fontSize = fontPx + 'px';
    }

    _cornerStyle(anchors) {
        const style = {
            position: 'absolute',
            padding: '0.6em 0.8em',
            borderRadius: '0.5em',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
        };
        return Object.assign(style, anchors);
    }

    _ratioPct(value, max) {
        const ratio = ((max > 0) ? (value / max) : 0);
        return (Math.max(0, Math.min(1, ratio)) * 100) + '%';
    }

    _createEl(tag, style) {
        const el = document.createElement(tag);
        Object.assign(el.style, style);
        return el;
    }
}
