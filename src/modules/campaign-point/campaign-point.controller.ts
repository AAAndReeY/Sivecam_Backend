import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { CampaignPointService } from './campaign-point.service';
import { FilterCampaignPointDto } from './dto';

/** Endpoints públicos — no requieren autenticación */
@Controller('campaign-point')
export class CampaignPointController {
  constructor(private readonly campaignPointService: CampaignPointService) {}

  @Get()
  findAll(@Query() dto: FilterCampaignPointDto) {
    return this.campaignPointService.findAll(dto);
  }

  @Get('categories')
  categories() {
    return this.campaignPointService.categories();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignPointService.findOne(id);
  }
}
