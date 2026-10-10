import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, FilterUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@UseGuards(JwtAuthGuard, CustomRoleGuard)
@ModuleKey('usuarios')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @Request() req) {
    return this.userService.create(dto, { system_slug: req.user.system_slug, username: req.user.username });
  }

  @Get()
  findAll(@Query() dto: FilterUserDto) {
    return this.userService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Request() req) {
    return this.userService.update(id, dto, { system_slug: req.user.system_slug, username: req.user.username });
  }

  // Restablece la vinculación del celular de un usuario "solo app móvil"
  @Post(':id/reset-device')
  @ModuleOp('edit')
  resetDevice(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.resetDevice(id, { system_slug: req.user.system_slug, username: req.user.username });
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.toggleDelete(id, { system_slug: req.user.system_slug, username: req.user.username });
  }
}
