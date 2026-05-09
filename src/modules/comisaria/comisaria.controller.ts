import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ComisariaService } from './comisaria.service';
import { CreateComisariaDto, UpdateComisariaDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, LayerKey, ModuleOp } from '../auth/guard';
import { SearchDto } from '../../common/dto';
import { Request } from 'express';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@LayerKey('comisarias')
@Controller('comisaria')
export class ComisariaController {
  constructor(private readonly comisariaService: ComisariaService) {}

  @Get()
  findAll(@Query() dto: SearchDto, @Req() req: Request) {
    return this.comisariaService.findAll(dto, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.comisariaService.findOne(id, req.user);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateComisariaDto) {
    return this.comisariaService.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComisariaDto,
  ) {
    return this.comisariaService.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.comisariaService.toggleDelete(id);
  }
}
