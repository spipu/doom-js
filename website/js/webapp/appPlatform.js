/**
 * What the page knows of the device it runs on: its mobile system, and whether the application was started from
 * the home screen (installed mode). Read from the browser only, without any network call.
 */
class AppPlatform {
    /**
     * Since iPadOS 13, Safari on an iPad tells it is a desktop Mac: a "Macintosh" with a touch screen is an iPad.
     *
     * @returns {string|null} AppPlatform.SYSTEM_IOS, AppPlatform.SYSTEM_ANDROID, or null when not recognised (a
     *                        desktop computer, an unknown browser)
     */
    static detectMobileSystem() {
        const userAgent = window.navigator.userAgent;
        if (/Android/.test(userAgent)) {
            return AppPlatform.SYSTEM_ANDROID;
        }
        if (/iPhone|iPad|iPod/.test(userAgent)) {
            return AppPlatform.SYSTEM_IOS;
        }
        if (/Macintosh/.test(userAgent) && (window.navigator.maxTouchPoints > 1)) {
            return AppPlatform.SYSTEM_IOS;
        }

        return null;
    }

    // Started from the home screen: navigator.standalone on iOS, the display mode of the manifest elsewhere.
    static isInstalled() {
        return ((window.navigator.standalone === true) || window.matchMedia('(display-mode: standalone)').matches);
    }
}

AppPlatform.SYSTEM_IOS     = 'ios';
AppPlatform.SYSTEM_ANDROID = 'android';
