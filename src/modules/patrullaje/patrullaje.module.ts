import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BodycamModule } from '../bodycam/bodycam.module';
import { GpsRadioModule } from '../gps-radio/gps-radio.module';
import { AlertasService } from './alertas.service';
import { CamarasService } from './camaras.service';
import { DespachoService } from './despacho.service';
import { MovilesService } from './moviles.service';
import { DespachoController, PatrullajeController } from './patrullaje.controller';
import { PatrullajeService } from './patrullaje.service';
import { PrediccionClient } from './prediccion.client';
import { SupervisionService } from './supervision.service';

/**
 * Prueba piloto de MIT: rutas inteligentes por turno, rutas manuales y despacho asistido.
 * Ubicación de las móviles = radio TETRA fija (Dolphin). Zonas de riesgo = motor predictivo.
 */
@Module({
  imports: [GpsRadioModule, BodycamModule, AuditModule],
  controllers: [PatrullajeController, DespachoController],
  providers: [PatrullajeService, DespachoService, MovilesService, PrediccionClient, CamarasService, AlertasService, SupervisionService],
})
export class PatrullajeModule {}
