class Face {
    constructor(pt0, pt1, pt2, color, textureId, map, alpha, clampV, passableUser, passableEnemy, animTextures, uvScroll, lightGroup, uvAnchor) {
        this.pts           = [pt0, pt1, pt2];
        this.color         = color;
        this.textureId     = textureId;
        this.map           = map;
        this.alpha         = alpha;
        this.isAlpha       = false;
        this.clampV        = clampV;
        this.passableUser  = passableUser;
        this.passableEnemy = passableEnemy;
        this.collisionOnly = false;
        this.passableShot  = false;
        this.noDecal       = false;
        this.animTextures  = animTextures;
        this.uvScroll      = uvScroll;
        // {code, v, instance}: V shifted by the vertical shift of the instance
        // `code` times v (instance resolved lazily by the renderers)
        this.uvAnchor      = uvAnchor;
        this.lightGroup    = lightGroup;
        this.normal        = [0, 0, 0];
    }
}
