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
import { MunicipalService } from './municipal.service';
import {
  CreateMunicipalDto,
  FilterMunicipalDto,
  UpdateMunicipalDto,
} from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { Request } from 'express';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('camaras-municipales')
@Controller('municipal')
export class MunicipalController {
  constructor(private readonly municipalService: MunicipalService) {}

  @Get()
  findAll(@Query() dto: FilterMunicipalDto, @Req() req: Request) {
    return this.municipalService.findAll(dto, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.municipalService.findOne(id, req.user);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateMunicipalDto) {
    return this.municipalService.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMunicipalDto,
  ) {
    return this.municipalService.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.municipalService.toggleDelete(id);
  }

  @ModuleOp('create')
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.upload(file);
  }

  @ModuleOp('edit')
  @Post('angle')
  @UseInterceptors(FileInterceptor('file'))
  @SuccessMessage('Actualización masiva exitosa')
  angle(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.angle(file);
  }
}
