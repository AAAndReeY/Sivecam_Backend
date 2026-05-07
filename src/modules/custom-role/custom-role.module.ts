import { Module } from '@nestjs/common';
import { CustomRoleController } from './custom-role.controller';
import { CustomRoleService } from './custom-role.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CustomRoleController],
  providers: [CustomRoleService],
  exports: [CustomRoleService],
})
export class CustomRoleModule {}
