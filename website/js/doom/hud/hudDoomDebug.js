/**
 * Doom debug HUD view: extends HudDebug (fps / position / inputs / energy) and
 * appends the player's Doom equipment — armor, weapons, ammo, items, timed
 * effects — plus the running level identity and secret count. It reads the bound
 * DoomUser directly (no need for the definitions catalog).
 */
class HudDoomDebug extends HudDebug {
    constructor(engine) {
        super(engine);
        this._wadId     = null;
        this._levelCode = null;
        this._skill     = null;
        this._levelName = null;
        this._game      = null;
    }

    // The WAD id and level code are not player state — they belong to the
    // running level (DoomGame owns them) and are pushed in here only for display.
    // The [LEVEL] line is rendered in the exact form expected by
    // MenuNavigator.start(wadName, levelCode, ...) so a spawn can be reproduced
    // straight from a screenshot; the optional readable name (UMAPINFO
    // levelname) is appended AFTER those three fields.
    setLevelInfo(wadId, levelCode, skill, levelName = null) {
        this._wadId     = wadId;
        this._levelCode = levelCode;
        this._skill     = skill;
        this._levelName = levelName;
        return this;
    }

    // Live level stats (secrets found/total) are read off the game each frame
    bindGame(game) {
        this._game = game;
        return this;
    }

    update() {
        super.update();
        if (this._user) {
            this._el.innerText = this._buildEquipment() + '\n' + this._el.innerText;
        }
    }

    _buildEquipment() {
        const u = this._user;
        const lines = [];

        lines.push('[LEVEL] ' + (this._wadId ?? '?') + ' / ' + (this._levelCode ?? '?')
            + ' / ' + (this._skill ?? '?')
            + ((this._levelName !== null) ? ' — ' + this._levelName : ''));

        if (this._game) {
            lines.push('[SECRETS] ' + this._game.getSecretsFound() + '/' + this._game.getSecretsTotal());
            lines.push('[KILLS] ' + this._game.getKillsCount() + '/' + this._game.getKillsTotal());
        }

        lines.push('[ARMOR] ' + Math.ceil(u.getArmor()) + '/' + u.getMaxArmor()
            + ' (' + Math.round(u.getArmorAbsorb() * 100) + '%)');

        const owned = u.getOwnedWeaponCodes();
        lines.push('[WEAPON] active=' + u.getActiveWeapon()
            + ' | owned: ' + ((owned.length > 0) ? owned.join(' ') : '-'));

        const ammo = ['bullets', 'shells', 'rockets', 'cells']
            .map((type) => type + ':' + u.getAmmo(type) + '/' + u.getAmmoMax(type));
        lines.push('[AMMO] ' + ammo.join(' '));

        const items   = u.getItemCodes();
        const effects = Object.entries(u.getEffects())
            .map(([code, ms]) => code + '(' + Math.ceil(ms / 1000) + 's)');
        lines.push('[ITEMS] ' + ((items.length > 0) ? items.join(' ') : '-')
            + ' | fx: ' + ((effects.length > 0) ? effects.join(' ') : '-'));

        return lines.join('\n');
    }
}
