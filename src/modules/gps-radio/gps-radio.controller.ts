import { Controller, Get, Patch, Put, Delete, Query, Param, Body, UseGuards, Req } from '@nestjs/common';
import { GpsRadioService } from './gps-radio.service';
import { JwtAuthGuard, CustomRoleGuard, LayerKey, ModuleKey, ModuleOp, NoLayer } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@LayerKey('radios')
@Controller('gps-radio')
export class GpsRadioController {
  constructor(private readonly gpsRadioService: GpsRadioService) {}

  @Get()
  findAll() {
    return this.gpsRadioService.findAll();
  }

  /** Asignaciones locales radio -> móvil (solo SIVECAM). */
  @Get('asignaciones')
  listarAsignaciones() {
    return this.gpsRadioService.listarAsignaciones();
  }

  /** Asigna la radio a una móvil en SIVECAM (no escribe en Dolphin). */
  @NoLayer()
  @ModuleKey('radios-gps')
  @ModuleOp('edit')
  @Put(':issi/asignacion')
  asignar(@Param('issi') issi: string, @Body() body: any, @Req() req: any) {
    return this.gpsRadioService.asignarRadio(issi, body, req.user?.username);
  }

  @NoLayer()
  @ModuleKey('radios-gps')
  @ModuleOp('edit')
  @Delete(':issi/asignacion')
  quitarAsignacion(@Param('issi') issi: string, @Req() req: any) {
    return this.gpsRadioService.quitarAsignacion(issi, req.user?.username);
  }

  @Get('historico')
  findHistorico(
    @Query('issi') issi: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('horaInicio') horaInicio: string,
    @Query('fechaFin') fechaFin: string,
    @Query('horaFin') horaFin: string,
  ) {
    return this.gpsRadioService.findHistorico(issi, fechaInicio, horaInicio || '00:00', fechaFin, horaFin || '23:59');
  }

  @Get('km-dias')
  findKmDias(
    @Query('issi') issi: string,
    @Query('fechaInicio') fechaInicio: string,
    @Query('fechaFin') fechaFin: string,
  ) {
    return this.gpsRadioService.findKmDias(issi, fechaInicio, fechaFin);
  }

  @Get('info')
  buscarIssi(@Query('issi') issi: string) {
    return this.gpsRadioService.buscarIssi(issi);
  }

  /** Escribe en Dolphin: exige el módulo "Radios GPS" con permiso de edición (no basta ver la capa). */
  @NoLayer()
  @ModuleKey('radios-gps')
  @ModuleOp('edit')
  @Patch(':issi')
  actualizarUnidad(@Param('issi') issi: string, @Body() body: any) {
    return this.gpsRadioService.actualizarUnidad(issi, body);
  }

  @Get('cercanos')
  findCercanos(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('metros') metros: string,
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
    @Query('horaInicio') horaInicio?: string,
    @Query('horaFin') horaFin?: string,
  ) {
    return this.gpsRadioService.findCercanos(
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(metros) || 500,
      fechaInicio,
      fechaFin,
      horaInicio,
      horaFin,
    );
  }
}
