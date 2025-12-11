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
import { DefenseService } from './defense.service';
import { CreateDefenseDto, UpdateDefenseDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { SearchDto } from '../../common/dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('defense')
export class DefenseController {
  constructor(private readonly defenseService: DefenseService) {}

  @Get()
  findAll(@Query() dto: SearchDto) {
    return this.defenseService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.defenseService.findOne(id);
  }

  @Roles('ADMINISTRATOR')
  @Post()
  create(@Body() dto: CreateDefenseDto) {
    return this.defenseService.create(dto);
  }

  @Roles('ADMINISTRATOR')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDefenseDto,
  ) {
    return this.defenseService.update(id, dto);
  }

  @Roles('ADMINISTRATOR')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.defenseService.toggleDelete(id);
  }

  @Roles('ADMINISTRATOR')
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.defenseService.upload(file);
  }
}
