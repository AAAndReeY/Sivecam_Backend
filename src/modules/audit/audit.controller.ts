import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey } from '../auth/guard';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('auditoria')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.auditService.findAll({
      entity: query.entity || undefined,
      action: query.action || undefined,
      search: query.search || undefined,
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 20,
    });
  }
}
