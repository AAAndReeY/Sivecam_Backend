import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const response = ctx.switchToHttp().getResponse();
    const request = ctx.switchToHttp().getRequest();
    const method = (request?.method || 'GET').toUpperCase();
    if (response.headersSent) return next.handle();
    const SUCCESS_MESSAGE_KEY = 'success_message';
    const customMessage = this.reflector.getAllAndOverride<string>(
      SUCCESS_MESSAGE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    return next.handle().pipe(
      map((data) => {
        if (
          data === undefined ||
          data === null ||
          data instanceof Buffer ||
          typeof data === 'string'
        ) {
          if (method === 'DELETE') return { message: 'Eliminación exitosa' };
          return data;
        }
        return {
          message: customMessage ?? this.resolveDefaultMessage(method, data),
          data,
        };
      }),
    );
  }

  private resolveDefaultMessage(method: string, data: any): string {
    switch (method) {
      case 'POST':
        return 'Creación exitosa';
      case 'PUT':
      case 'PATCH':
        return 'Actualización exitosa';
      case 'DELETE':
        return 'Cambio de estado exitoso';
      default:
        if (data && data.data) return 'Registros obtenidos exitosamente';
        return 'Registro obtenido exitosamente';
    }
  }
}
