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

    // The [LEVEL] line starts with the arguments of MenuNavigator.start()
    // (wad / level / skill) so a spawn can be reproduced from a screenshot.
    setLevelInfo(wadId, levelCode, skill, levelName = null) {
        this._wadId     = wadId;
        this._levelCode = levelCode;
        this._skill     = skill;
        this._levelName = levelName;
        return this;
    }

    bindGame(game) {
        this._game = game;
        return this;
    }

    update() {
        super.update();
        if (this._user) {
            this._panel.innerText = this._buildDoomStatus() + '\n' + this._panel.innerText;
        }
    }

    _buildDoomStatus() {
        const user = this._user;
        const lines = [];

        lines.push('[LEVEL] ' + (this._wadId ?? '?') + ' / ' + (this._levelCode ?? '?')
            + ' / ' + (this._skill ?? '?')
            + ((this._levelName !== null) ? ' — ' + this._levelName : ''));

        if (this._game) {
            lines.push('[SECRETS] ' + this._game.getSecretsFound() + '/' + this._game.getSecretsTotal());
            lines.push('[KILLS] ' + this._game.getKillsCount() + '/' + this._game.getKillsTotal());
        }

        lines.push('[ARMOR] ' + Math.ceil(user.getArmor()) + '/' + user.getMaxArmor()
            + ' (' + Math.round(user.getArmorAbsorb() * 100) + '%)');

        const owned = user.getOwnedWeaponCodes();
        lines.push('[WEAPON] active=' + user.getActiveWeapon()
            + ' | owned: ' + ((owned.length > 0) ? owned.join(' ') : '-'));

        const ammo = ['bullets', 'shells', 'rockets', 'cells']
            .map((type) => type + ':' + user.getAmmo(type) + '/' + user.getAmmoMax(type));
        lines.push('[AMMO] ' + ammo.join(' '));

        const items   = user.getItemCodes();
        const effects = Object.entries(user.getEffects())
            .map(([code, ms]) => code + '(' + Math.ceil(ms / 1000) + 's)');
        lines.push('[ITEMS] ' + ((items.length > 0) ? items.join(' ') : '-')
            + ' | fx: ' + ((effects.length > 0) ? effects.join(' ') : '-'));

        return lines.join('\n');
    }
}
