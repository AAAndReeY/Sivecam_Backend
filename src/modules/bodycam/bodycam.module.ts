import { Module } from '@nestjs/common';
import { BodycamService } from './bodycam.service';
import { BodycamController } from './bodycam.controller';

@Module({
  controllers: [BodycamController],
  providers: [BodycamService],
  exports: [BodycamService],
})
export class BodycamModule {}
