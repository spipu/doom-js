const col_metal = [200, 200, 200];
const col_roue  = [50, 50, 50];
const col_vitre = [50, 50, 250];

const p = 3.;
const ps = p+0.2;

objectRegistry['tuture'] = new Object3d('tuture')
     // face gauche
    .ptAdd( 8, 1, -p) //1
    .ptAdd( 8, 3, -p) //2
    .ptAdd( 5, 4, -p) //3
    .ptAdd( 3, 7, -p) //4
    .ptAdd(-5, 7, -p) //5
    .ptAdd(-7, 4, -p) //6
    .ptAdd(-7, 1, -p) //7
    .ptAdd( 0, 1, -p) //8
    .fcAdd(1, 3, 2, col_metal)
    .fcAdd(1, 8, 3, col_metal)
    .fcAdd(8, 4, 3, col_metal)
    .fcAdd(8, 5, 4, col_metal)
    .fcAdd(8, 6, 5, col_metal)
    .fcAdd(8, 7, 6, col_metal)
    
     // roue avant gauche
    .ptAdd( 6, 0, -ps)
    .ptAdd( 4, 0, -ps)
    .ptAdd( 4, 2, -ps)
    .ptAdd( 6, 2, -ps)
    .fcAdd(9, 10, 11, col_roue)
    .fcAdd(9, 11, 12, col_roue)
    .fcAdd(9, 11, 10, col_roue)
    .fcAdd(9, 12, 11, col_roue)
    
     // roue arriere gauche
    .ptAdd(-3, 0, -ps)
    .ptAdd(-5, 0, -ps)
    .ptAdd(-5, 2, -ps)
    .ptAdd(-3, 2, -ps)
    .fcAdd(13, 14, 15, col_roue)
    .fcAdd(13, 15, 16, col_roue)
    .fcAdd(13, 15, 14, col_roue)
    .fcAdd(13, 16, 15, col_roue)

     // vitre gauche
    .ptAdd( 3, 4, -ps)
    .ptAdd( 0, 4, -ps)
    .ptAdd( 0, 6, -ps)
    .ptAdd( 2, 6, -ps)
    .fcAdd(17, 18, 19, col_vitre)
    .fcAdd(17, 19, 20, col_vitre)
    
     // face droite
    .ptAdd( 8, 1, p)
    .ptAdd( 8, 3, p)
    .ptAdd( 5, 4, p)
    .ptAdd( 3, 7, p)
    .ptAdd(-5, 7, p)
    .ptAdd(-7, 4, p)
    .ptAdd(-7, 1, p)
    .ptAdd( 0, 1, p)
    .fcAdd(21, 22, 23, col_metal)
    .fcAdd(21, 23, 28, col_metal)
    .fcAdd(28, 23, 24, col_metal)
    .fcAdd(28, 24, 25, col_metal)
    .fcAdd(28, 25, 26, col_metal)
    .fcAdd(28, 26, 27, col_metal)

    // roue avant droite
    .ptAdd( 6, 0, ps)
    .ptAdd( 4, 0, ps)
    .ptAdd( 4, 2, ps)
    .ptAdd( 6, 2, ps)
    .fcAdd(29, 31, 30, col_roue)
    .fcAdd(29, 32, 31, col_roue)
    .fcAdd(29, 30, 31, col_roue)
    .fcAdd(29, 31, 32, col_roue)

    // roue arriere droite
    .ptAdd(-3, 0, ps)
    .ptAdd(-5, 0, ps)
    .ptAdd(-5, 2, ps)
    .ptAdd(-3, 2, ps)
    .fcAdd(33, 35, 34, col_roue)
    .fcAdd(33, 36, 35, col_roue)
    .fcAdd(33, 34, 35, col_roue)
    .fcAdd(33, 35, 36, col_roue)

    // vitre droite
    .ptAdd( 3, 4, ps)
    .ptAdd( 0, 4, ps)
    .ptAdd( 0, 6, ps)
    .ptAdd( 2, 6, ps)
    .fcAdd(37, 39, 38, col_vitre)
    .fcAdd(37, 40, 39, col_vitre)
    
    // tour
    .fcAdd(1, 2, 22, col_metal)
    .fcAdd(2, 3, 23, col_metal)
    .fcAdd(3, 4, 24, col_vitre)
    .fcAdd(4, 5, 25, col_metal)
    .fcAdd(5, 6, 26, col_vitre)
    .fcAdd(6, 7, 27, col_metal)
    .fcAdd(7, 8, 28, col_metal)
    .fcAdd(8, 1, 21, col_metal)
    .fcAdd(1, 22, 21, col_metal)
    .fcAdd(2, 23, 22, col_metal)
    .fcAdd(3, 24, 23, col_vitre)
    .fcAdd(4, 25, 24, col_metal)
    .fcAdd(5, 26, 25, col_vitre)
    .fcAdd(6, 27, 26, col_metal)
    .fcAdd(7, 28, 27, col_metal)
    .fcAdd(8, 21, 28, col_metal)

    .ready();