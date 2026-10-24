import { IsBoolean } from 'class-validator';

export class MapVisibilityDto {
  // true = el pin no se dibuja en el mapa (cámara caída); sigue contando en los totales
  @IsBoolean()
  map_hidden: boolean;
}
