function loadApp()
{
    const menu = new MenuNavigator();
    menu.start();
}

appBootstrap.setReadyCallback(loadApp);
