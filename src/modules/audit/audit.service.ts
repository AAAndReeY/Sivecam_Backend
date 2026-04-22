import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    action: string;
    entity: string;
    entity_id: string;
    changes?: Record<string, any>;
    performed_by?: string;
  }) {
    await this.prisma.auditLog.create({ data });
  }

  async findAll(filters: {
    entity?: string;
    action?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { entity, action, search, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (entity) where.entity = entity;
    if (action) where.action = action;
    if (search) where.performed_by = { contains: search, mode: 'insensitive' };

    const [data, count] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, count };
  }
}
