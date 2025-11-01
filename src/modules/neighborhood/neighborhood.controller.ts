import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { NeighborhoodService } from './neighborhood.service';
import { CreateNeighborhoodDto } from './dto/create-neighborhood.dto';
import { UpdateNeighborhoodDto } from './dto/update-neighborhood.dto';

@Controller('neighborhood')
export class NeighborhoodController {
  constructor(private readonly neighborhoodService: NeighborhoodService) {}

  @Post()
  create(@Body() createNeighborhoodDto: CreateNeighborhoodDto) {
    return this.neighborhoodService.create(createNeighborhoodDto);
  }

  @Get()
  findAll() {
    return this.neighborhoodService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.neighborhoodService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNeighborhoodDto: UpdateNeighborhoodDto,
  ) {
    return this.neighborhoodService.update(+id, updateNeighborhoodDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.neighborhoodService.remove(+id);
  }
}
