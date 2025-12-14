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
import { WasteService } from './waste.service';
import { CreateWasteDto, FilterWasteDto, UpdateWasteDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('waste')
export class WasteController {
  constructor(private readonly wasteService: WasteService) {}

  @Get()
  findAll(@Query() dto: FilterWasteDto) {
    return this.wasteService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.wasteService.findOne(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post()
  create(@Body() dto: CreateWasteDto) {
    return this.wasteService.create(dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWasteDto) {
    return this.wasteService.update(id, dto);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.wasteService.toggleDelete(id);
  }

  @Roles(Rol.ADMINISTRATOR)
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.wasteService.upload(file);
  }
}
