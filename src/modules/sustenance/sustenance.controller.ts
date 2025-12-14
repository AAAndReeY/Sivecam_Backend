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
import { SustenanceService } from './sustenance.service';
import { CreateSustenanceDto, UpdateSustenanceDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { SearchDto } from '../../common/dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sustenance')
export class SustenanceController {
  constructor(private readonly sustenanceService: SustenanceService) {}

  @Get()
  findAll(@Query() dto: SearchDto) {
    return this.sustenanceService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sustenanceService.findOne(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post()
  create(@Body() dto: CreateSustenanceDto) {
    return this.sustenanceService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSustenanceDto,
  ) {
    return this.sustenanceService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.sustenanceService.toggleDelete(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.sustenanceService.upload(file);
  }
}
