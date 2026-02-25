const express = require("express");
const fs = require("fs");
const path = require("path");
const { config, validateConfig } = require("./config");
const { fetchPositions, filterByDepartment } = require("./services/sfApiService");
const { generateInsertIfNotExists, generateSqlHeader, generateSqlFooter } = require("./utils/sqlGenerator");
const logger = require("./utils/logger");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/**
 * Ensure output directory exists
 * @param {string} filePath - Output file path
 */
function ensureOutputDirectory(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created output directory: ${dir}`);
    }
}

/**
 * Validate date format (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} - True if valid
 */
function isValidDate(dateStr) {
    if (!dateStr) return true; // Optional
    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/;
    if (!dateRegex.test(dateStr)) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

/**
 * Sync positions with date range
 * @param {string} startDate - Start date filter
 * @param {string} endDate - End date filter
 * @returns {Object} - Sync result
 */
async function syncPositions(startDate, endDate) {
    const startTime = Date.now();
    logger.info("Starting SF Position sync...");
    logger.info(`Date range: ${startDate || "N/A"} to ${endDate || "N/A"}`);
    logger.info(`Department filter: ${config.sync.departmentFilter}*`);
    logger.info(`Page size: ${config.sync.pageSize}`);

    // Validate configuration
    validateConfig();

    // Ensure output directory exists
    ensureOutputDirectory(config.sync.outputFile);

    const allFilteredPositions = []; // Store all filtered positions
    let page = 1;
    let skip = 0;
    let totalFetched = 0;
    let totalFiltered = 0;
    let hasMoreData = true;

    // Pagination loop
    while (hasMoreData) {
        // Fetch positions from API with date range
        const positions = await fetchPositions(config.sync.pageSize, skip, startDate, endDate);
        const fetchedCount = positions.length;
        totalFetched += fetchedCount;

        // Filter by department
        const filteredPositions = filterByDepartment(positions, config.sync.departmentFilter);
        const filteredCount = filteredPositions.length;
        totalFiltered += filteredCount;

        // Store filtered positions
        allFilteredPositions.push(...filteredPositions);

        // Log progress
        logger.progress(page, fetchedCount, filteredCount, totalFiltered);

        // Check if more data available
        if (fetchedCount < config.sync.pageSize) {
            hasMoreData = false;
            logger.info("Reached end of data");
        } else {
            page++;
            skip += config.sync.pageSize;
        }
    }

    // Generate SQL for both database types
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseFileName = config.sync.outputFile.replace(".sql", `_${timestamp}`);

    logger.info(`Generating SQL for ${allFilteredPositions.length} records for both Oracle and PostgreSQL...`);

    // Generate Oracle SQL statements
    const oracleStatements = [];
    const postgresStatements = [];

    for (const position of allFilteredPositions) {
        oracleStatements.push(generateInsertIfNotExists(position, "oracle"));
        postgresStatements.push(generateInsertIfNotExists(position, "postgres"));
    }

    // Write Oracle SQL file
    const oracleFile = `${baseFileName}_oracle.sql`;
    const oracleSqlContent =
        generateSqlHeader(startDate, endDate, "oracle") +
        oracleStatements.join("\n\n") +
        generateSqlFooter(oracleStatements.length);
    fs.writeFileSync(oracleFile, oracleSqlContent, "utf8");

    // Write PostgreSQL SQL file
    const postgresFile = `${baseFileName}_postgres.sql`;
    const postgresSqlContent =
        generateSqlHeader(startDate, endDate, "postgres") +
        postgresStatements.join("\n\n") +
        generateSqlFooter(postgresStatements.length);
    fs.writeFileSync(postgresFile, postgresSqlContent, "utf8");

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info("========================================");
    logger.info("Sync completed successfully!");
    logger.info(`Total records fetched from API: ${totalFetched}`);
    logger.info(`Total records matching filter: ${totalFiltered}`);
    logger.info(`SQL statements generated: ${allFilteredPositions.length}`);
    logger.info(`Oracle SQL file: ${oracleFile}`);
    logger.info(`PostgreSQL SQL file: ${postgresFile}`);
    logger.info(`Duration: ${duration}s`);
    logger.info("========================================");

    return {
        success: true,
        totalFetched,
        totalFiltered,
        sqlStatementsGenerated: allFilteredPositions.length,
        oracleFile,
        postgresFile,
        duration: `${duration}s`,
    };
}

/**
 * API Endpoint: POST /api/sync
 * Body: { startDate: "yyyy-MM-dd", endDate: "yyyy-MM-dd" }
 */
app.post("/api/sync", async (req, res) => {
    try {
        const { startDate, endDate } = req.body;

        // Validate dates
        if (!isValidDate(startDate)) {
            return res.status(400).json({
                success: false,
                error: "Invalid startDate format. Use yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss",
            });
        }
        if (!isValidDate(endDate)) {
            return res.status(400).json({
                success: false,
                error: "Invalid endDate format. Use yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss",
            });
        }

        logger.info(`API called with startDate: ${startDate}, endDate: ${endDate}`);

        const result = await syncPositions(startDate, endDate);
        res.json(result);
    } catch (error) {
        logger.error(`Sync failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * API Endpoint: GET /api/sync
 * Query params: ?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 */
app.get("/api/sync", async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Validate dates
        if (!isValidDate(startDate)) {
            return res.status(400).json({
                success: false,
                error: "Invalid startDate format. Use yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss",
            });
        }
        if (!isValidDate(endDate)) {
            return res.status(400).json({
                success: false,
                error: "Invalid endDate format. Use yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss",
            });
        }

        logger.info(`API called with startDate: ${startDate}, endDate: ${endDate}`);

        const result = await syncPositions(startDate, endDate);
        res.json(result);
    } catch (error) {
        logger.error(`Sync failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Validate config on startup
try {
    validateConfig();
    logger.info("Configuration validated successfully");
} catch (error) {
    logger.error(`Configuration error: ${error.message}`);
    process.exit(1);
}

// Start server
app.listen(PORT, () => {
    logger.info(`========================================`);
    logger.info(`SF Position Sync API started`);
    logger.info(`Port: ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Sync endpoint: POST http://localhost:${PORT}/api/sync`);
    logger.info(`  Body: { "startDate": "yyyy-MM-dd", "endDate": "yyyy-MM-dd" }`);
    logger.info(`Sync endpoint: GET http://localhost:${PORT}/api/sync?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd`);
    logger.info(`========================================`);
});
