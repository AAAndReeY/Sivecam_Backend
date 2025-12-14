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
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Rol } from '@prisma/client';
import { MunicipalService } from './municipal.service';
import {
  CreateMunicipalDto,
  FilterMunicipalDto,
  UpdateMunicipalDto,
} from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { Request } from 'express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('municipal')
export class MunicipalController {
  constructor(private readonly municipalService: MunicipalService) {}

  @Roles(Rol.ADMINISTRATOR, Rol.OPERATOR, Rol.SUPERVISOR, Rol.VIEWER)
  @Get()
  findAll(@Query() dto: FilterMunicipalDto, @Req() req: Request) {
    return this.municipalService.findAll(dto, req.user);
  }

  @Roles(Rol.ADMINISTRATOR, Rol.OPERATOR, Rol.SUPERVISOR, Rol.VIEWER)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.municipalService.findOne(id, req.user);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post()
  create(@Body() dto: CreateMunicipalDto) {
    return this.municipalService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMunicipalDto,
  ) {
    return this.municipalService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.municipalService.toggleDelete(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.upload(file);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('angle')
  @UseInterceptors(FileInterceptor('file'))
  @SuccessMessage('Actualización masiva exitosa')
  angle(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.angle(file);
  }
}
