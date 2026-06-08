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
import { CampaignPointService } from './campaign-point.service';
import {
  CreateCampaignPointDto,
  FilterCampaignPointDto,
  UpdateCampaignPointDto,
} from './dto';
import { JwtAuthGuard, CustomRoleGuard, LayerKey, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@Controller('campaign-point')
export class CampaignPointController {
  constructor(private readonly campaignPointService: CampaignPointService) {}

  @LayerKey('puntosCampana')
  @Get()
  findAll(@Query() dto: FilterCampaignPointDto) {
    return this.campaignPointService.findAll(dto);
  }

  @LayerKey('puntosCampana')
  @Get('categories')
  categories() {
    return this.campaignPointService.categories();
  }

  @LayerKey('puntosCampana')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignPointService.findOne(id);
  }

  @ModuleKey('puntos-campana')
  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateCampaignPointDto) {
    return this.campaignPointService.create(dto);
  }

  @ModuleKey('puntos-campana')
  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignPointDto,
  ) {
    return this.campaignPointService.update(id, dto);
  }

  @ModuleKey('puntos-campana')
  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignPointService.toggleDelete(id);
  }
}
