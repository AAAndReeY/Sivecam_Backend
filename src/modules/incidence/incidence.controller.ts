import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { IncidenceService } from './incidence.service';
import { FilterIncidenceDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.ADMINISTRATOR, Rol.SUPERVISOR)
@Controller('incidence')
export class IncidenceController {
  constructor(private readonly incidenceService: IncidenceService) {}

  @Get()
  findAll(@Query() dto: FilterIncidenceDto) {
    return this.incidenceService.findAll(dto);
  }
}
