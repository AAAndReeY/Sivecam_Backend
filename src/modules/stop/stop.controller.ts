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
import { JwtAuthGuard, CustomRoleGuard, LayerKey, ModuleOp } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@LayerKey('paraderosAutorizados')
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

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateStopDto) {
    return this.stopService.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStopDto) {
    return this.stopService.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.stopService.toggleDelete(id);
  }

  @ModuleOp('create')
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
