import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TypologyService } from './typology.service';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('actividades')
@Controller('typology')
export class TypologyController {
  constructor(private readonly typologyService: TypologyService) {}

  @Get(':id')
  findByMapId(@Param('id') id: string) {
    return this.typologyService.findByMapId(+id);
  }

  @ModuleOp('create')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.typologyService.upload(file);
  }
}
