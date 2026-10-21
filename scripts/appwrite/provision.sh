#!/usr/bin/env bash
#
# Provisions the Appwrite product-catalog schema with the Appwrite CLI.
#
# Scope: the product catalog only. Users, sessions, gamification, challenges
# and analyses stay in PostgreSQL — Appwrite is a document store and cannot
# express the relational constraints and atomic XP updates those features need.
#
# Idempotent: re-running creates only what is missing.
#
# Required environment:
#   APPWRITE_ENDPOINT     e.g. https://cloud.appwrite.io/v1
#   APPWRITE_PROJECT_ID
#   APPWRITE_API_KEY      server API key (not the console session key)
#
# Optional (defaults shown):
#   APPWRITE_DATABASE_ID           foodguard
#   APPWRITE_PRODUCTS_TABLE_ID     products
#   APPWRITE_BARCODES_TABLE_ID     product_barcodes

set -euo pipefail

: "${APPWRITE_ENDPOINT:?APPWRITE_ENDPOINT is required (e.g. https://cloud.appwrite.io/v1)}"
: "${APPWRITE_PROJECT_ID:?APPWRITE_PROJECT_ID is required}"
: "${APPWRITE_API_KEY:?APPWRITE_API_KEY is required}"

DATABASE_ID="${APPWRITE_DATABASE_ID:-foodguard}"
PRODUCTS_TABLE="${APPWRITE_PRODUCTS_TABLE_ID:-products}"
BARCODES_TABLE="${APPWRITE_BARCODES_TABLE_ID:-product_barcodes}"

command -v appwrite >/dev/null 2>&1 || {
  echo "error: the Appwrite CLI is not on PATH. See https://appwrite.io/docs/products/databases" >&2
  exit 1
}

echo "==> Connecting to ${APPWRITE_ENDPOINT} (project ${APPWRITE_PROJECT_ID})"
appwrite client -e "$APPWRITE_ENDPOINT" -p "$APPWRITE_PROJECT_ID" -k "$APPWRITE_API_KEY"

# Column sizes mirror src/lib/appwrite/catalog-mapping.ts COLUMN_LIMITS.
PRODUCTS_COLUMNS='[
  {"key":"productId","type":"string","size":64,"required":true},
  {"key":"name","type":"string","size":512,"required":false},
  {"key":"normalizedName","type":"string","size":512,"required":false},
  {"key":"brand","type":"string","size":256,"required":false},
  {"key":"normalizedBrand","type":"string","size":256,"required":false},
  {"key":"barcode","type":"string","size":64,"required":false},
  {"key":"barcodes","type":"string","size":64,"required":false,"array":true},
  {"key":"variant","type":"string","size":128,"required":false},
  {"key":"packSize","type":"string","size":64,"required":false},
  {"key":"quantity","type":"string","size":64,"required":false},
  {"key":"unit","type":"string","size":32,"required":false},
  {"key":"description","type":"text","required":false},
  {"key":"foodType","type":"string","size":64,"required":false},
  {"key":"dietary","type":"string","size":128,"required":false},
  {"key":"imageUrl","type":"url","required":false},
  {"key":"price","type":"string","size":32,"required":false},
  {"key":"mrp","type":"string","size":32,"required":false},
  {"key":"rating","type":"string","size":16,"required":false},
  {"key":"dataStatus","type":"string","size":32,"required":false},
  {"key":"completenessScore","type":"double","required":false},
  {"key":"confidenceScore","type":"double","required":false},
  {"key":"nutrition","type":"text","required":false},
  {"key":"ingredientIds","type":"integer","required":false,"array":true},
  {"key":"allergenIds","type":"integer","required":false,"array":true},
  {"key":"sources","type":"string","size":64,"required":false,"array":true},
  {"key":"createdAt","type":"datetime","required":false},
  {"key":"updatedAt","type":"datetime","required":false}
]'

# A unique index on productId keeps re-imports idempotent; Appwrite cannot put
# a unique index on an array column, which is why barcodes live in their own
# table. Full-text search over the catalog needs the `fulltext_name` index,
# created separately below because it is engine dependent.
PRODUCTS_INDEXES='[
  {"key":"productId_unique","type":"unique","attributes":["productId"]},
  {"key":"barcode_idx","type":"key","attributes":["barcode"]},
  {"key":"normalizedName_idx","type":"key","attributes":["normalizedName"]},
  {"key":"dataStatus_idx","type":"key","attributes":["dataStatus"]}
]'

BARCODES_COLUMNS='[
  {"key":"barcode","type":"string","size":64,"required":true},
  {"key":"productId","type":"string","size":64,"required":true},
  {"key":"source","type":"string","size":64,"required":false},
  {"key":"confidence","type":"double","required":false}
]'

BARCODES_INDEXES='[
  {"key":"barcode_unique","type":"unique","attributes":["barcode"]},
  {"key":"barcode_product_idx","type":"key","attributes":["productId"]}
]'

ensure_database() {
  if appwrite databases get --database-id "$DATABASE_ID" >/dev/null 2>&1; then
    echo "==> Database '${DATABASE_ID}' already exists"
  else
    echo "==> Creating database '${DATABASE_ID}'"
    appwrite databases create --database-id "$DATABASE_ID" --name "FoodGuard" --enabled
  fi
}

ensure_table() {
  local table_id="$1" columns="$2" indexes="$3"
  if appwrite tablesdb get-table --database-id "$DATABASE_ID" --table-id "$table_id" >/dev/null 2>&1; then
    echo "==> Table '${table_id}' already exists"
    return
  fi
  echo "==> Creating table '${table_id}'"
  appwrite tablesdb create-table \
    --database-id "$DATABASE_ID" \
    --table-id "$table_id" \
    --name "$table_id" \
    --enabled \
    --columns "$columns" \
    --indexes "$indexes"
}

ensure_database
ensure_table "$PRODUCTS_TABLE" "$PRODUCTS_COLUMNS" "$PRODUCTS_INDEXES"
ensure_table "$BARCODES_TABLE" "$BARCODES_COLUMNS" "$BARCODES_INDEXES"

# Catalog search is a core flow, so add full-text when the engine supports it.
# Skipped silently on engines without full-text support.
if [ "${APPWRITE_SKIP_FULLTEXT:-0}" != "1" ]; then
  if appwrite tablesdb list-indexes --database-id "$DATABASE_ID" --table-id "$PRODUCTS_TABLE" 2>/dev/null \
      | grep -q "fulltext_name"; then
    echo "==> Full-text index already present"
  elif appwrite tablesdb create-index \
      --database-id "$DATABASE_ID" \
      --table-id "$PRODUCTS_TABLE" \
      --key "fulltext_name" \
      --type "fulltext" \
      --columns "name,brand" >/dev/null 2>&1; then
    echo "==> Created full-text index 'fulltext_name'"
  else
    echo "!! Full-text index unavailable on this engine — catalog search will use key indexes only." >&2
  fi
fi

echo "==> Provisioning complete"