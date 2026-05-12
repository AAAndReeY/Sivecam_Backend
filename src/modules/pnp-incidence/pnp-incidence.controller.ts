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
  Request,
} from '@nestjs/common';
import { PnpIncidenceService } from './pnp-incidence.service';
import { CreatePnpIncidenceDto, UpdatePnpIncidenceDto, FilterPnpIncidenceDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('incidencias-pnp')
@Controller('pnp-incidence')
export class PnpIncidenceController {
  constructor(private readonly pnpIncidenceService: PnpIncidenceService) {}

  @Get()
  findAll(@Query() dto: FilterPnpIncidenceDto) {
    return this.pnpIncidenceService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pnpIncidenceService.findOne(id);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreatePnpIncidenceDto, @Request() req) {
    return this.pnpIncidenceService.create(dto, req.user);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePnpIncidenceDto,
    @Request() req,
  ) {
    return this.pnpIncidenceService.update(id, dto, req.user);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.pnpIncidenceService.toggleDelete(id, req.user);
  }
}
