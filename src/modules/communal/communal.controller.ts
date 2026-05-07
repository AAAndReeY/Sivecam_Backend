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
import { CommunalService } from './communal.service';
import { CreateCommunalDto, FilterCommunalDto, UpdateCommunalDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';
import { SuccessMessage } from '../auth/decorators';
import { Request } from 'express';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('camaras-vecinales')
@Controller('communal')
export class CommunalController {
  constructor(private readonly communalService: CommunalService) {}

  @Get()
  findAll(@Query() dto: FilterCommunalDto, @Req() req: Request) {
    return this.communalService.findAll(dto, req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.communalService.findOne(id, req.user);
  }

  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateCommunalDto) {
    return this.communalService.create(dto);
  }

  @ModuleOp('edit')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunalDto,
  ) {
    return this.communalService.update(id, dto);
  }

  @ModuleOp('delete')
  @Delete(':id')
  toggleDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.communalService.toggleDelete(id);
  }

  @ModuleOp('create')
  @Post('upload')
  @SuccessMessage('Creación masiva exitosa')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.communalService.upload(file);
  }
}
