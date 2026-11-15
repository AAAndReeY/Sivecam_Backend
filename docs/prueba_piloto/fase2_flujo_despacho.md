# Fase 2: flujo de despacho

Qué cambió en la pantalla **Despacho y Patrullaje** (pestaña Despacho) y cómo probarlo con el turno real.
Capturas: `f2_*.png` en esta carpeta.

## Qué hay nuevo

**Prioridad y nombre corto por tipo de incidencia**
- Cada incidencia llega con `prioridad` (ALTA / MEDIA / BAJA), `corto` (nombre corto) y `categoria` (ícono).
- Regla por defecto en `src/modules/patrullaje/tipos-incidencia.ts`: contra la persona, patrimonio, auxilio y
  desastres son ALTA; tránsito, tranquilidad e infraestructura MEDIA; buenas costumbres, ordenanzas y apoyo BAJA.
  Un tipo desconocido toma la prioridad de su grupo en el motor predictivo.
- La torre puede cambiar prioridad y nombre corto desde el panel **Prioridad por tipo de incidencia** (al final de
  la pestaña). Se guarda en la tabla `IncidentTypeConfig` y queda en la auditoría (`CONFIGURAR_TIPO_INCIDENCIA`).
- Lista de incidencias: pendientes primero, por prioridad y luego las más nuevas. Las ya despachadas o cerradas
  muestran su estado y las unidades que fueron. El texto completo del tipo sale al pasar el mouse.
- Mapa (capa Incidencias): alta prioridad pendiente = punto más grande con borde rojo; las atendidas van huecas.

**Estados y cronómetros**
- Incidencia: Pendiente → Despachada → En atención → Cerrada (según sus despachos en SIVECAM).
- Unidad: En camino → En el lugar → Cerrado / Cancelado, con cronómetro en vivo.
- Tramos por unidad: recepción a despacho (desde la hora de registro de la incidencia), despacho a llegada y
  tiempo en el lugar. Se guardan `incident_registered_at`, `assigned_at`, `arrived_at` y `closed_at`.

**Varias unidades a una emergencia**
- Al enviar una unidad la tarjeta de la emergencia sigue abierta: se pueden enviar más (móvil + sereno a pie) y
  luego pulsar **Listo**. Todas comparten `group_id` (`inc-<id>` o un uuid si fue un punto marcado).
- En la tarjeta del despacho, **Refuerzo** vuelve a sugerir unidades para la misma emergencia.
- Auditoría: `DESPACHAR` la primera, `DESPACHAR_REFUERZO` las siguientes.

**Motivo de cierre y cancelación**
- Cerrar pide resultado (atendido, sin novedad, falsa alarma, derivado a PNP / Bomberos / SAMU, no ubicado, otro) y
  una nota corta. Cancelar pide motivo (reasignado, falsa alarma, lo atiende la PNP, otro).
- Se guarda en `Dispatch.result` y en la auditoría. El Resumen cuenta falsas alarmas y derivados a PNP.

**Recomendación explicada**
- Cada móvil sugerida trae una línea de razón: "La más rápida por calles", "12 min por calles, viene de Zárate",
  "posición de hace 7 min", "Ya atiende otro despacho". Las de GPS viejo (más de 5 min) bajan en el orden y se
  pintan amarillas; las ocupadas van al final.

**Avisos que no se pierden**
- Panel **Avisos** fijo en la pestaña: incidencias urgentes (ALTA) sin despachar de los últimos 30 min y unidades
  que pasaron el límite sin llegar. Clic lleva a despachar o al punto en el mapa.
- Sonido (sin archivos, Web Audio): dos tonos para urgente nueva, tres toques para atraso. Se apaga con el
  altavoz del panel; el límite de atraso (5 a 30 min, o 1.5 veces el tiempo estimado, lo mayor) se elige ahí.
  Ambos se recuerdan por operador (`localStorage cdp.sonido`).

**Cámaras cercanas**
- Botón para copiar el código de la cámara y buscarla en el visor. No hay integración de video en vivo en el
  proyecto (ni HikCentral ni bodycam), así que queda documentado como pendiente, no simulado.

## Cómo probarlo con el turno real

1. Entrar a `/despacho`, pestaña **Despacho**. El panel Avisos debe decir "Sin avisos" o listar urgentes recientes.
2. Elegir una incidencia **Alta** de la lista (borde rojo a la izquierda) o un aviso. En la tarjeta: chip de
   prioridad, código, jurisdicción y hora de registro; en Móviles, la razón bajo cada indicativo.
3. **Enviar** la primera móvil: la fila pasa a "Enviada", aparece "ORION xx en camino. ¿Hace falta otra unidad?".
   Enviar un sereno a pie y pulsar **Listo**.
4. En "Despachos de las últimas 24 h" hay una sola tarjeta por emergencia con las dos unidades, cronómetro en
   vivo, "Recepción a despacho", "Le faltan X min por calles" y el botón **Refuerzo**.
5. Dejar que pase el límite (o bajarlo a 5 min en el panel): la unidad se pinta roja con "!", suena tres veces y
   aparece en Avisos.
6. **Cerrar** una unidad con "Falsa alarma" y nota; **Cancelar** la otra con "Se reasignó". La tarjeta muestra el
   resultado y la incidencia pasa a "Cerrada" en la lista.
7. Abrir **Prioridad por tipo de incidencia**, cambiar un tipo a Alta: la lista se reordena en el siguiente ciclo.

## Pendiente (no viable hoy, documentado)

- Video en vivo de cámaras y bodycams: no existe integración en SIVECAM.
- Estado "En camino" confirmado por la unidad y "Fuera de servicio": requieren un acuse desde la radio o un
  tablero de unidades (Fase 3).
- Batería y sereno asignado a la radio: Dolphin no lo entrega.

## Base de datos

Migración `20261115120000_fase2_despacho_grupo_resultado_tipos` (columnas `group_id`, `incident_registered_at`,
`priority`, `result` en `Dispatch`; tabla `IncidentTypeConfig`). En local se aplicó con `prisma db push`; en el
servidor va con `prisma migrate deploy`.
