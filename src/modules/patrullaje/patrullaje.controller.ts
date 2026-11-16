import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseFloatPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CustomRoleGuard, JwtAuthGuard, ModuleKey, ModuleOp } from '../auth/guard';
import { DespachoService } from './despacho.service';
import { AlertasService } from './alertas.service';
import { SupervisionService } from './supervision.service';
import { AsignarDto, CerrarDto, GenerarRutasDto, RutaManualDto, ServicioDto, TipoIncidenciaDto } from './dto';
import { MovilesService } from './moviles.service';
import { PatrullajeService } from './patrullaje.service';
import { parseShift } from './turnos.util';

const tipoRecurso = (v: string) => {
  const t = String(v ?? '').toUpperCase();
  if (t !== 'MOVIL' && t !== 'RADIO' && t !== 'BODYCAM') throw new BadRequestException('tipo debe ser MOVIL, RADIO o BODYCAM');
  return t as 'MOVIL' | 'RADIO' | 'BODYCAM';
};

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
    private readonly alertas: AlertasService,
    private readonly supervision: SupervisionService,
  ) {}

  @Get('estado')
  estado() {
    return this.patrullaje.estado();
  }

  @Get('moviles')
  listarMoviles() {
    return this.moviles.listar();
  }

  /** Personal a pie (radios portátiles y bodycams) para el tablero y el buscador. */
  @Get('a-pie')
  listarAPie() {
    return this.moviles.listarAPie();
  }

  /** Recorrido de una unidad: últimas `horas` o un rango `desde`/`hasta` (ISO), para dibujarlo o reproducirlo. */
  @Get('recursos/:tipo/:id/recorrido')
  recorrido(
    @Param('tipo') tipo: string,
    @Param('id') id: string,
    @Query('horas') horas?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const fin = hasta ? new Date(hasta) : new Date();
    const ini = desde ? new Date(desde) : new Date(fin.getTime() - num(horas, 2, 1, 24) * 3600 * 1000);
    if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime()) || fin <= ini) throw new BadRequestException('Rango de fechas inválido');
    if (fin.getTime() - ini.getTime() > 48 * 3600 * 1000) throw new BadRequestException('El rango no puede pasar de 48 h');
    return this.moviles.recorrido(tipoRecurso(tipo), id, ini, fin);
  }

  /** Cobertura real del turno: puntos GPS de las móviles con ruta (mapa de calor) y zonas de riesgo cubiertas. */
  @Get('cobertura')
  cobertura(@Query('fecha') fecha?: string, @Query('turno') turno?: string) {
    return this.supervision.cobertura(fecha, parseShift(turno));
  }

  /** Fuera de servicio / volver al servicio, marcado por la torre. */
  @ModuleOp('edit')
  @Patch('recursos/:tipo/:id/servicio')
  async servicio(@Param('tipo') tipo: string, @Param('id') id: string, @Body() dto: ServicioDto, @Req() req: any) {
    const t = tipoRecurso(tipo);
    const r = await this.moviles.marcarServicio(t, id, dto.fuera_servicio, dto.motivo, req.user?.username);
    await this.alertas.auditar(dto.fuera_servicio ? 'FUERA_DE_SERVICIO' : 'VUELVE_AL_SERVICIO', `${t}:${id}`, { motivo: dto.motivo }, req.user?.username);
    return r;
  }

  /** Alertas automáticas: activas e historial de las últimas horas. */
  @Get('alertas')
  listarAlertas(@Query('horas') horas?: string) {
    return this.alertas.listar(num(horas, 24, 1, 24 * 7));
  }

  @ModuleOp('edit')
  @Patch('alertas/:id/atender')
  atenderAlerta(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.alertas.atender(id, req.user?.username);
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
  constructor(
    private readonly despacho: DespachoService,
    private readonly supervision: SupervisionService,
  ) {}

  /** Indicadores de un turno (informe a la Subgerencia). */
  @Get('indicadores')
  indicadores(@Query('fecha') fecha?: string, @Query('turno') turno?: string) {
    return this.supervision.indicadores(fecha, parseShift(turno));
  }

  /** Bitácora: quién despachó, canceló, cerró o cambió rutas. `incidencia` filtra por código o unidad. */
  @Get('bitacora')
  bitacora(@Query('horas') horas?: string, @Query('incidencia') incidencia?: string) {
    return this.supervision.bitacora(num(horas, 24, 1, 24 * 31), incidencia);
  }

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
    return this.despacho.cerrar(id, false, dto, req.user?.username);
  }

  @ModuleOp('edit')
  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarDto, @Req() req: any) {
    return this.despacho.cerrar(id, true, dto, req.user?.username);
  }

  /** Prioridad y nombre corto por tipo de incidencia (lo que la torre configuró y los valores por defecto). */
  @Get('tipos')
  tipos() {
    return this.despacho.tipos();
  }

  @ModuleOp('edit')
  @Put('tipos')
  guardarTipo(@Body() dto: TipoIncidenciaDto, @Req() req: any) {
    return this.despacho.guardarTipo(dto, req.user?.username);
  }
}
