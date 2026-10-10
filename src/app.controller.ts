import { Controller, Get, Query, ParseFloatPipe, DefaultValuePipe, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { GpsRadioService } from './modules/gps-radio/gps-radio.service';
import { BodycamService } from './modules/bodycam/bodycam.service';
import { ApiKeyGuard } from './modules/auth/guard';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly gpsRadioService: GpsRadioService,
    private readonly bodycamService: BodycamService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Integración: cámaras cercanas a una coordenada. Requiere cabecera x-api-key. */
  @UseGuards(ApiKeyGuard)
  @Get('camaras/cercanas')
  camarasCercanas(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radio', new DefaultValuePipe(500), ParseFloatPipe) radio: number,
  ) {
    return this.appService.camarasCercanas(lat, lng, radio);
  }

  /** Integración: radios GPS cercanas a una coordenada. Requiere cabecera x-api-key. */
  @UseGuards(ApiKeyGuard)
  @Get('radios/cercanas')
  radiosCercanas(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radio', new DefaultValuePipe(500), ParseFloatPipe) radio: number,
  ) {
    return this.gpsRadioService.findCercanos(lat, lng, radio);
  }

  /** Integración: bodycams cercanas a una coordenada. Requiere cabecera x-api-key. */
  @UseGuards(ApiKeyGuard)
  @Get('bodycams/cercanas')
  bodycamsCercanas(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radio', new DefaultValuePipe(500), ParseFloatPipe) radio: number,
  ) {
    return this.bodycamService.findCercanas(lat, lng, radio);
  }
}
