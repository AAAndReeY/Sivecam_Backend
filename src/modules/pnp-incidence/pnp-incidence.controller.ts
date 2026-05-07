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
  create(@Body() dto: CreatePnpIncidenceDto) {
    return this.pnpIncidenceService.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePnpIncidenceDto,
  ) {
    return this.pnpIncidenceService.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.pnpIncidenceService.toggleDelete(id);
  }
}
