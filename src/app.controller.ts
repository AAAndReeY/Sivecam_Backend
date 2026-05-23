import { Controller, Get, Query, ParseFloatPipe, DefaultValuePipe } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Endpoint público: cámaras cercanas a una coordenada. No requiere autenticación. */
  @Get('camaras/cercanas')
  camarasCercanas(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radio', new DefaultValuePipe(500), ParseFloatPipe) radio: number,
  ) {
    return this.appService.camarasCercanas(lat, lng, radio);
  }
}
