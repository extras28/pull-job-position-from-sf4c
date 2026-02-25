const axios = require("axios");
const { config } = require("../config");
const logger = require("../utils/logger");

/**
 * Create axios instance with base configuration
 */
function createApiClient() {
    const credentials = Buffer.from(`${config.sf.username}:${config.sf.password}`).toString("base64");

    return axios.create({
        baseURL: config.sf.baseUrl,
        timeout: config.request.timeout,
        headers: {
            Authorization: `Basic ${credentials}`,
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
}

/**
 * Sleep utility for retry delay
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get yesterday's date in ISO format for OData filter
 * @returns {string} - Date string in format yyyy-MM-ddTHH:mm:ss
 */
function getYesterdayDateTime() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().replace(/\.\d{3}Z$/, "");
}

/**
 * Build OData filter based on date range
 * @param {string} startDate - Start date (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
 * @param {string} endDate - End date (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
 * @returns {string} - OData filter string
 */
function buildDateFilter(startDate, endDate) {
    // Format dates to OData datetime format
    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        // If only date provided, add time
        if (dateStr.length === 10) {
            return `${dateStr}T00:00:00`;
        }
        return dateStr;
    };

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    if (start && end) {
        return `lastModifiedDateTime ge datetime'${start}' and lastModifiedDateTime le datetime'${end}'`;
    } else if (start) {
        return `lastModifiedDateTime ge datetime'${start}'`;
    } else if (end) {
        return `lastModifiedDateTime le datetime'${end}'`;
    } else {
        // Default: yesterday
        const yesterdayDateTime = getYesterdayDateTime();
        return `lastModifiedDateTime ge datetime'${yesterdayDateTime}'`;
    }
}

/**
 * Fetch positions from SuccessFactors API with pagination
 * @param {number} top - Number of records to fetch
 * @param {number} skip - Number of records to skip
 * @param {string} startDate - Start date filter (optional)
 * @param {string} endDate - End date filter (optional)
 * @returns {Promise<Array>} - Array of position records
 */
async function fetchPositions(top, skip, startDate = null, endDate = null) {
    const client = createApiClient();

    // Build filter based on date range
    const filter = buildDateFilter(startDate, endDate);

    const params = {
        $format: "json",
        $select: config.selectFields,
        $top: top,
        $skip: skip,
        $filter: filter,
    };

    logger.info(`Using filter: ${filter}`);

    let lastError;

    for (let attempt = 1; attempt <= config.request.retryAttempts; attempt++) {
        try {
            logger.debug(`Fetching positions: top=${top}, skip=${skip}, attempt=${attempt}`);

            const response = await client.get("/Position", { params });

            // OData response structure
            const results = response.data?.d?.results || [];
            return results;
        } catch (error) {
            lastError = error;

            const isRetryable =
                error.code === "ECONNRESET" ||
                error.code === "ETIMEDOUT" ||
                error.code === "ECONNABORTED" ||
                (error.response && error.response.status >= 500);

            if (isRetryable && attempt < config.request.retryAttempts) {
                const delay = config.request.retryDelay * Math.pow(2, attempt - 1);
                logger.warn(
                    `Request failed (attempt ${attempt}/${config.request.retryAttempts}), ` +
                        `retrying in ${delay}ms: ${error.message}`,
                );
                await sleep(delay);
            } else {
                break;
            }
        }
    }

    // All retries exhausted
    const errorMessage = lastError.response
        ? `API Error ${lastError.response.status}: ${JSON.stringify(lastError.response.data)}`
        : `Request Error: ${lastError.message}`;

    throw new Error(errorMessage);
}

/**
 * Filter positions by department prefix
 * @param {Array} positions - Array of position records
 * @param {string} prefix - Department prefix to filter by
 * @returns {Array} - Filtered positions
 */
function filterByDepartment(positions, prefix) {
    return positions.filter((pos) => {
        const department = pos.department || "";
        return department.startsWith(prefix);
    });
}

module.exports = {
    fetchPositions,
    filterByDepartment,
};
