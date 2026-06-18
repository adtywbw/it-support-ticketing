import { PrismaClient, Role, Priority, TicketStatus, SLAStatus, Channel } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      password: adminPassword,
      name: 'System Admin',
      role: Role.Admin,
    },
  });

  const itsupportPassword = await bcrypt.hash('Support123!', 12);

  const itsupport = await prisma.user.upsert({
    where: { email: 'support@company.com' },
    update: {},
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

  const existingTicket = await prisma.ticket.findFirst();

  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-000001`,
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

  console.log('Seed data created successfully');
  console.log(`Admin user: admin@company.com / Admin123!`);
  console.log(`Support user: support@company.com / Support123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
