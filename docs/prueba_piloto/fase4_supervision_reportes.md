# Fase 4: supervisión y reportes

Qué cambió en **Despacho y Patrullaje** y cómo probarlo. Capturas: `f4_*.png` en esta carpeta.

## Qué hay nuevo

**Reproducción de recorrido** (tarjeta de unidad → **Reproducir**)
- Barra flotante sobre el mapa: rango (últimas 2 h, 4 h, el turno elegido o un rango a medida, máximo 48 h),
  reproducir/pausa, línea de tiempo arrastrable y velocidad 1x a 120x. Dibuja el recorrido completo tenue, lo ya
  reproducido en gris y la móvil en el punto actual con la hora. Fuente: histórico GPS de Dolphin (radios) o
  ubicaciones de la API de bodycams.
- Backend: `GET patrullaje/recursos/:tipo/:id/recorrido?desde=&hasta=` (ISO) además de `?horas=`.

**Cumplimiento de ruta visual** (pestaña Rutas y Resumen → "Cobertura de zonas de riesgo")
- Cada parada dice si fue visitada, a qué hora, cuánto permaneció frente a lo planificado ("permaneció 12 de 10 min
  (cumplida)") o lo más cerca que pasó la móvil.
- Porcentaje por móvil en la fila y por jurisdicción en el encabezado del grupo ("3 móviles, 15 paradas, 80%
  cumplido"). En Resumen, tabla por jurisdicción y detalle por móvil (`por_jurisdiccion` y `por_movil` de
  `POST patrullaje/planes/verificar-turno`).

**Paradas con nombre** (Ruta manual)
- Al hacer clic en el mapa, la parada se nombra sola: la zona de riesgo a menos de 150 m ("Zona de riesgo medio,
  La Huayrona") o, si no hay, la dirección aproximada de OpenStreetMap. El nombre es obligatorio (en pantalla y en el
  backend) y se puede editar.

**Mapa de calor de cobertura** (Resumen → "Mapa de calor de cobertura" → Ver en el mapa)
- Por dónde patrullaron de verdad las móviles con ruta en el turno (histórico GPS del turno, hasta 400 puntos por
  móvil), sobre las zonas de riesgo. Las zonas sin ninguna móvil a 120 m quedan punteadas y la tarjeta de cada zona
  dice quién pasó. Tabla por jurisdicción: móviles con ruta y zonas cubiertas.
- Backend: `GET patrullaje/cobertura?fecha&turno` (caché de 5 min).

**Informe del turno** (Resumen → "Informe del turno" → Ver informe)
- Emergencias, unidades despachadas, tiempos de recepción a despacho y de despacho a llegada (promedio y mediana),
  tiempo en el lugar, despachos por jurisdicción, tipo, prioridad, resultado y unidad, rutas y cumplimiento, alertas
  por tipo y flota (móviles sin reporte con su lista).
- **Excel** (tres hojas: Resumen, Despachos, Rutas; con exceljs en el navegador) y **PDF** con el diálogo de
  impresión del navegador (vista limpia, solo el informe).
- Backend: `GET despacho/indicadores?fecha&turno`.

**Bitácora** (Resumen → "Bitácora", y botón de libreta en cada emergencia de la pestaña Despacho)
- Quién despachó, envió refuerzo, marcó llegada, cerró o canceló (con resultado y nota), generó, creó o anuló rutas,
  cambió prioridades, marcó fuera de servicio o atendió alertas. Filtro por incidencia, unidad o usuario.
- Backend: `GET despacho/bitacora?horas&incidencia` (lee la auditoría y la traduce).

**Alertas afinadas** (de la fase 3, tras ver ruido en el turno real)
- "Detenida" solo para móviles con ruta del turno; "Dejó de reportar" solo para móviles y radios portátiles que
  venían en línea al menos 3 revisiones seguidas (las bodycams entran y salen de línea todo el tiempo).

## Cómo probarlo con el turno real

1. Rutas → Generar rutas (si no hay). Resumen → "Desde las 14:00": aparece el porcentaje por jurisdicción y por móvil;
   en Rutas, cada fila muestra 4/5 80% y cada parada su hora y permanencia.
2. Resumen → Mapa de calor → Ver en el mapa: manchas azules donde hubo patrullaje; zonas punteadas = sin pasar.
3. Unidades → clic en una móvil → Reproducir → elegir "Turno elegido" → Play a 60x.
4. Ruta manual → Agregar en el mapa → clic cerca de una zona de riesgo: el nombre se completa solo.
5. Resumen → Ver informe → Excel (descarga .xlsx) y PDF (imprimir, "Guardar como PDF").
6. Resumen → Ver bitácora → filtrar por el código de una incidencia.

## Base de datos

Sin tablas nuevas. Se eliminaron en la BD local las alertas de ruido generadas por la regla anterior
(144 registros cerrados de "detenida" y "dejó de reportar").
