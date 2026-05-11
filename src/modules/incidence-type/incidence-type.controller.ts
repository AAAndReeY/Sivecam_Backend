import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { IncidenceTypeService } from './incidence-type.service';
import { CreateIncidenceTypeDto, UpdateIncidenceTypeDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';
import { SearchDto } from '../../common/dto';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('tipos-incidencia')
@Controller('incidence-type')
export class IncidenceTypeController {
  constructor(private readonly service: IncidenceTypeService) {}

  @Get()
  findAll(@Query() dto: SearchDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateIncidenceTypeDto) {
    return this.service.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIncidenceTypeDto) {
    return this.service.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.toggleDelete(id);
  }
}
