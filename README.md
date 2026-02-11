# SubTrack - Subscription Tracking & Alerting SaaS

A production-ready, self-hosted (on-prem) subscription tracking and alerting SaaS that you can white-label and sell to other companies.

## Features

- **Multi-Tenancy**: Complete tenant isolation with white-label branding per tenant
- **Subscription Management**: Track billing cycles, renewal dates, ownership, departments, cost centers
- **Automated Alerts**: Google Chat webhooks for renewal reminders, overdue alerts, monthly summaries
- **Beautiful Dashboard**: Analytics with charts, KPIs, and upcoming renewals
- **RBAC**: Role-based access control (Super Admin, Tenant Admin, Finance, Manager, Viewer)
- **Cloudflare Ready**: Works seamlessly behind Cloudflare Tunnel or Proxy

## Tech Stack

- **Backend**: Node.js (TypeScript) + NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Frontend**: Next.js (TypeScript) + TailwindCSS + Recharts
- **Auth**: JWT + refresh tokens + RBAC
- **Job Scheduler**: BullMQ + Redis
- **Reverse Proxy**: Nginx (Cloudflare-optimized)
- **Containerization**: Docker + Docker Compose

## Quick Start

### Prerequisites

- Ubuntu 20.04+ server (or any Linux with Docker)
- Docker and Docker Compose installed
- (Optional) Cloudflare account for tunnel/proxy

### 1. Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url> subtrack
cd subtrack

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Important**: Update these values in `.env`:

```bash
# Database (change passwords!)
DB_PASSWORD=your_secure_password

# JWT Secrets (generate strong secrets)
JWT_SECRET=$(openssl rand -base64 64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64)

# Your domain
FRONTEND_URL=https://app.yourdomain.com
```

### 3. Start the Application

```bash
# Build and start all services
docker compose up -d

# Wait for services to be ready
sleep 30

# Run database migrations
docker compose exec backend npx prisma migrate deploy

# Create first super admin and tenant
./scripts/bootstrap.sh
```

### 4. Access the Application

- **Local**: http://localhost
- **API Docs**: http://localhost/api/docs
- **Health Check**: http://localhost/health

## Cloudflare Tunnel Setup (Recommended)

Using Cloudflare Tunnel is the **recommended** way to expose your application to the internet. It requires **no port forwarding** and provides automatic HTTPS.

### 1. Install cloudflared

```bash
# Download and install cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

This will open a browser to authenticate with Cloudflare.

### 3. Create a Tunnel

```bash
# Create tunnel
cloudflared tunnel create subtrack

