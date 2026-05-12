import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { IncidenceModalityService } from './incidence-modality.service';
import { CreateIncidenceModalityDto, UpdateIncidenceModalityDto, FilterIncidenceModalityDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('modalidades-incidencia')
@Controller('incidence-modality')
export class IncidenceModalityController {
  constructor(private readonly service: IncidenceModalityService) {}

  @Get()
  findAll(@Query() dto: FilterIncidenceModalityDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateIncidenceModalityDto) {
    return this.service.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidenceModalityDto) {
    return this.service.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleDelete(id);
  }
}
