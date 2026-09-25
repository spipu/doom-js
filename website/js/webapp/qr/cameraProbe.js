/**
 * Camera availability without asking for any permission: enumerateDevices lists the
 * device kinds before any grant. It only settles once the page is visible: never block a
 * start-up on it.
 */
class CameraProbe {
    /**
     * @returns {Promise<boolean>}
     */
    static async isAvailable() {
        if ((navigator.mediaDevices === undefined) || (navigator.mediaDevices.enumerateDevices === undefined)) {
            return false;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
    }
}
