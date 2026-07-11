class Face {
    constructor(pt0, pt1, pt2, color, textureId, map, alpha, clampV, passableUser, passableEnemy, animTextures, uvScroll) {
        this.pts          = [pt0, pt1, pt2];
        this.color        = color;
        this.textureId    = textureId;
        this.map          = map;
        this.alpha        = alpha;
        this.isAlpha      = false;
        this.clampV       = clampV;
        this.passableUser = passableUser;
        this.passableEnemy = passableEnemy;
        this.animTextures = animTextures;
        this.uvScroll     = uvScroll;
        this.normal       = [0, 0, 0];
    }
}
