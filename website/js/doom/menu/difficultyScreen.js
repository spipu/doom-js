/**
 * Screen between the WAD list and the level list: pick the skill (difficulty).
 * The chosen skill is handed to the converter, which filters the THINGS lump
 * exactly like the real game (skill bits + the multiplayer-only flag), so a
 * single-player session shows the same things as vanilla Doom.
 */
class DifficultyScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        super(navigator, display);

        this._wadMeta = null;

        // Canonical Doom skill names; skill 1..5 maps to the thing flag bits in
        // the converter (1-2 → 0x01, 3 → 0x02, 4-5 → 0x04).
        this._skills = [
            {skill: 1, name: "I'm too young to die"},
            {skill: 2, name: 'Hey, not too rough'},
            {skill: 3, name: 'Hurt me plenty'},
            {skill: 4, name: 'Ultra-Violence'},
            {skill: 5, name: 'Nightmare!'}
        ];
    }

    /**
     * @param {object} meta
     */
    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {panel, listEl} = this._buildWadPanel(this._wadMeta.name, 'Difficulté');

        for (const entry of this._skills) {
            const item = this._addListItem(listEl, entry.name, () => {
                this._onSelectSkill(entry.skill);
            });

            this._addListItemInfos(item, 'Niveau ' + entry.skill);
        }

        this._addBackButton(panel);

        this._selectCurrentSkill();
    }

    _onBack() {
        this._navigator.showWadList();
    }

    _onSelectSkill(skill) {
        this._navigator.openLevels(this._wadMeta, skill);
    }

    // Preselect the difficulty already chosen for this session (default 3).
    _selectCurrentSkill() {
        const current = this._navigator.getSelectedDifficulty();
        const index   = this._skills.findIndex((entry) => (entry.skill === current));

        this._nav.selectIndex(((index >= 0) ? index : 0));
    }
}
