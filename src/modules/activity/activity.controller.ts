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
import { Rol } from '@prisma/client';
import { ActivityService } from './activity.service';
import { CreateActivityDto, UpdateActivityDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { SearchDto } from '../../common/dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Roles(Rol.ADMINISTRATOR, Rol.CODISEC)
  @Get()
  findAll(@Query() dto: SearchDto) {
    return this.activityService.findAll(dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.CODISEC)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.activityService.findOne(id);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.CODISEC)
  @Post()
  create(@Body() dto: CreateActivityDto) {
    return this.activityService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.CODISEC)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.activityService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.CODISEC)
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.activityService.toggleDelete(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.activityService.upload(file);
  }
}
