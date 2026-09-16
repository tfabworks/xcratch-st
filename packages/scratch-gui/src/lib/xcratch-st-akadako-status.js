/*
 * xcratch-st: AkaDako (g2s extension) load / connection state, shared by the
 * stage-header indicator and the menu-bar share button.
 */

// Extension ID of the AkaDako extension (xcx-g2s)
export const AKADAKO_EXTENSION_ID = 'g2s';

// Fallback polling interval; the extension emits PERIPHERAL_* events on
// connect/disconnect, but the poll keeps the state right even if one is missed.
const POLL_INTERVAL_MS = 2000;

const EVENTS = [
    'EXTENSION_ADDED',
    'PERIPHERAL_CONNECTED',
    'PERIPHERAL_DISCONNECTED',
    'PERIPHERAL_CONNECTION_LOST_ERROR',
    'PERIPHERAL_REQUEST_ERROR'
];

/**
 * Current state.
 * @param {VM} vm - scratch-vm instance
 * @returns {{loaded: boolean, connected: boolean}} whether the extension is loaded and the board connected
 */
export const getAkaDakoStatus = vm => {
    let loaded = false;
    let connected = false;
    try {
        loaded = !!vm.extensionManager?.isExtensionLoaded(AKADAKO_EXTENSION_ID);
        connected = loaded && !!vm.getPeripheralIsConnected(AKADAKO_EXTENSION_ID);
    } catch {
        // The extension may not be registered yet; treat as not loaded.
    }
    return {loaded, connected};
};

/**
 * Watch the state; the callback gets {loaded, connected} immediately and on every change.
 * @param {VM} vm - scratch-vm instance
 * @param {Function} callback - called with {loaded, connected} on change
 * @returns {function} unsubscribe
 */
export const watchAkaDakoStatus = (vm, callback) => {
    let last = {loaded: null, connected: null};
    const update = () => {
        const status = getAkaDakoStatus(vm);
        if (status.loaded !== last.loaded || status.connected !== last.connected) {
            last = status;
            callback(status);
        }
    };
    EVENTS.forEach(name => vm.on(name, update));
    const timer = setInterval(update, POLL_INTERVAL_MS);
    update();
    return () => {
        EVENTS.forEach(name => vm.removeListener(name, update));
        clearInterval(timer);
    };
};
