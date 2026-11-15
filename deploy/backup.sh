#!/usr/bin/env bash
# Consistent copy of the relay database (VACUUM INTO) into deploy/backups/,
# keeping the newest 14 copies. Example cron entry (daily at 03:15):
#   15 3 * * * /home/ubuntu/Parapka/deploy/backup.sh
set -euo pipefail

cd "$(dirname "$0")"
keep=14
stamp="$(date +%Y-%m-%d-%H%M%S)"
remote="/tmp/relay-backup-${stamp}.db"
local_copy="backups/relay-${stamp}.db"
mkdir -p backups

docker compose exec -T relay node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.env.RELAY_DB_PATH);
  db.exec("VACUUM INTO \x27" + process.argv[1] + "\x27");
  db.close();
' "$remote"
docker compose cp "relay:${remote}" "$local_copy"
docker compose exec -T relay rm -f "$remote"

# Rotation: drop everything but the newest copies.
ls -1t backups/relay-*.db | tail -n +$((keep + 1)) | xargs -r rm -f --
echo "$local_copy"
