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
import { MunicipalService } from './municipal.service';
import {
  CreateMunicipalDto,
  FilterMunicipalDto,
  UpdateMunicipalDto,
} from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../../auth/guard';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATOR')
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Post()
  create(@Body() dto: CreateMunicipalDto) {
    return this.municipalService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMunicipalDto,
  ) {
    return this.municipalService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.municipalService.toggleDelete(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.upload(file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR')
  @Post('radius')
  @UseInterceptors(FileInterceptor('file'))
  radius(@UploadedFile() file: Express.Multer.File) {
    return this.municipalService.radius(file);
  }
}
