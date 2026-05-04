#!/bin/bash
# scripts/backup-db.sh
#
# PostgreSQL 全量备份脚本
#
# 依赖：pg_dump、gzip、ossutil（阿里云 OSS CLI）
#
# 环境变量：
#   DB_NAME        - 数据库名（默认 gongxu）
#   DB_HOST        - 数据库主机（默认 localhost）
#   DB_PORT        - 端口（默认 5432）
#   DB_USER        - 数据库用户（默认 postgres）
#   PGPASSWORD     - 密码（由环境变量注入，不写脚本）
#   BACKUP_DIR     - 本地备份目录（默认 /backups）
#   OSS_BUCKET     - OSS 存储桶路径（如 oss://gongxu-backups/db/）
#   BACKUP_RETAIN_DAYS - 本地保留天数（默认 7）
#
# crontab 示例（每日凌晨 3 点执行全量备份）：
#   0 3 * * * /app/scripts/backup-db.sh >> /var/log/backup.log 2>&1
#
# 验证恢复：backup-verify.ts 每周一凌晨 4 点执行

set -euo pipefail

DB_NAME="${DB_NAME:-gongxu}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
OSS_BUCKET="${OSS_BUCKET:-}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"

DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="gongxu_${DATE}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[$(date -Iseconds)] [backup] START db=${DB_NAME} host=${DB_HOST}"

# 确保目录存在
mkdir -p "${BACKUP_DIR}"

# 全量备份（plain SQL + gzip）
pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  --no-password \
  --format=plain \
  "${DB_NAME}" \
  | gzip -9 > "${FILEPATH}"

echo "[$(date -Iseconds)] [backup] DUMP OK -> ${FILEPATH} ($(du -sh "${FILEPATH}" | cut -f1))"

# 上传 OSS（若配置了 OSS_BUCKET）
if [ -n "${OSS_BUCKET}" ]; then
  if command -v ossutil &> /dev/null; then
    ossutil cp "${FILEPATH}" "${OSS_BUCKET}${FILENAME}"
    echo "[$(date -Iseconds)] [backup] OSS UPLOAD OK -> ${OSS_BUCKET}${FILENAME}"
  else
    echo "[$(date -Iseconds)] [backup] WARN ossutil not found, skipping OSS upload"
  fi
fi

# 清理本地超期备份
find "${BACKUP_DIR}" -name "gongxu_*.sql.gz" -mtime "+${BACKUP_RETAIN_DAYS}" -delete
echo "[$(date -Iseconds)] [backup] CLEANUP: removed files older than ${BACKUP_RETAIN_DAYS} days"

echo "[$(date -Iseconds)] [backup] DONE"
