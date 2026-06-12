import { Controller, Get, Query, ParseFloatPipe, DefaultValuePipe } from '@nestjs/common';
import { AppService } from './app.service';
import { GpsRadioService } from './modules/gps-radio/gps-radio.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly gpsRadioService: GpsRadioService,
  ) {}

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

  /** Endpoint público: radios GPS cercanas a una coordenada. No requiere autenticación. */
  @Get('radios/cercanas')
  radiosCercanas(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radio', new DefaultValuePipe(500), ParseFloatPipe) radio: number,
  ) {
    return this.gpsRadioService.findCercanos(lat, lng, radio);
  }
}
