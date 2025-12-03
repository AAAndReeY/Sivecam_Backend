import { Module } from '@nestjs/common';
import { MunicipalService } from './municipal.service';
import { MunicipalController } from './municipal.controller';

@Module({
  controllers: [MunicipalController],
  providers: [MunicipalService],
})
export class MunicipalModule {}
