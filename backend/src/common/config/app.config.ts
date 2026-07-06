/**
 * Centralized application configuration.
 *
 * All magic numbers from across the codebase are defined here with env-var overrides.
 * Values without env-var fallback use hardcoded defaults.
 */
function envNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const n = Number(val);
  return Number.isNaN(n) ? defaultValue : n;
}

export const appConfig = {
  auth: {
    maxFailedAttempts: envNumber('AUTH_MAX_FAILED_ATTEMPTS', 10),
    lockDurationSec: envNumber('AUTH_LOCK_DURATION_SEC', 900),
  },

  dashboard: {
    cacheTtl: envNumber('DASHBOARD_CACHE_TTL', 30), // seconds
  },

  sla: {
    atRiskRatio: envNumber('SLA_AT_RISK_RATIO', 0.2),
    batchSize: envNumber('SLA_BATCH_SIZE', 500),
    checkLockTtl: envNumber('SLA_CHECK_LOCK_TTL', 300), // seconds
  },

  maintenance: {
    drainTimeMs: envNumber('MAINTENANCE_DRAIN_TIME_MS', 5000),
    backupLockTtl: envNumber('MAINTENANCE_BACKUP_LOCK_TTL_SEC', 600),
    restoreLockTtl: envNumber('MAINTENANCE_RESTORE_LOCK_TTL_SEC', 1800),
    lockRenewIntervalMs: envNumber('MAINTENANCE_LOCK_RENEW_INTERVAL_MS', 120_000),
    execMaxBuffer: envNumber('MAINTENANCE_EXEC_MAX_BUFFER', 16 * 1024 * 1024),
    maxBackupListing: envNumber('MAINTENANCE_MAX_BACKUP_LISTING', 50),
    parallelWorkers: envNumber('MAINTENANCE_PARALLEL_WORKERS', 5),
    backupIdAttempts: envNumber('MAINTENANCE_BACKUP_ID_ATTEMPTS', 5),
    backupIdRetryDelayMs: envNumber('MAINTENANCE_BACKUP_ID_RETRY_DELAY_MS', 1000),
  },

  telegram: {
    longPollTimeoutSec: envNumber('TELEGRAM_LONG_POLL_TIMEOUT_SEC', 30),
    linkCodeExpiryMin: envNumber('TELEGRAM_LINK_CODE_EXPIRY_MIN', 5),
    sendConcurrency: envNumber('TELEGRAM_SEND_CONCURRENCY', 3),
  },

  fileUpload: {
    maxDirectFileSize: envNumber('UPLOAD_MAX_DIRECT_FILE_SIZE', 10 * 1024 * 1024), // 10MB
    maxCommentFileSize: envNumber('UPLOAD_MAX_COMMENT_FILE_SIZE', 5 * 1024 * 1024), // 5MB
    maxFilesPerComment: envNumber('UPLOAD_MAX_FILES_PER_COMMENT', 3),
    maxFilesPerTicket: envNumber('UPLOAD_MAX_FILES_PER_TICKET', 5),
    maxPaginationLimit: envNumber('UPLOAD_MAX_PAGINATION_LIMIT', 100),
  },

  tickets: {
    maxExportRows: envNumber('TICKET_MAX_EXPORT_ROWS', 10000),
    exportBatchSize: envNumber('TICKET_EXPORT_BATCH_SIZE', 500),
    creationRetries: envNumber('TICKET_CREATION_RETRIES', 3),
  },
} as const;
