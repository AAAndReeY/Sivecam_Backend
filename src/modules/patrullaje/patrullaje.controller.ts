import {
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomRoleGuard, JwtAuthGuard, ModuleKey, ModuleOp } from '../auth/guard';
import { DespachoService } from './despacho.service';
import { AsignarDto, CerrarDto, GenerarRutasDto, RutaManualDto } from './dto';
import { MovilesService } from './moviles.service';
import { PatrullajeService } from './patrullaje.service';
import { parseShift } from './turnos.util';

const num = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

/** Rutas de patrullaje: inteligentes (motor predictivo) y manuales (orden de subgerencia / alcaldía). */
@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('patrullaje')
@Controller('patrullaje')
export class PatrullajeController {
  constructor(
    private readonly patrullaje: PatrullajeService,
    private readonly moviles: MovilesService,
  ) {}

  @Get('estado')
  estado() {
    return this.patrullaje.estado();
  }

  @Get('moviles')
  listarMoviles() {
    return this.moviles.listar();
  }

  /** Zonas de riesgo del turno: `top` por cada jurisdicción. */
  @Get('hotspots')
  hotspots(@Query('turno') turno?: string, @Query('top') top?: string) {
    return this.patrullaje.hotspots(parseShift(turno), num(top, 5, 1, 30));
  }

  /** Polígonos (GeoJSON) de las jurisdicciones, con el mismo id que usan las zonas de riesgo. */
  @Get('jurisdicciones')
  jurisdicciones() {
    return this.patrullaje.jurisdicciones();
  }

  @Get('planes')
  planes(@Query('fecha') fecha?: string, @Query('turno') turno?: string, @Query('todos') todos?: string) {
    return this.patrullaje.listarPlanes(fecha, parseShift(turno), todos === 'true');
  }

  @ModuleOp('create')
  @Post('planes/generar')
  generar(@Body() dto: GenerarRutasDto, @Req() req: any) {
    return this.patrullaje.generar(dto, req.user?.username);
  }

  @ModuleKey('rutas-manuales')
  @ModuleOp('create')
  @Post('planes/manual')
  manual(@Body() dto: RutaManualDto, @Req() req: any) {
    return this.patrullaje.crearManual(dto, req.user?.username);
  }

  @ModuleOp('edit')
  @Patch('planes/:id/anular')
  anular(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.patrullaje.anular(id, req.user?.username);
  }

  @Post('planes/:id/verificar')
  verificar(@Param('id', ParseUUIDPipe) id: string, @Query('desde') desde?: string) {
    return this.patrullaje.verificar(id, desde === 'turno');
  }

  @Post('planes/verificar-turno')
  verificarTurno(@Query('fecha') fecha?: string, @Query('turno') turno?: string, @Query('desde') desde?: string) {
    return this.patrullaje.verificarTurno(fecha, parseShift(turno), desde === 'turno');
  }
}

/** Despacho asistido: la torre ve la móvil sugerida y confirma; la llegada se detecta por GPS. */
@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('despacho')
@Controller('despacho')
export class DespachoController {
  constructor(private readonly despacho: DespachoService) {}

  @Get('incidencias')
  incidencias(@Query('horas') horas?: string) {
    return this.despacho.incidenciasRecientes(num(horas, 12, 1, 72));
  }

  @Get('sugerir')
  sugerir(@Query('lat', ParseFloatPipe) lat: number, @Query('lng', ParseFloatPipe) lng: number, @Req() req: any) {
    return this.despacho.sugerir(lat, lng, req.user);
  }

  @Get()
  listar(@Query('horas') horas?: string) {
    return this.despacho.listar(num(horas, 24, 1, 24 * 31));
  }

  @Get('metricas')
  metricas(@Query('horas') horas?: string) {
    return this.despacho.metricas(num(horas, 24 * 7, 1, 24 * 90));
  }

  @ModuleOp('create')
  @Post('asignar')
  asignar(@Body() dto: AsignarDto, @Req() req: any) {
    return this.despacho.asignar(dto, req.user?.username);
  }

  @ModuleOp('edit')
  @Patch(':id/llegada')
  llegada(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.despacho.marcarLlegada(id, req.user?.username);
  }

  @ModuleOp('edit')
  @Patch(':id/cerrar')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarDto, @Req() req: any) {
    return this.despacho.cerrar(id, false, dto.notas, req.user?.username);
  }

  @ModuleOp('edit')
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarDto, @Req() req: any) {
    return this.despacho.cerrar(id, true, dto.notas, req.user?.username);
  }
}