# Note the tunnel ID from the output
export TUNNEL_ID=your-tunnel-id
```

### 4. Configure DNS

```bash
# Route your domain to the tunnel
cloudflared tunnel route dns $TUNNEL_ID app.yourdomain.com
```

### 5. Get Tunnel Token

```bash
# Get the tunnel token
cloudflared tunnel token $TUNNEL_ID
```

Copy this token and add it to your `.env`:

```bash
TUNNEL_TOKEN=your-tunnel-token
```

### 6. Start with Cloudflare Tunnel

```bash
# Start with cloudflared profile
docker compose --profile cloudflared up -d
```

### Cloudflare Configuration

In your Cloudflare Dashboard:

1. **SSL/TLS Mode**: Set to `Full (strict)`
2. **Always Use HTTPS**: Enabled
3. **Automatic HTTPS Rewrites**: Enabled
4. **Brotli Compression**: Enabled

### Alternative: Orange-Cloud Proxy (Not Recommended)

If you prefer using Cloudflare's orange-cloud proxy with port forwarding:

1. Point your domain A record to your server's public IP
2. Enable the orange cloud (proxy) in Cloudflare DNS
3. Open ports 80/443 on your firewall
4. Set SSL/TLS mode to `Full (strict)`

**Warning**: This exposes your server IP and requires port forwarding.

## Security Behind Cloudflare

### Cloudflare Access (Optional)

For additional security on admin routes:

1. Go to Cloudflare Dashboard > Zero Trust > Access
2. Create an Application
3. Add your admin URL (e.g., `app.yourdomain.com/admin/*`)
4. Configure identity providers

### WAF Rules

Recommended WAF rules in Cloudflare:

```
# Rate limiting
- 100 requests per minute per IP
- Block IPs with threat score > 50

# Country blocking (optional)
- Challenge or block countries you don't serve

# Bot fight mode
- Enable "Bot Fight Mode" for additional protection
```

### Rate Limiting

Nginx is configured with rate limiting:
- Login: 5 requests per minute
- API: 100 requests per minute

## Backup and Restore

### Create Backup

```bash
# Create a backup
./scripts/backup.sh

# Or with custom name
./scripts/backup.sh my_backup
```

Backups are stored in `./backups/` directory.

### Restore from Backup

```bash
# List available backups
ls -la ./backups/

# Restore from backup
./scripts/restore.sh ./backups/subtrack_backup_20240115_120000.tar.gz
```

### Automated Backups

Add to crontab for daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/subtrack && ./scripts/backup.sh >> /var/log/subtrack-backup.log 2>&1
```

## Troubleshooting

### 502 Bad Gateway

**Cause**: Backend or frontend not responding

**Solution**:
```bash
# Check container status
docker compose ps

# Check logs
docker compose logs backend
docker compose logs frontend

# Restart services
docker compose restart
```

### Wrong Redirect Scheme (HTTP/HTTPS)

**Cause**: Nginx not detecting forwarded protocol from Cloudflare

**Solution**:
1. Verify `X-Forwarded-Proto` header is set in Cloudflare
2. Check nginx configuration includes:
   ```
   set $forwarded_proto $http_x_forwarded_proto;
   if ($forwarded_proto = "") {
       set $forwarded_proto "http";
   }
   ```

### Real IP Not Showing

**Cause**: Cloudflare IP ranges not configured in nginx

**Solution**:
1. Verify nginx.conf includes all Cloudflare IP ranges
2. Check `real_ip_header CF-Connecting-IP;` is set
3. Restart nginx: `docker compose restart nginx`

### Cookie Issues Behind Proxy

**Cause**: SameSite/Secure cookie settings

**Solution**:
1. Ensure `SameSite=strict` and `Secure` flags are set
2. Verify HTTPS is working correctly
3. Check `FRONTEND_URL` in `.env` uses HTTPS

### Database Connection Issues

**Cause**: Database not ready or credentials incorrect

**Solution**:
```bash
# Check database container
docker compose logs postgres

# Verify database is healthy
docker compose exec postgres pg_isready -U subtrack

# Reset database (WARNING: data loss)
docker compose down -v
docker compose up -d postgres
sleep 10
docker compose exec backend npx prisma migrate deploy
```

## API Documentation

Once the application is running, API documentation is available at:

- Swagger UI: `https://yourdomain.com/api/docs`
- OpenAPI JSON: `https://yourdomain.com/api/docs-json`

## White-Label Configuration

Each tenant can customize their branding:

1. **Logo**: Upload in Settings > Branding
2. **Primary Color**: Set hex color code
3. **App Name**: Custom display name
4. **Custom CSS**: Advanced styling (optional)

## Alert Configuration

### Google Chat Webhook

1. In Google Chat, create a space or use existing
2. Go to space settings > Apps & Integrations
3. Add webhook, copy the URL
4. In SubTrack: Settings > Alerts > Add Channel
5. Paste webhook URL, select "Google Chat"

### Alert Rules

Configure which alerts to send:
- 14 days before renewal
- 7 days before renewal
- 3 days before renewal
- 1 day before renewal
- Overdue notifications
- Monthly summary (1st of month)
- Data quality alerts

### Quiet Hours

Set quiet hours to prevent alerts during non-business hours.

## Development

### Local Development

```bash
# Start infrastructure
docker compose up -d postgres redis

# Backend
cd backend
npm install
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev
```

### Database Migrations

```bash
# Create migration
docker compose exec backend npx prisma migrate dev --name your_migration_name

# Deploy migrations
docker compose exec backend npx prisma migrate deploy

# Generate client
docker compose exec backend npx prisma generate
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

## Production Checklist

- [ ] Change all default passwords in `.env`
- [ ] Generate strong JWT secrets
- [ ] Configure proper CORS origins
- [ ] Set up automated backups
- [ ] Configure Cloudflare Tunnel or Proxy
- [ ] Enable Cloudflare security features
- [ ] Set up monitoring (optional)
- [ ] Configure log rotation
- [ ] Test backup/restore procedure
- [ ] Review RBAC permissions
- [ ] Enable audit logging

## Directory Structure

```
subtrack/
├── backend/           # NestJS backend
│   ├── src/          # Source code
│   ├── prisma/       # Database schema
│   └── Dockerfile
├── frontend/          # Next.js frontend
│   ├── app/          # Next.js app
│   ├── components/   # React components
│   └── Dockerfile
├── nginx/            # Nginx configuration
│   ├── nginx.conf
│   └── conf.d/
├── cloudflared/      # Cloudflare Tunnel config
│   └── config.yml
├── scripts/          # Utility scripts
│   ├── backup.sh
│   ├── restore.sh
│   ├── seed.sh
│   └── bootstrap.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please use GitHub Issues.

---

**Built with ❤️ for subscription management**
