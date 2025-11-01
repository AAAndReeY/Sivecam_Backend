import { Module } from '@nestjs/common';
import { MunicipalService } from './municipal.service';
import { MunicipalController } from './municipal.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [MunicipalController],
  providers: [MunicipalService, PrismaService],
})
export class MunicipalModule {}
