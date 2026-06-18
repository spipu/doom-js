// iOS Safari leaves a residual negative document scroll after a rotation (the
// toolbar collapses and the visual viewport shifts up). That offset pushes the
// statically centered #screen (menus) down and shifts touch coordinates.
// Resetting the scroll to the top neutralizes it for every fullscreen container
// at once. Deferred passes catch iOS settling the layout a few frames later.
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
}

function loadApp()
{
    installViewportStabilizer();

    // Every Doom level builds a DoomUser (player + equipment) instead of the
    // generic engine User.
    loader.world().setUserClass(DoomUser);

    const menu = new MenuNavigator();
    menu.start();
}

appBootstrap.setReadyCallback(loadApp);
