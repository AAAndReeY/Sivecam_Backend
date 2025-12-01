import { Module } from '@nestjs/common';
import { NeighborhoodService } from './neighborhood.service';

@Module({
  providers: [NeighborhoodService],
})
export class NeighborhoodModule {}
