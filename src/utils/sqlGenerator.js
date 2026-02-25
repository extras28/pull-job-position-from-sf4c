const { config } = require("../config");

/**
 * Parse SuccessFactors date format /Date(timestamp)/ to PostgreSQL timestamp
 * @param {string} sfDate - SuccessFactors date string like /Date(1234567890000)/
 * @returns {string|null} - PostgreSQL timestamp string or null
 */
function parseSFDate(sfDate) {
    if (!sfDate) return null;

    // Match /Date(timestamp)/ or /Date(timestamp+offset)/
    const match = sfDate.match(/\/Date\((-?\d+)([+-]\d+)?\)\//);
    if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        return date.toISOString().replace("T", " ").replace("Z", "");
    }

    // If it's already a valid date string, return as is
    if (!isNaN(Date.parse(sfDate))) {
        return new Date(sfDate).toISOString().replace("T", " ").replace("Z", "");
    }

    return null;
}

/**
 * Escape single quotes in SQL string values
 * @param {string} value - String value to escape
 * @returns {string} - Escaped string
 */
function escapeSqlString(value) {
    if (value === null || value === undefined) return null;
    return String(value).replace(/'/g, "''");
}

/**
 * Format value for SQL INSERT statement
 * @param {any} value - Value to format
 * @param {string} columnName - Column name for type inference
 * @param {string} dbType - Database type ('oracle' or 'postgres')
 * @returns {string} - SQL formatted value
 */
function formatSqlValue(value, columnName, dbType = "oracle") {
    if (value === null || value === undefined) {
        return "NULL";
    }

    // Date columns
    const dateColumns = ["effective_start_date", "last_modified_date_time", "effective_end_date"];

    if (dateColumns.includes(columnName)) {
        const parsedDate = parseSFDate(value);
        if (parsedDate) {
            if (dbType === "oracle") {
                // Oracle format: TO_TIMESTAMP('2024-01-01 00:00:00', 'YYYY-MM-DD HH24:MI:SS.FF3')
                return `TO_TIMESTAMP('${parsedDate}', 'YYYY-MM-DD HH24:MI:SS.FF3')`;
            } else {
                // PostgreSQL format: '2024-01-01 00:00:00'::timestamp
                return `'${parsedDate}'::timestamp`;
            }
        }
        return "NULL";
    }

    // String values
    return `'${escapeSqlString(value)}'`;
}

/**
 * Transform API record to DB record using field mapping
 * @param {Object} apiRecord - Record from SuccessFactors API
 * @returns {Object} - Record with DB column names
 */
function transformRecord(apiRecord) {
    const dbRecord = {};

    for (const [apiField, dbColumn] of Object.entries(config.fieldMapping)) {
        dbRecord[dbColumn] = apiRecord[apiField] !== undefined ? apiRecord[apiField] : null;
    }

    return dbRecord;
}

/**
 * Generate INSERT IF NOT EXISTS SQL statement for Oracle database
 * Uses MERGE statement for Oracle compatibility
 * @param {Object} record - Position record from API
 * @returns {string} - SQL MERGE statement
 */
function generateOracleInsert(record) {
    const dbRecord = transformRecord(record);
    const columns = Object.keys(config.fieldMapping).map((k) => config.fieldMapping[k]);
    const values = columns.map((col) => formatSqlValue(dbRecord[col], col, "oracle"));
    const code = escapeSqlString(dbRecord.code);

    // Build column-value pairs for INSERT
    const insertColumns = columns.join(", ");
    const insertValues = values.join(", ");

    // Oracle MERGE statement for INSERT IF NOT EXISTS
    return `MERGE INTO job_sf_position target
USING (SELECT '${code}' AS code FROM dual) source
ON (target.code = source.code)
WHEN NOT MATCHED THEN
    INSERT (${insertColumns})
    VALUES (${insertValues});`;
}

/**
 * Generate INSERT IF NOT EXISTS SQL statement for PostgreSQL database
 * Uses INSERT ... ON CONFLICT DO NOTHING
 * @param {Object} record - Position record from API
 * @returns {string} - SQL INSERT statement
 */
function generatePostgresInsert(record) {
    const dbRecord = transformRecord(record);
    const columns = Object.keys(config.fieldMapping).map((k) => config.fieldMapping[k]);
    const values = columns.map((col) => formatSqlValue(dbRecord[col], col, "postgres"));

    const insertColumns = columns.join(", ");
    const insertValues = values.join(", ");

    // PostgreSQL INSERT with ON CONFLICT
    return `INSERT INTO job_sf_position (${insertColumns})
VALUES (${insertValues})
ON CONFLICT (code) DO NOTHING;`;
}

/**
 * Generate INSERT IF NOT EXISTS SQL statement
 * @param {Object} record - Position record from API
 * @param {string} dbType - Database type ('oracle' or 'postgres')
 * @returns {string} - SQL statement
 */
function generateInsertIfNotExists(record, dbType = "oracle") {
    if (dbType === "postgres") {
        return generatePostgresInsert(record);
    } else {
        return generateOracleInsert(record);
    }
}

/**
 * Generate SQL file header with metadata
 * @param {string} startDate - Start date filter
 * @param {string} endDate - End date filter
 * @param {string} dbType - Database type ('oracle' or 'postgres')
 * @returns {string} - SQL header comment
 */
function generateSqlHeader(startDate, endDate, dbType = "oracle") {
    const now = new Date().toISOString();
    const dateRange = startDate || endDate ? `${startDate || "N/A"} to ${endDate || "N/A"}` : "Yesterday";
    const dbTypeUpper = dbType.toUpperCase();
    return `-- ============================================
-- SF Position Sync SQL (${dbTypeUpper})
-- Generated: ${now}
-- Date Range: ${dateRange}
-- Department Filter: ${config.sync.departmentFilter}*
-- Database: ${dbTypeUpper}
-- ============================================

`;
}

/**
 * Generate SQL file footer with summary
 * @param {number} totalRecords - Total records processed
 * @returns {string} - SQL footer comment
 */
function generateSqlFooter(totalRecords) {
    return `
-- ============================================
-- Total Records: ${totalRecords}
-- End of SQL file
-- ============================================
`;
}

module.exports = {
    parseSFDate,
    escapeSqlString,
    formatSqlValue,
    transformRecord,
    generateInsertIfNotExists,
    generateSqlHeader,
    generateSqlFooter,
};
