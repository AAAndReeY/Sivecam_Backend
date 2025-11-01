import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { MunicipalService } from './municipal.service';
import { CreateMunicipalDto } from './dto/create-municipal.dto';
import { UpdateMunicipalDto } from './dto/update-municipal.dto';

@Controller('municipal')
export class MunicipalController {
  constructor(private readonly municipalService: MunicipalService) {}

  @Post()
  create(@Body() createMunicipalDto: CreateMunicipalDto) {
    return this.municipalService.create(createMunicipalDto);
  }

  @Get()
  findAll() {
    return this.municipalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.municipalService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMunicipalDto: UpdateMunicipalDto,
  ) {
    return this.municipalService.update(+id, updateMunicipalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.municipalService.remove(+id);
  }
}
