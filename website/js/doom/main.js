function loadApp()
{
    const game = new DoomGame();
    game.start();
}

appBootstrap.setReadyCallback(loadApp);
