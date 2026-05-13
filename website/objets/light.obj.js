var light = new Objet('light')
    .ptAdd( 0,0,-0.5)
    .ptAdd( 1,1, 0)
    .ptAdd(-1,1, 0)

    .fcAdd(1, 2, 3, [250, 250, 250])
    
    .ready();