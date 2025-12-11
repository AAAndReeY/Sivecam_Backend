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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StopService } from './stop.service';
import { CreateStopDto, FilterStopDto, UpdateStopDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stop')
export class StopController {
  constructor(private readonly stopService: StopService) {}

  @Get()
  findAll(@Query() dto: FilterStopDto) {
    return this.stopService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stopService.findOne(id);
  }

  @Roles('ADMINISTRATOR')
  @Post()
  create(@Body() dto: CreateStopDto) {
    return this.stopService.create(dto);
  }

  @Roles('ADMINISTRATOR')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStopDto) {
    return this.stopService.update(id, dto);
  }

  @Roles('ADMINISTRATOR')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.stopService.toggleDelete(id);
  }

  @Roles('ADMINISTRATOR')
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: { authorized: string },
  ) {
    return this.stopService.upload(file, dto);
  }
}
