class Switch407Interaction extends SwitchInteraction {
    constructor() {
        super('switch_407');
        this.setModeOnce();
    }
    _triggerOn(instance) {
        const obj = instance.getObject();
        obj.faceList.forEach(fc => { fc.textureId = obj.getTextureId(2); });
    }
    _triggerOff(instance) {
        const obj = instance.getObject();
        obj.faceList.forEach(fc => { fc.textureId = obj.getTextureId(1); });
    }
}
loader.interactions().register(new Switch407Interaction());
