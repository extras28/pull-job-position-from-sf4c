require("dotenv").config();

const config = {
    // SuccessFactors API Configuration
    sf: {
        baseUrl: process.env.SF_BASE_URL || "https://api10.successfactors.com/odata/v2",
        username: process.env.SF_USERNAME,
        password: process.env.SF_PASSWORD,
    },

    // Sync Configuration
    sync: {
        pageSize: parseInt(process.env.PAGE_SIZE, 10) || 1000,
        outputFile: process.env.OUTPUT_FILE || "output/positions.sql",
        departmentFilter: process.env.DEPARTMENT_FILTER || "",
    },

    // API Request Configuration
    request: {
        timeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 60000, // 60 seconds default
        retryAttempts: 3,
        retryDelay: 1000, // 1 second initial delay
    },

    // Fields to select from SuccessFactors API
    selectFields: [
        "code",
        "effectiveStartDate",
        "cust_subCode",
        "cust_subDepartment",
        "lastModifiedDateTime",
        "jobCode",
        "jobTitle",
        "payRange",
        "cust_subDepartment2",
        "costCenter",
        "externalName_localized",
        "effectiveStatus",
        "externalName_vi_VN",
        "effectiveEndDate",
        "payGrade",
        "cust_compensationpackage",
        "department",
        "cust_max",
        "jobLevel",
        "cust_min",
        "externalName_en_US",
    ].join(","),

    // JSON field to DB column mapping
    fieldMapping: {
        code: "code",
        effectiveStartDate: "effective_start_date",
        cust_subCode: "cust_sub_code",
        cust_subDepartment: "cust_sub_department",
        lastModifiedDateTime: "last_modified_date_time",
        jobCode: "job_code",
        jobTitle: "job_title",
        payRange: "pay_range",
        cust_subDepartment2: "cust_sub_department2",
        costCenter: "cost_center",
        externalName_localized: "external_name_localized",
        effectiveStatus: "effective_status",
        externalName_vi_VN: "external_name_vi",
        effectiveEndDate: "effective_end_date",
        payGrade: "pay_grade",
        cust_compensationpackage: "Compensation_Package",
        department: "department",
        cust_max: "cust_max",
        jobLevel: "job_level",
        cust_min: "cust_min",
        externalName_en_US: "externalName_en",
    },
};

// Validate required configuration
function validateConfig() {
    const errors = [];

    if (!config.sf.username) {
        errors.push("SF_USERNAME is required");
    }
    if (!config.sf.password) {
        errors.push("SF_PASSWORD is required");
    }

    if (errors.length > 0) {
        throw new Error(`Configuration errors:\n${errors.join("\n")}`);
    }
}

module.exports = { config, validateConfig };
