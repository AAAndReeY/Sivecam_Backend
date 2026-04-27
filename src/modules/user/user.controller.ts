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
import { Rol } from '@prisma/client';
import { UserService } from './user.service';
import { CreateUserDto, FilterUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.SUPERADMIN)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @Request() req) {
    return this.userService.create(dto, { rol: req.user.rol, username: req.user.username });
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
    return this.userService.update(id, dto, { rol: req.user.rol, username: req.user.username });
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.userService.toggleDelete(id, { rol: req.user.rol, username: req.user.username });
  }
}
