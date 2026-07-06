import { PrismaClient, Role, Priority, TicketStatus, SLAStatus, Channel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';

  let adminPassword: string;
  let itsupportPassword: string;

  if (isProduction) {
    const raw = process.env.SEED_ADMIN_PASSWORD;
    const supportRaw = process.env.SEED_SUPPORT_PASSWORD;
    if (!raw || !supportRaw) {
      throw new Error(
        'Production seed requires SEED_ADMIN_PASSWORD and SEED_SUPPORT_PASSWORD environment variables.',
      );
    }
    adminPassword = await bcrypt.hash(raw, 12);
    itsupportPassword = await bcrypt.hash(supportRaw, 12);
  } else {
    adminPassword = await bcrypt.hash('Admin123!', 12);
    itsupportPassword = await bcrypt.hash('Support123!', 12);
  }

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: isProduction ? { password: adminPassword } : {},
    create: {
      email: 'admin@company.com',
      password: adminPassword,
      name: 'System Admin',
      role: Role.Admin,
    },
  });

  const itsupport = await prisma.user.upsert({
    where: { email: 'support@company.com' },
    update: isProduction ? { password: itsupportPassword } : {},
    create: {
      email: 'support@company.com',
      password: itsupportPassword,
      name: 'IT Support Agent',
      role: Role.ITSupport,
    },
  });

  const hardwareCategory = await prisma.category.upsert({
    where: { name: 'Hardware' },
    update: {},
    create: {
      name: 'Hardware',
      description: 'Hardware-related issues including computers, printers, and peripherals',
      slaConfigs: {
        create: [
          {
            priority: Priority.Low,
            responseTimeMinutes: 480,
            resolutionTimeMinutes: 2880,
          },
          {
            priority: Priority.Medium,
            responseTimeMinutes: 240,
            resolutionTimeMinutes: 1440,
          },
          {
            priority: Priority.High,
            responseTimeMinutes: 60,
            resolutionTimeMinutes: 480,
          },
          {
            priority: Priority.Critical,
            responseTimeMinutes: 15,
            resolutionTimeMinutes: 120,
          },
        ],
      },
    },
  });

  const softwareCategory = await prisma.category.upsert({
    where: { name: 'Software' },
    update: {},
    create: {
      name: 'Software',
      description: 'Software-related issues including applications, OS, and licensing',
      slaConfigs: {
        create: [
          {
            priority: Priority.Low,
            responseTimeMinutes: 480,
            resolutionTimeMinutes: 4320,
          },
          {
            priority: Priority.Medium,
            responseTimeMinutes: 240,
            resolutionTimeMinutes: 2880,
          },
          {
            priority: Priority.High,
            responseTimeMinutes: 60,
            resolutionTimeMinutes: 1440,
          },
          {
            priority: Priority.Critical,
            responseTimeMinutes: 15,
            resolutionTimeMinutes: 240,
          },
        ],
      },
    },
  });

  await prisma.subCategory.upsert({
    where: { categoryId_name: { categoryId: hardwareCategory.id, name: 'Desktop/Laptop' } },
    update: {},
    create: {
      categoryId: hardwareCategory.id,
      name: 'Desktop/Laptop',
      description: 'Desktop and laptop computer issues',
    },
  });

  await prisma.subCategory.upsert({
    where: { categoryId_name: { categoryId: hardwareCategory.id, name: 'Printer' } },
    update: {},
    create: {
      categoryId: hardwareCategory.id,
      name: 'Printer',
      description: 'Printer and scanner issues',
    },
  });

  await prisma.subCategory.upsert({
    where: { categoryId_name: { categoryId: softwareCategory.id, name: 'Email' } },
    update: {},
    create: {
      categoryId: softwareCategory.id,
      name: 'Email',
      description: 'Email client and server issues',
    },
  });

  await prisma.subCategory.upsert({
    where: { categoryId_name: { categoryId: softwareCategory.id, name: 'Application' } },
    update: {},
    create: {
      categoryId: softwareCategory.id,
      name: 'Application',
      description: 'Application-specific issues',
    },
  });

  const existingTicket = isProduction ? true : await prisma.ticket.findUnique({ where: { ticketNumber: 'TKT-001' } });

  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-001',
        subject: 'Cannot connect to company VPN',
        description: 'I am unable to connect to the company VPN from my laptop. It keeps timing out after authentication.',
        requesterId: admin.id,
        categoryId: softwareCategory.id,
        priority: Priority.High,
        status: TicketStatus.Open,
        channel: Channel.Web,
        slaDueAt: new Date(Date.now() + 60 * 60 * 1000),
        slaStatus: SLAStatus.OnTrack,
      },
    });
  }

  if (!isProduction) {
    const existingFaq = await prisma.faq.findFirst();
    if (!existingFaq) {
      await prisma.faq.createMany({
        data: [
          {
            question: 'How do I reset my password?',
            answer:
              'End users cannot reset their own password. Please contact Admin or ITSupport to request a password reset.',
            displayOrder: 0,
            isActive: true,
          },
          {
            question: 'What should I include in a ticket?',
            answer:
              'Provide a clear subject, select the relevant category and sub-category, and describe the issue with steps to reproduce and any error messages you see.',
            displayOrder: 1,
            isActive: true,
          },
          {
            question: 'Who can see my tickets?',
            answer:
              'Only you and the IT support staff assigned to your ticket can view your tickets.',
            displayOrder: 2,
            isActive: true,
          },
        ],
      });
    }
  }

  console.log('Seed data created successfully');
  if (!isProduction) {
    console.log(`Admin user: admin@company.com / Admin123!`);
    console.log(`Support user: support@company.com / Support123!`);
  } else {
    console.log('Admin user: admin@company.com (password set via SEED_ADMIN_PASSWORD)');
    console.log('Support user: support@company.com (password set via SEED_SUPPORT_PASSWORD)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
