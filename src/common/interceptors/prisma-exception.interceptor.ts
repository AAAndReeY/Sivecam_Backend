import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
  ConflictException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class PrismaExceptionInterceptor implements NestInterceptor {
  private logger = new Logger('Exception');

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        const http = this.mapPrismaToHttp(error);
        if (http) return throwError(() => http);
        return throwError(() => error);
      }),
    );
  }

  private mapPrismaToHttp(error: any): HttpException | null {
    this.logger.error(error);
    if (error && typeof error.code === 'string') {
      const code = error.code as string;
      const target = error.meta?.target?.[0] as string | undefined;
      switch (code) {
        case 'P2002': // unique constraint
          if (target === 'name')
            return new ConflictException('Ese nombre ya está registrado.');
          if (target === 'email')
            return new ConflictException(
              'Ese correo ya se encuentra registrado.',
            );
          if (target === 'dni')
            return new ConflictException('Ese DNI ya se encuentra registrado.');
          if (target === 'phone')
            return new ConflictException(
              'Ese celular ya se encuentra registrado.',
            );
          return new ConflictException(
            'Ya existe un registro con un valor único duplicado.',
          );
        case 'P2025': // record not found
          return new NotFoundException('No se encontró el recurso solicitado.');
        case 'P2003': // foreign key
          return new BadRequestException(
            'No se puede eliminar o modificar porque tiene referencias relacionadas.',
          );
        default:
          return new BadRequestException('Error de base de datos.');
      }
    }
    if (error?.name === 'PrismaClientValidationError')
      return new BadRequestException('Los datos enviados no son válidos.');
    return null;
  }
}
