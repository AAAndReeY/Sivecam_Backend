import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { IncidenceSubtypeService } from './incidence-subtype.service';
import { CreateIncidenceSubtypeDto, UpdateIncidenceSubtypeDto, FilterIncidenceSubtypeDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('subtipos-incidencia')
@Controller('incidence-subtype')
export class IncidenceSubtypeController {
  constructor(private readonly service: IncidenceSubtypeService) {}

  @Get()
  findAll(@Query() dto: FilterIncidenceSubtypeDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateIncidenceSubtypeDto) {
    return this.service.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidenceSubtypeDto) {
    return this.service.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleDelete(id);
  }
}
