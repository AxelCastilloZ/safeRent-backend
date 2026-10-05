import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetUserActiveDto } from './dto/set-user-active.dto';
import { AppRole, Roles } from 'src/auth/access';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // El registro público vive en /auth/register (siempre crea CLIENT); este endpoint
  // lo usa el administrador para crear cuentas directamente con un rol específico.
  @Roles(AppRole.ADMIN)
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  // Listado para el panel de administración: solo los campos necesarios (sin cédula,
  // teléfono ni fecha de nacimiento).
  @Roles(AppRole.ADMIN)
  @Get()
  findAll() {
    return this.userService.findAllForAdmin();
  }

  @Roles(AppRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Roles(AppRole.ADMIN)
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  // Activa o desactiva la cuenta (p. ej. si el usuario hizo mal uso de la aplicación).
  @Roles(AppRole.ADMIN)
  @Patch(':id/status')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() dto: SetUserActiveDto) {
    return this.userService.setActive(id, dto.isActive);
  }

  // Agrega un rol al usuario (p. ej. convertirlo también en propietario).
  @Roles(AppRole.ADMIN)
  @Patch(':id/roles/:roleId')
  addRole(@Param('id', ParseIntPipe) id: number, @Param('roleId', ParseIntPipe) roleId: number) {
    return this.userService.addRole(id, roleId);
  }

  // Quita un rol del usuario.
  @Roles(AppRole.ADMIN)
  @Delete(':id/roles/:roleId')
  removeRole(@Param('id', ParseIntPipe) id: number, @Param('roleId', ParseIntPipe) roleId: number) {
    return this.userService.removeRole(id, roleId);
  }

  // Elimina la cuenta de la aplicación (p. ej. por mal uso confirmado).
  @Roles(AppRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id);
  }
}
