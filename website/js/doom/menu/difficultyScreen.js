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

        // Skill 1..5 maps to the thing flag bits in the converter (1-2 → 0x01,
        // 3 → 0x02, 4-5 → 0x04). Skill 0 is our own exploration mode: the
        // skill-1 world with monsters disabled. The displayed names are a
        // generic scale served by the translator ('difficulty.<skill>'), not the
        // vanilla titles ("I'm too young to die" … "Nightmare!").
        this._skills = [0, 1, 2, 3, 4, 5];
    }

    /**
     * @param {object} meta
     */
    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {panel, listEl} = this._buildWadPanel(this._wadMeta.name, appTranslator.get('menu.difficulty.title'));

        for (const skill of this._skills) {
            const item = this._addListItem(listEl, appTranslator.get('difficulty.' + skill), () => {
                this._onSelectSkill(skill);
            });

            this._addListItemInfos(item, appTranslator.get('menu.difficulty.skill', {skill: skill}));
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
        const index   = this._skills.indexOf(current);

        this._nav.selectIndex(((index >= 0) ? index : 0));
    }
}
