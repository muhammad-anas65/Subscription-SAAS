#!/bin/bash
# =============================================================================
# SubTrack Bootstrap Script
# =============================================================================
# This script creates the first super admin user and initial tenant.
# Run this after the first deployment.
#
# Usage: ./bootstrap.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  SubTrack Bootstrap                          ║"
echo "║          First-time Setup Wizard                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if containers are running
if ! docker compose ps | grep -q "subtrack_backend"; then
    echo -e "${RED}Error: SubTrack containers are not running${NC}"
    echo "Please start the application first:"
    echo "  docker compose up -d"
    exit 1
fi

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database to be ready...${NC}"
sleep 5

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker compose exec backend npx prisma migrate deploy

echo ""
echo -e "${GREEN}=== Create Super Admin User ===${NC}"
echo ""

# Collect super admin details
read -p "Super Admin Email: " admin_email
read -sp "Super Admin Password: " admin_password
echo ""
read -p "First Name: " first_name
read -p "Last Name: " last_name

echo ""
echo -e "${GREEN}=== Create Initial Tenant ===${NC}"
echo ""

read -p "Tenant Name: " tenant_name
read -p "Tenant Slug (lowercase, no spaces): " tenant_slug

# Create super admin
echo ""
echo -e "${YELLOW}Creating super admin user...${NC}"
docker compose exec -T backend node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

async function createSuperAdmin() {
    const prisma = new PrismaClient();
    
    try {
        // Check if super admin already exists
        const existingAdmin = await prisma.user.findFirst({
            where: { role: 'SUPER_ADMIN' }
        });
        
        if (existingAdmin) {
            console.log('Super admin already exists:', existingAdmin.email);
            process.exit(0);
        }
        
        // Hash password
        const passwordHash = await argon2.hash('$admin_password', {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
        });
        
        // Create super admin
        const user = await prisma.user.create({
            data: {
                email: '$admin_email',
                passwordHash,
                firstName: '$first_name',
                lastName: '$last_name',
                role: 'SUPER_ADMIN',
                status: 'ACTIVE',
            },
        });
        
        console.log('Super admin created successfully:', user.email);
    } catch (error) {
        console.error('Error creating super admin:', error);
        process.exit(1);
    } finally {
        await prisma.\$disconnect();
    }
}

createSuperAdmin();
"

# Create tenant
echo ""
echo -e "${YELLOW}Creating tenant...${NC}"
docker compose exec -T backend node -e "
const { PrismaClient } = require('@prisma/client');

async function createTenant() {
    const prisma = new PrismaClient();
    
    try {
        // Check if tenant already exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { slug: '$tenant_slug' }
        });
        
        if (existingTenant) {
            console.log('Tenant already exists:', existingTenant.name);
            process.exit(0);
        }
        
        // Create tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: '$tenant_name',
                slug: '$tenant_slug',
                isActive: true,
            },
        });
        
        // Create default alert settings
        await prisma.alertSettings.create({
            data: {
                tenantId: tenant.id,
                enable14Days: true,
                enable7Days: true,
                enable3Days: true,
                enableTomorrow: true,
                enableOverdue: true,
                enableMonthlySummary: true,
                enableDataQuality: true,
                timezone: 'UTC',
            },
        });
        
        console.log('Tenant created successfully:', tenant.name);
        console.log('Tenant ID:', tenant.id);
    } catch (error) {
        console.error('Error creating tenant:', error);
        process.exit(1);
    } finally {
        await prisma.\$disconnect();
    }
}

createTenant();
"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Bootstrap Complete!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Your SubTrack instance is ready!"
echo ""
echo "Login credentials:"
echo "  Email: $admin_email"
echo "  Password: (the password you entered)"
echo ""
echo "Next steps:"
echo "  1. Access the application at http://localhost (or your domain)"
echo "  2. Log in with your super admin credentials"
echo "  3. Create departments and users"
echo "  4. Add your subscriptions"
echo ""
echo "For Cloudflare Tunnel setup, see the README.md"
