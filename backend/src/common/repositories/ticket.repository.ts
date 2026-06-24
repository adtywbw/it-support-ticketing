import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.TicketCreateInput, include?: Prisma.TicketInclude) {
    return this.prisma.ticket.create({ data, include }) as any;
  }

  async findById(id: string, include?: Prisma.TicketInclude) {
    return this.prisma.ticket.findUnique({ where: { id }, include }) as any;
  }

  async findUnique(args: Prisma.TicketFindUniqueArgs) {
    return this.prisma.ticket.findUnique(args) as any;
  }

  async findMany(args: Prisma.TicketFindManyArgs) {
    return this.prisma.ticket.findMany(args) as any;
  }

  async findFirst(args: Prisma.TicketFindFirstArgs) {
    return this.prisma.ticket.findFirst(args) as any;
  }

  async count(where: Prisma.TicketWhereInput) {
    return this.prisma.ticket.count({ where });
  }

  async update(id: string, data: Prisma.TicketUpdateInput) {
    return this.prisma.ticket.update({ where: { id }, data }) as any;
  }

  async updateMany(where: Prisma.TicketWhereInput, data: Prisma.TicketUpdateManyMutationInput) {
    return this.prisma.ticket.updateMany({ where, data });
  }

  async delete(id: string) {
    return this.prisma.ticket.delete({ where: { id } }) as any;
  }

  async groupBy(args: any) {
    return this.prisma.ticket.groupBy(args) as any;
  }

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) {
    return this.prisma.$transaction(fn, options);
  }

  async transactionBatch(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
