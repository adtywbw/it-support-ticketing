/**
 * Centralized application configuration.
 *
 * All magic numbers from across the codebase are defined here with env-var overrides.
 * Values without env-var fallback use hardcoded defaults.
 */
export const appConfig = {
  auth: {
    maxFailedAttempts: Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 10,
    lockDurationSec: Number(process.env.AUTH_LOCK_DURATION_SEC) || 900,
  },

  dashboard: {
    cacheTtl: Number(process.env.DASHBOARD_CACHE_TTL) || 30, // seconds
  },

  sla: {
    atRiskRatio: Number(process.env.SLA_AT_RISK_RATIO) || 0.2,
    batchSize: Number(process.env.SLA_BATCH_SIZE) || 500,
    checkLockTtl: Number(process.env.SLA_CHECK_LOCK_TTL) || 300, // seconds
  },

  maintenance: {
    drainTimeMs: Number(process.env.MAINTENANCE_DRAIN_TIME_MS) || 5000,
    backupLockTtl: Number(process.env.MAINTENANCE_BACKUP_LOCK_TTL_SEC) || 600,
    restoreLockTtl: Number(process.env.MAINTENANCE_RESTORE_LOCK_TTL_SEC) || 1800,
    lockRenewIntervalMs: Number(process.env.MAINTENANCE_LOCK_RENEW_INTERVAL_MS) || 120_000,
    execMaxBuffer: Number(process.env.MAINTENANCE_EXEC_MAX_BUFFER) || 16 * 1024 * 1024,
    maxBackupListing: Number(process.env.MAINTENANCE_MAX_BACKUP_LISTING) || 50,
    parallelWorkers: Number(process.env.MAINTENANCE_PARALLEL_WORKERS) || 5,
    backupIdAttempts: Number(process.env.MAINTENANCE_BACKUP_ID_ATTEMPTS) || 5,
    backupIdRetryDelayMs: Number(process.env.MAINTENANCE_BACKUP_ID_RETRY_DELAY_MS) || 1000,
  },

  telegram: {
    longPollTimeoutSec: Number(process.env.TELEGRAM_LONG_POLL_TIMEOUT_SEC) || 30,
    linkCodeExpiryMin: Number(process.env.TELEGRAM_LINK_CODE_EXPIRY_MIN) || 5,
    sendConcurrency: Number(process.env.TELEGRAM_SEND_CONCURRENCY) || 3,
  },

  fileUpload: {
    maxDirectFileSize: Number(process.env.UPLOAD_MAX_DIRECT_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    maxCommentFileSize: Number(process.env.UPLOAD_MAX_COMMENT_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    maxFilesPerComment: Number(process.env.UPLOAD_MAX_FILES_PER_COMMENT) || 3,
    maxFilesPerTicket: Number(process.env.UPLOAD_MAX_FILES_PER_TICKET) || 5,
    maxPaginationLimit: Number(process.env.UPLOAD_MAX_PAGINATION_LIMIT) || 100,
  },

  tickets: {
    maxExportRows: Number(process.env.TICKET_MAX_EXPORT_ROWS) || 10000,
    exportBatchSize: Number(process.env.TICKET_EXPORT_BATCH_SIZE) || 500,
    creationRetries: Number(process.env.TICKET_CREATION_RETRIES) || 3,
  },
} as const;
