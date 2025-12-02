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
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATOR')
@Controller('typology')
export class TypologyController {
  constructor(private readonly typologyService: TypologyService) {}

  @Get(':id')
  findByMapId(@Param('id') id: string) {
    return this.typologyService.findByMapId(+id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.typologyService.upload(file);
  }
}
