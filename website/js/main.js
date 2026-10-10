/**
 * iOS Safari leaves a residual negative scroll after a rotation, which shifts
 * the centered #screen and the touch coordinates. The deferred passes catch iOS
 * settling the layout a few frames later.
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
    // A rotation during the loading screen happened before the listeners existed.
    stabilizeViewport();
}

function loadApp()
{
    installViewportStabilizer();

    // The saved language is applied once the settings are read (MenuNavigator._boot).
    appTranslator.addCatalog(DoomTranslations.CATALOG)
        .setFallbackLanguage('en')
        .setLanguage('en');

    doomImageAssets.load();
    doomFinaleTexts.load();
    doomLevelPatches.load();

    loader.world().setUserClass(DoomUser);

    const menu = new MenuNavigator();
    menu.start();
}

appBootstrap.setReadyCallback(loadApp);
