/**
 * iOS Safari leaves a residual negative document scroll after a rotation (the
 * toolbar collapses and the visual viewport shifts up). That offset pushes the
 * statically centered #screen (menus) down and shifts touch coordinates.
 * Resetting the scroll to the top neutralizes it for every fullscreen container
 * at once. Deferred passes catch iOS settling the layout a few frames later.
 */
function stabilizeViewport()
{
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            window.scrollTo(0, 0);
        });
    });
    setTimeout(() => {
        window.scrollTo(0, 0);
    }, 250);
}

function installViewportStabilizer()
{
    window.addEventListener('orientationchange', stabilizeViewport);
    window.addEventListener('resize', stabilizeViewport);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', stabilizeViewport);
    }
    // A rotation during the loading screen happens before the listeners exist:
    // purge the offset it may have left.
    stabilizeViewport();
}

function loadApp()
{
    installViewportStabilizer();

    // Texts first: English is both the default UI language and the fallback of
    // a missing translation, so a hole never shows French to a foreign visitor.
    // The saved language lands once the settings are read from the database
    // (MenuNavigator._boot).
    appTranslator.addCatalog(DoomTranslations.CATALOG)
        .setFallbackLanguage('en')
        .setLanguage('en');

    // Decode the impact-decal graphics once (level-independent); ready well
    // before the first level is built.
    doomDecalTextures.load();

    // Same for the games' finale texts, merged into the catalog above.
    doomFinaleTexts.load();

    // Every Doom level builds a DoomUser (player + equipment) instead of the
    // generic engine User.
    loader.world().setUserClass(DoomUser);

    const menu = new MenuNavigator();
    menu.start();
}

appBootstrap.setReadyCallback(loadApp);
