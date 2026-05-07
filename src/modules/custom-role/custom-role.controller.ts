import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomRoleService } from './custom-role.service';
import { CreateCustomRoleDto, FilterCustomRoleDto, UpdateCustomRoleDto } from './dto';
import { JwtAuthGuard, CustomRoleGuard, ModuleKey, ModuleOp } from '../auth/guard';

@Controller('custom-role')
export class CustomRoleController {
  constructor(private readonly customRoleService: CustomRoleService) {}

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @ModuleOp('create')
  @Post()
  create(@Body() dto: CreateCustomRoleDto, @Request() req) {
    return this.customRoleService.create(dto, { system_slug: req.user.system_slug, username: req.user.username });
  }

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @Get()
  findAll(@Query() dto: FilterCustomRoleDto) {
    return this.customRoleService.findAll(dto);
  }

  // Endpoint accesible por cualquier usuario autenticado para cargar sus propios permisos
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  getMyPermissions(@Request() req) {
    return this.customRoleService.getMyPermissions(req.user.user_id);
  }

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @ModuleOp('create')
  @Post('seed-defaults')
  seedDefaultRoles() {
    return this.customRoleService.seedDefaultRoles();
  }

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customRoleService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @ModuleOp('edit')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomRoleDto, @Request() req) {
    return this.customRoleService.update(id, dto, { system_slug: req.user.system_slug, username: req.user.username });
  }

  @UseGuards(JwtAuthGuard, CustomRoleGuard)
  @ModuleKey('roles')
  @ModuleOp('delete')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.customRoleService.toggleDelete(id, { system_slug: req.user.system_slug, username: req.user.username });
  }
}
