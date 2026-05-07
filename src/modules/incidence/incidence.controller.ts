import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IncidenceService } from './incidence.service';
import { FilterIncidenceDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, LayerKey } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@LayerKey('robos')
@Controller('incidence')
export class IncidenceController {
  constructor(private readonly incidenceService: IncidenceService) {}

  @Get()
  findAll(@Query() dto: FilterIncidenceDto) {
    return this.incidenceService.findAll(dto);
  }
}
