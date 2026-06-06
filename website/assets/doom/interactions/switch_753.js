class Switch753Interaction extends SwitchInteraction {
    constructor() {
        super('switch_753');
        this.setModeOnce();
    }
    _triggerOn(instance) {
        const obj = instance.getObject();
        obj.faceList.forEach(fc => { fc.textureId = obj.getTextureId(2); });
        loader.instances().getByCode('lift_129').start();
        loader.instances().getByCode('lift_76').start();
        loader.instances().getByCode('lift_126').start();
    }
    _triggerOff(instance) {
        const obj = instance.getObject();
        obj.faceList.forEach(fc => { fc.textureId = obj.getTextureId(1); });
    }
}
loader.interactions().register(new Switch753Interaction());
