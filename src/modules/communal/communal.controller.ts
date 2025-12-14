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
import { CommunalService } from './communal.service';
import { CreateCommunalDto, FilterCommunalDto, UpdateCommunalDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('communal')
export class CommunalController {
  constructor(private readonly communalService: CommunalService) {}

  @Get()
  findAll(@Query() dto: FilterCommunalDto) {
    return this.communalService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.communalService.findOne(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post()
  create(@Body() dto: CreateCommunalDto) {
    return this.communalService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunalDto,
  ) {
    return this.communalService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Delete(':id')
  toggleDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.communalService.toggleDelete(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.communalService.upload(file);
  }
}
