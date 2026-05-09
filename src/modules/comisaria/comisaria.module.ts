import { Module } from '@nestjs/common';
import { ComisariaService } from './comisaria.service';
import { ComisariaController } from './comisaria.controller';

@Module({
  controllers: [ComisariaController],
  providers: [ComisariaService],
})
export class ComisariaModule {}
