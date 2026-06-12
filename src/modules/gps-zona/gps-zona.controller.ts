import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { GpsZonaService } from './gps-zona.service';
import { CreateGpsZonaDto, UpdateGpsZonaDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, LayerKey } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@LayerKey('cercosGps')
@Controller('gps-zona')
export class GpsZonaController {
  constructor(private readonly gpsZonaService: GpsZonaService) {}

  @Get()
  findAll() {
    return this.gpsZonaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gpsZonaService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateGpsZonaDto) {
    return this.gpsZonaService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGpsZonaDto) {
    return this.gpsZonaService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gpsZonaService.remove(id);
  }
}
