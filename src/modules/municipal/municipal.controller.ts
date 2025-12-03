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
import { MunicipalService } from './municipal.service';
import {
  CreateMunicipalDto,
  FilterMunicipalDto,
  UpdateMunicipalDto,
} from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('municipal')
export class MunicipalController {
  constructor(private readonly municipalService: MunicipalService) {}

  @Get()
  findAll(@Query() dto: FilterMunicipalDto) {
    return this.municipalService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.municipalService.findOne(id);
  }

  @Roles('ADMINISTRATOR')
  @Post()
  create(@Body() dto: CreateMunicipalDto) {
    return this.municipalService.create(dto);
  }

  @Roles('ADMINISTRATOR')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMunicipalDto,
  ) {
    return this.municipalService.update(id, dto);
  }

  @Roles('ADMINISTRATOR')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.municipalService.toggleDelete(id);
  }


  @Roles('ADMINISTRATOR')
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.upload(file);
  }

  @Roles('ADMINISTRATOR')
  @Post('radius')
  @UseInterceptors(FileInterceptor('file'))
  @SuccessMessage('Actualización masiva exitosa')
  radius(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.radius(file);
  }
}
