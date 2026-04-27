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
import { Rol } from '@prisma/client';
import { PnpIncidenceService } from './pnp-incidence.service';
import { CreatePnpIncidenceDto, UpdatePnpIncidenceDto, FilterPnpIncidenceDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pnp-incidence')
export class PnpIncidenceController {
  constructor(private readonly pnpIncidenceService: PnpIncidenceService) {}

  @Roles(Rol.ADMINISTRATOR, Rol.SUPERVISOR, Rol.PNP)
  @Get()
  findAll(@Query() dto: FilterPnpIncidenceDto) {
    return this.pnpIncidenceService.findAll(dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.SUPERVISOR, Rol.PNP)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pnpIncidenceService.findOne(id);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.PNP)
  @Post()
  create(@Body() dto: CreatePnpIncidenceDto) {
    return this.pnpIncidenceService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.PNP)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePnpIncidenceDto,
  ) {
    return this.pnpIncidenceService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.PNP)
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.pnpIncidenceService.toggleDelete(id);
  }
}
