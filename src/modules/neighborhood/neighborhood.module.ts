import { Module } from '@nestjs/common';
import { NeighborhoodService } from './neighborhood.service';
import { NeighborhoodController } from './neighborhood.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [NeighborhoodController],
  providers: [NeighborhoodService, PrismaService],
})
export class NeighborhoodModule {}
