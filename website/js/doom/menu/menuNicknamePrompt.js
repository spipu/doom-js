/**
 * Entering any multiplayer flow needs a nickname: with none stored, a
 * dedicated text entry asks for it first and stores it, then the flow goes
 * on; cancelling it abandons the flow.
 */
class MenuNicknamePrompt {
    /**
     * @param {MenuDisplay}      display
     * @param {function(string)} onReady - receives the nickname
     */
    static ensure(display, onReady) {
        const nickname = doomSettings.getMultiplayerNickname();
        if (nickname !== '') {
            onReady(nickname);
            return;
        }
        const definition = doomSettings.getDefinition(MenuNicknamePrompt.SETTING_KEY);
        new MenuTextEntryModal(display).open(appTranslator.get('multiplayer.nickname.prompt'), definition, '', (value) => {
            doomSettings.set(MenuNicknamePrompt.SETTING_KEY, value);
            onReady(value);
        });
    }
}

MenuNicknamePrompt.SETTING_KEY = 'multiplayer.nickname';
