import { Module } from '@nestjs/common';
import { DefenseService } from './defense.service';
import { DefenseController } from './defense.controller';

@Module({
  controllers: [DefenseController],
  providers: [DefenseService],
})
export class DefenseModule {}
