import { PrismaClient, UserRole, UserStatus, BillingCycle, SubscriptionStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Check if data already exists
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
  });

  if (existingSuperAdmin) {
    console.log('Database already seeded. Skipping...');
    return;
  }

  // Create demo tenant
  console.log('Creating demo tenant...');
  const demoTenant = await prisma.tenant.create({
    data: {
      name: 'Demo Company',
      slug: 'demo',
      description: 'Demo tenant for testing',
      isActive: true,
    },
  });

  // Create tenant branding
  await prisma.tenantBranding.create({
    data: {
      tenantId: demoTenant.id,
      appName: 'Demo SubTrack',
      primaryColor: '#3b82f6',
    },
  });

  // Create alert settings
  await prisma.alertSettings.create({
    data: {
      tenantId: demoTenant.id,
      enable14Days: true,
      enable7Days: true,
      enable3Days: true,
      enableTomorrow: true,
      enableOverdue: true,
      enableMonthlySummary: true,
      enableDataQuality: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      timezone: 'UTC',
    },
  });

  // Create demo departments
  console.log('Creating demo departments...');
  const engineering = await prisma.department.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Engineering',
      description: 'Software development team',
      costCenter: 'ENG-001',
      isActive: true,
    },
  });

  const marketing = await prisma.department.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Marketing',
      description: 'Marketing and sales team',
      costCenter: 'MKT-001',
      isActive: true,
    },
  });

  const finance = await prisma.department.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Finance',
      description: 'Finance and accounting team',
      costCenter: 'FIN-001',
      isActive: true,
    },
  });

  // Hash passwords
  const adminPassword = await argon2.hash('Admin123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const userPassword = await argon2.hash('User123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create super admin
  console.log('Creating super admin...');
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@subtrack.local',
      passwordHash: adminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // Create tenant admin
  console.log('Creating tenant admin...');
  const tenantAdmin = await prisma.user.create({
    data: {
      tenantId: demoTenant.id,
      email: 'tenant@subtrack.local',
      passwordHash: adminPassword,
      firstName: 'Tenant',
      lastName: 'Admin',
      role: UserRole.TENANT_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // Create department users
  const engineer = await prisma.user.create({
    data: {
      tenantId: demoTenant.id,
      email: 'engineer@subtrack.local',
      passwordHash: userPassword,
      firstName: 'John',
      lastName: 'Engineer',
      role: UserRole.MANAGER,
      status: UserStatus.ACTIVE,
    },
  });

  const marketer = await prisma.user.create({
    data: {
      tenantId: demoTenant.id,
      email: 'marketing@subtrack.local',
      passwordHash: userPassword,
      firstName: 'Jane',
      lastName: 'Marketer',
      role: UserRole.VIEWER,
      status: UserStatus.ACTIVE,
    },
  });

  // Create demo subscriptions
  console.log('Creating demo subscriptions...');
  const now = new Date();

  await prisma.subscription.createMany({
    data: [
      {
        tenantId: demoTenant.id,
        vendorName: 'GitHub',
        serviceName: 'GitHub Enterprise',
        planName: 'Enterprise',
        description: 'Source code repository',
        amount: 210.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: engineering.id,
        ownerId: engineer.id,
        costCenter: 'ENG-001',
        tags: ['dev', 'critical'],
        notes: 'Main code repository for all projects',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'Slack',
        serviceName: 'Slack Pro',
        planName: 'Pro Plan',
        description: 'Team communication',
        amount: 150.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 12, 15),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 15),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: engineering.id,
        ownerId: tenantAdmin.id,
        costCenter: 'ENG-001',
        tags: ['communication', 'critical'],
        notes: 'Company-wide communication',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'AWS',
        serviceName: 'Amazon Web Services',
        planName: 'Pay as you go',
        description: 'Cloud infrastructure',
        amount: 2500.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 24, 1),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: engineering.id,
        ownerId: engineer.id,
        costCenter: 'ENG-001',
        tags: ['infrastructure', 'critical'],
        notes: 'Production infrastructure',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'HubSpot',
        serviceName: 'HubSpot Marketing',
        planName: 'Professional',
        description: 'Marketing automation',
        amount: 800.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 3, 10),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 10),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: marketing.id,
        ownerId: marketer.id,
        costCenter: 'MKT-001',
        tags: ['marketing', 'automation'],
        notes: 'Lead generation and nurturing',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'Adobe',
        serviceName: 'Adobe Creative Cloud',
        planName: 'Team',
        description: 'Design tools',
        amount: 600.0,
        currency: 'USD',
        billingCycle: BillingCycle.ANNUAL,
        startDate: new Date(now.getFullYear() - 1, now.getMonth(), 1),
        nextRenewalDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: marketing.id,
        ownerId: marketer.id,
        costCenter: 'MKT-001',
        tags: ['design', 'creative'],
        notes: 'Design team licenses',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'QuickBooks',
        serviceName: 'QuickBooks Online',
        planName: 'Advanced',
        description: 'Accounting software',
        amount: 200.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 18, 5),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 5),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: finance.id,
        ownerId: tenantAdmin.id,
        costCenter: 'FIN-001',
        tags: ['accounting', 'finance'],
        notes: 'Company accounting',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'Zoom',
        serviceName: 'Zoom Meetings',
        planName: 'Business',
        description: 'Video conferencing',
        amount: 199.9,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 8, 20),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 20),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: engineering.id,
        ownerId: tenantAdmin.id,
        costCenter: 'ENG-001',
        tags: ['communication', 'meetings'],
        notes: 'Company-wide video conferencing',
        createdBy: superAdmin.id,
      },
      {
        tenantId: demoTenant.id,
        vendorName: 'Datadog',
        serviceName: 'Datadog Monitoring',
        planName: 'Pro',
        description: 'Infrastructure monitoring',
        amount: 450.0,
        currency: 'USD',
        billingCycle: BillingCycle.MONTHLY,
        startDate: new Date(now.getFullYear(), now.getMonth() - 4, 12),
        nextRenewalDate: new Date(now.getFullYear(), now.getMonth() + 1, 12),
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
        departmentId: engineering.id,
        ownerId: engineer.id,
        costCenter: 'ENG-001',
        tags: ['monitoring', 'devops'],
        notes: 'Application and infrastructure monitoring',
        createdBy: superAdmin.id,
      },
    ],
  });

  // Create alert channel
  console.log('Creating demo alert channel...');
  await prisma.alertChannel.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Default Google Chat',
      type: 'GOOGLE_CHAT',
      webhookUrl: 'https://chat.googleapis.com/v1/spaces/PLACEHOLDER/messages',
      isActive: false, // Disabled by default
      config: {},
    },
  });

  console.log('Database seed completed successfully!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Super Admin: admin@subtrack.local / Admin123!');
  console.log('  Tenant Admin: tenant@subtrack.local / Admin123!');
  console.log('  User: engineer@subtrack.local / User123!');
  console.log('  User: marketing@subtrack.local / User123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
