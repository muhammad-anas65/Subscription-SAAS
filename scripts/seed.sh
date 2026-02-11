#!/bin/bash
# =============================================================================
# SubTrack Database Seed Script
# =============================================================================
# This script seeds the database with demo data.
#
# Usage: ./seed.sh
# =============================================================================

set -e

# Configuration
BACKEND_CONTAINER="${BACKEND_CONTAINER:-subtrack_backend}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting database seeding...${NC}"

# Check if backend container is running
if ! docker ps | grep -q "$BACKEND_CONTAINER"; then
    echo -e "${RED}Backend container not found: $BACKEND_CONTAINER${NC}"
    echo "Please start the application first: docker compose up -d"
    exit 1
fi

# Run Prisma seed
echo -e "${YELLOW}Running database migrations...${NC}"
docker compose exec backend npx prisma migrate deploy

echo -e "${YELLOW}Seeding database with demo data...${NC}"
docker compose exec backend npx prisma db seed

echo -e "${GREEN}Database seeding completed!${NC}"
echo ""
echo "Demo credentials:"
echo "  Super Admin: admin@subtrack.local / Admin123!"
echo "  Tenant Admin: tenant@subtrack.local / Tenant123!"
