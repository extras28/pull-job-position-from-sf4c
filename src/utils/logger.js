/**
 * Simple logger utility with timestamp
 */
const logger = {
    info: (message, ...args) => {
        console.log(`[${new Date().toISOString()}] [INFO] ${message}`, ...args);
    },

    error: (message, ...args) => {
        console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, ...args);
    },

    warn: (message, ...args) => {
        console.warn(`[${new Date().toISOString()}] [WARN] ${message}`, ...args);
    },

    debug: (message, ...args) => {
        if (process.env.DEBUG === "true") {
            console.log(`[${new Date().toISOString()}] [DEBUG] ${message}`, ...args);
        }
    },

    progress: (page, fetched, filtered, total) => {
        console.log(
            `[${new Date().toISOString()}] [PROGRESS] Page ${page}: Fetched ${fetched} records, ` +
                `${filtered} matched filter, Total synced: ${total}`,
        );
    },
};

module.exports = logger;
