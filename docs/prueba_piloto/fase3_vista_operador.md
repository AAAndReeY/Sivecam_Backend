# Fase 3: vista de operador

Qué cambió en **Despacho y Patrullaje** y cómo probarlo con el turno real. Capturas: `f3_*.png` en esta carpeta.

## Qué hay nuevo

**Tablero de unidades** (pestaña **Unidades**)
- Todas las móviles (y, con el segundo botón, radios portátiles y bodycams) con estado, jurisdicción, última señal
  y asignación actual (despacho o ruta del turno). Se ordena por cualquier columna y se filtra por texto, estado y
  jurisdicción. Clic en la fila centra el mapa y abre la tarjeta de la unidad.
- Los recursos a pie (cientos) se cargan solo cuando se piden y se refrescan cada minuto.

**Tarjeta de unidad** (clic en un marcador, en una fila del tablero o en el buscador)
- Estado, última señal, velocidad, estado de la radio, despacho actual y avance de su ruta del turno.
- Botones: **Enviar a la emergencia** (si hay una emergencia abierta en Despacho; si no, pide marcarla),
  **Centrar**, **Recorrido 2 h** (dibuja en gris el histórico GPS de Dolphin o las ubicaciones de la bodycam),
  **WhatsApp** (texto con su posición) y **Fuera de servicio** / **Volver al servicio** con motivo.
- Fuera de servicio: la unidad deja de sugerirse y de recibir ruta; se guarda en `UnitServiceStatus` y en la
  auditoría (`FUERA_DE_SERVICIO` / `VUELVE_AL_SERVICIO`). En el mapa va gris oscuro con una X.

**Buscador global** (debajo del turno, atajo `/`)
- Busca por indicativo (ORION 52), ISSI, código de bodycam (sg567), código o tipo de incidencia. Con Enter busca la
  dirección en OpenStreetMap acotado a San Juan de Lurigancho y la marca en el mapa con el botón **Despachar aquí**.

**Alertas automáticas** (pestaña **Alertas**, revisión cada minuto en el backend, tabla `PatrolAlert`)
- **Detenida**: móvil en servicio, sin despacho, más de 15 min quieta fuera de una parada de su ruta.
- **Fuera de jurisdicción**: móvil con ruta del turno que está en otra jurisdicción (dos revisiones seguidas).
- **Dejó de reportar**: radio o bodycam que estaba en línea y dejó de reportar (se olvida pasadas 3 h).
- **Jurisdicción sin móvil**: ninguna móvil con GPS en servicio en esa jurisdicción.
- Se abren y cierran solas; la torre puede marcarlas **Atendida** (queda en auditoría). Historial de 24 h.

**Atajos de teclado** (botón de teclado en el encabezado del panel o tecla `?`)
- `N` marcar emergencia, `E` enviar la móvil sugerida, `↓/↑` siguiente/anterior incidencia pendiente,
  `L` marcar llegada, `C` cerrar despacho, `/` buscador, `1`–`6` pestañas, `Esc` cerrar.

**Encabezado**: reloj en vivo (hora de Lima) junto a la fecha, en todas las pantallas.

## Cómo probarlo con el turno real

1. Pestaña **Unidades**: ordenar por "Última señal", filtrar "Sin reporte"; clic en una móvil disponible.
2. En la tarjeta: **Recorrido 2 h** (debe dibujar su trayecto gris), luego **Fuera de servicio** con motivo
   "taller". Ir a Despacho, marcar un punto: esa móvil ya no aparece en las sugeridas. Volver al servicio.
3. Buscador: escribir "ORION 5" (lista de unidades), "WA2026" (incidencia), "Av. Próceres 1500" + Enter (dirección).
4. Pestaña **Alertas**: debe listar lo que haya; apagar una radio de prueba y esperar 10 min: aparece "Dejó de
   reportar"; al volver a reportar, pasa al historial.
5. Atajos: con una incidencia abierta, pulsar `E`; con un despacho en camino, `L`.

## Pendiente (documentado, no viable hoy)

- Batería y sereno asignado a la radio: Dolphin no lo entrega.
- "En camino" confirmado por la unidad: requiere acuse desde la radio o la tablet.

## Base de datos

Migración `20261116120000_fase3_fuera_servicio_alertas` (tablas `UnitServiceStatus` y `PatrolAlert`). En local se
aplicó con `prisma db push`; en el servidor va con `prisma migrate deploy`.
