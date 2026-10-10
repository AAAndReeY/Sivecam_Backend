import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { BodycamService } from './bodycam.service';
import { JwtAuthGuard, CustomRoleGuard, LayerKey } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@Controller('bodycams')
export class BodycamController {
  constructor(private readonly bodycamService: BodycamService) {}

  // Lista con última ubicación (capa, búsqueda, rutas y gestión de bodycams)
  @Get()
  @LayerKey('bodycams')
  findAll() {
    return this.bodycamService.findAll();
  }

  // Recorrido de una bodycam (capa "Rutas Bodycams")
  @Get(':codigo/ubicaciones')
  @LayerKey('rutasBodycams')
  findUbicaciones(
    @Param('codigo') codigo: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limite') limite?: string,
  ) {
    return this.bodycamService.findUbicaciones(codigo, desde, hasta, limite);
  }
}
