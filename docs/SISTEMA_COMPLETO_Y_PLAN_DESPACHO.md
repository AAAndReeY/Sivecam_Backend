# SIVECAM / MIT: qué tiene el sistema hoy y plan del módulo de despacho

**Fecha:** 2026-10-31
**Institución:** Municipalidad Distrital de San Juan de Lurigancho (SJL), Lima, Perú. Central de Control y Monitoreo (CECOM), Serenazgo.
**Objetivo final:** seguridad ciudadana.
**Para qué sirve este documento:** dar a otra IA o a otra persona el contexto completo, desde cero, para investigar y diseñar el **módulo de despacho de móviles** y el **patrullaje inteligente**. Tiene cinco partes (la **Parte E** es la prueba piloto con datos reales):

1. **Parte A:** todo lo que el sistema tiene implementado hoy, tal como está en el código.
2. **Parte B:** las ideas del usuario (responsable del proyecto), ordenadas.
3. **Parte C:** la propuesta técnica, con lo que añadió Claude, preguntas abiertas y temas para investigar en internet.
4. **Parte D (2026-11-12):** revisión de los proyectos paralelos (`Despacho-Asistido-SJL`, `PredivctiveIncidence`) y plan para unir todo en MIT: rutas inteligentes por turno, despacho y rutas manuales.
5. **Parte E (2026-11-12):** prueba piloto construida y probada con datos reales: qué se hizo, resultados, supuestos y guion para presentar.

> **Nota para la IA que lea esto:** la Parte A describe código real revisado el 2026-10-31. Las partes B y C son ideas y propuestas que **todavía no existen**. No se incluyen contraseñas, tokens ni llaves. En la sección C.10 están los temas pendientes de investigar en internet.

---

# PARTE A — EL SISTEMA ACTUAL (lo que ya existe)

## A.1 Visión general

Es un **mapa operativo de seguridad ciudadana** para la central de monitoreo. Muestra sobre un mapa interactivo:

- cámaras municipales y vecinales,
- incidencias de serenazgo y de la PNP (Policía Nacional del Perú),
- radios con GPS (serenos y unidades) en tiempo real, con su historial de recorrido,
- bodycams en tiempo real y su historial,
- comisarías, jurisdicciones, mapas de calor y otras capas municipales.

Además incluye administración de usuarios con roles personalizados, auditoría, dashboards y reportes. También controla la seguridad de los accesos: límite de sesiones, horario de acceso por usuario y un celular vinculado para ciertos usuarios.

Son tres proyectos, todos dentro de `SISTEMA MAPA OPERADORES\`:

| Proyecto | Tecnología | Producción |
|---|---|---|
| `Sivecam_Backend` | NestJS 11 + Prisma 5.15 + PostgreSQL | `https://backend-incidencias.munisjl.gob.pe/api/` |
| `MAP_610_NEW` (web) | React 19 + Vite 6 + React-Leaflet 5 (y una variante con Google Maps) | `https://mit.munisjl.gob.pe/` |
| `map610-app` (app móvil "MIT") | Expo SDK 54 + React Native 0.81 + WebView + módulo nativo Kotlin | APK, paquete Android `mit.sjl`, Play Console (prueba interna) |

Repositorios: el backend y la web están en GitHub (organización/usuario `AAAndReeY`, ramas `andre` (principal), `diego` y `jose`). La app está en `github.com/Dmat39/APP_MIT`.

El backend y la web corren en **servidores distintos**. El backend corre con Node (pm2, systemd o docker, según el servidor).

---

## A.2 Backend (`Sivecam_Backend`)

### A.2.1 Infraestructura transversal
- Prefijo global de las rutas: `/api`.
- **CORS** configurable con `CORS_ORIGINS`; si no se configura, queda abierto a cualquier origen (`*`).
- `ValidationPipe` global (`whitelist`, `transform`), un interceptor de respuesta estándar y un interceptor de errores de Prisma.
- Paginación y búsqueda comunes (`common/dto`, `common/helpers`), y un helper de zona horaria (America/Lima).
- **Dos bases de datos:**
  1. **PostgreSQL propia** (Prisma, `DATABASE_URL`): cámaras, usuarios, roles, incidencias PNP, auditoría, zonas, etc.
  2. **PostgreSQL externa del sistema de incidencias de serenazgo** (`SqlService`, conexión `pg` directa con `SQL_DATABASE_URL`). **Es de solo lectura.** Tiene las tablas `incidencias`, `jurisdicciones`, `sub_tipo_casos` (con `tipoCasoId`), etc.
- **APIs externas:**
  - **Dolphin GPS** (`https://apigps.dolphin.pe`): posiciones de las radios (TETRA/ISSI) en tiempo real, historial de recorridos y km por día. Ojo: Dolphin devuelve la latitud y la longitud **con los nombres invertidos**.
  - **API de bodycams** (`BODYCAM_API_URL`, servidor municipal `gps-bodycam.munisjl.gob.pe:8087`): el backend hace de proxy y el token queda solo en el servidor.

### A.2.2 Variables de entorno (solo los nombres)
`DATABASE_URL`, `DIRECT_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `SQL_*` / `SQL_DATABASE_URL`, `CORS_ORIGINS`, `BODYCAM_API_URL`, `BODYCAM_API_TOKEN`, `INTEGRATION_API_KEYS`, `DOLPHIN_BASE_URL`, `DOLPHIN_USERNAME`, `DOLPHIN_PASSWORD`, `MOBILE_ACCESS_TOKEN_TTL`, `MOBILE_REFRESH_TTL_DAYS`, `DEVICE_ATTESTATION`, `ANDROID_PACKAGE_NAME`, `ANDROID_SIGNING_CERT_SHA256`, `ATTESTATION_REQUIRE_LOCKED_BOOTLOADER`.

### A.2.3 Módulos y endpoints

Todas las rutas exigen `JwtAuthGuard` + `CustomRoleGuard` (permiso por módulo o capa), salvo las que se indican.

| Módulo | Rutas | Qué hace |
|---|---|---|
| **auth** | `POST auth/login`, `POST auth/device/challenge`, `POST auth/refresh`, `SSE auth/session-events`, `POST auth/logout` | Login con JWT; login con firma del celular para usuarios `mobile_only`; refresh con firma; canal SSE de eventos de sesión |
| **user** | CRUD `user`, `POST user/:id/reset-device`, `GET/DELETE user/:id/sessions[/:sessionId]` | Usuarios, reset del celular vinculado, ver y cerrar sesiones abiertas |
| **custom-role** | CRUD `custom-role`, `GET custom-role/mine`, `POST custom-role/seed-defaults` | Roles personalizados con permisos por módulo y capa, campos visibles y jurisdicciones permitidas |
| **audit** | `GET audit` | Bitácora de acciones (crear, editar, eliminar, MAP_HIDE, etc.) |
| **municipal** | CRUD + `PATCH :id/map-visibility`, `POST upload` (Excel), `POST angle` | Cámaras municipales: tipo LPR/180/360, ángulo, radio, botón de pánico, megáfono, ocultar del mapa si está caída |
| **communal** | CRUD + `GET export`, `POST upload` | Cámaras vecinales: marca Dahua/Hikvision, modo, vecino responsable, datos de acceso |
| **incidence** | `GET incidence` | Incidencias de **serenazgo** desde la BD externa. Filtros: fechas, tipo, subtipo, jurisdicción, turno (Mañana 6–14, Tarde 14–22, Noche 22–6) y franja de 2 horas |
| **pnp-incidence** | CRUD + `GET jurisdictions` | Incidencias **PNP** registradas en el sistema: modalidad, dirección, coordenadas, jurisdicción, turno, número de denuncia, comisaría, estado del caso y fecha de ocurrencia |
| **incidence-type / -subtype / -modality** | CRUD | Catálogo jerárquico Tipo → Subtipo → Modalidad para las incidencias PNP |
| **comisaria** | CRUD | Comisarías con coordenadas |
| **gps-radio** | `GET gps-radio`, `GET historico`, `GET km-dias`, `GET info`, `PATCH :issi`, `GET cercanos` | Radios GPS de Dolphin: posición en vivo (caché de 15 s), recorrido histórico, km por día, ficha y edición de la unidad (placa, modelo, tipo), radios cercanas a un punto (incluso dentro de un rango de fechas) |
| **gps-zona** | CRUD | Cercos o zonas GPS (GeoJSON, color, activo) con **radios asignadas** (`radios_issi`) |
| **bodycam** | `GET bodycams`, `GET bodycams/:codigo/ubicaciones` | Bodycams en vivo e historial (proxy con caché de 10 s) |
| **campaign-point** | CRUD + `GET categories` | Puntos de obra o campaña: punto, polilínea o polígono |
| **activity** | CRUD + upload | Actividades municipales georreferenciadas |
| **defense** | CRUD + upload | Puntos de Defensa Civil |
| **stop** | CRUD + upload | Paraderos autorizados y no autorizados |
| **sustenance** | CRUD + upload | Puntos de sostenimiento |
| **waste** | CRUD + upload | Puntos de residuos |
| **typology** | `GET :id`, `POST upload` | Tipologías de casos (relacionan ids del mapa con ids de incidencias) |
| **session-events** | (servicio interno) | Canal SSE en memoria por sesión. Revocación inmediata con motivos `SESSION_REPLACED`, `USER_DISABLED`, `DEVICE_RESET`, `OUT_OF_SCHEDULE`, `ADMIN_LOGOUT`, etc. Ping cada 25 s; revisa los horarios cada 30 s |
| **Integración (sin JWT, con `x-api-key`)** | `GET camaras/cercanas`, `GET radios/cercanas`, `GET bodycams/cercanas` | Para sistemas externos: cámaras, radios y bodycams cerca de un lat/lng dentro de un radio en metros |

### A.2.4 Modelo de datos (Prisma, BD propia)
- **Cámaras:** `Municipal`, `Communal`.
- **Puntos de mapa:** `Activity`, `Defense`, `Comisaria`, `Jurisdiction`, `Stop`, `CampaignPoint`, `Sustenance`, `Waste`, `Typology`.
- **Usuarios y seguridad:**
  - `User`: `max_sessions`, `mobile_only`, `device_public_key`, `access_start/end/days`, `show_location_pin`, `custom_role_id`.
  - `UserSession`: user agent, IP, revocación, `is_mobile`, hash del refresh.
  - `DeviceChallenge`: retos de firma del celular.
- **Roles:** `CustomRole` (jurisdicciones permitidas), `RoleModulePermission` (acceder, crear, editar, eliminar; campos visibles en el mapa; campos para exportar), `RoleLayerPermission`.
- **Incidencias PNP:** `IncidenceType` → `IncidenceSubtype` → `IncidenceModality` → `PnpIncidence`.
- **Otros:** `AuditLog`, `GpsZone`.
- **Enums:** `Rol` (SUPERADMIN, ADMINISTRATOR, CODISEC, SUPERVISOR, OPERATOR, VIEWER, PNP), `Shift` (MORNING, AFTERNOON, NIGHT), `CaseStatus`, `Camera`, `Brand`, `Mode`, `Color`.
- **Nota de despliegue:** la carpeta `prisma/migrations` está en `.gitignore`, así que el SQL de las migraciones se lleva a producción a mano.

### A.2.5 Seguridad implementada (rama `diego`, octubre 2026)
1. **Endpoints públicos cerrados:** cámaras, radios y bodycams cercanas exigen `x-api-key`; las bodycams pasan por el backend. Está desplegado y verificado.
2. **Usuarios `mobile_only`:** solo entran desde **un celular vinculado**. La llave ECDSA vive en el Keystore de Android y se comprueba con **Key Attestation** de Google (app y firma verificadas). El token dura 15 min y se renueva con la firma del celular. El administrador puede resetear la vinculación.
3. **Límite de sesiones** por usuario, con aviso en tiempo real al dispositivo desplazado (SSE).
4. **Horario de acceso** por usuario: hora de inicio y fin en hora de Lima, días de la semana y turnos de noche. Al terminar el horario, la sesión se cierra sola.
5. **Gestión de sesiones abiertas** por el administrador (ver y cerrar).
6. **Pin de "mi ubicación"** habilitado por usuario. Funciona en la web; la APK actual **no tiene permiso de ubicación**.
7. **Auditoría** de acciones.
8. **Pendiente:** configurar `CORS_ORIGINS` en producción.

Detalle completo en `docs/GUIA_COMPLETA_SEGURIDAD_Y_APP_MOVIL.md` y `docs/AUDITORIA_SEGURIDAD_PUNTO{1,2,3}.md`.

---

## A.3 Web (`MAP_610_NEW`)

**Stack:** React 19, Vite 6, React Router 7, TanStack Query 5, Leaflet + React-Leaflet 5, `@react-google-maps/api` (variante del mapa en Google Maps), Turf.js (geometría), leaflet.heat y heatmap.js (mapas de calor), Recharts (gráficos), ExcelJS (exportar), lucide-react. El clustering de puntos corre en un Web Worker. Variables: `VITE_API_URL`, `VITE_GOOGLE_MAPS_API_KEY`.

### A.3.1 Pantallas (menú lateral, según el permiso de cada rol)
- **Mapa** (`/`): la pantalla principal.
- **Dashboard Serenos** y **Dashboard PNP**: estadísticas de incidencias.
- **Reportes de incidencias.**
- **Administración:** Actividades, Incidencias PNP, Tipos, Subtipos y Modalidades de incidencia, Radios GPS, Bodycams, Cámaras vecinales, Cámaras municipales, Comisarías, Puntos de obra, Usuarios, Roles y Auditoría.

### A.3.2 Capas del mapa (`src/components/capas/`)
- **Cámaras:** municipales (con ángulo y cono de visión; si están caídas aparecen en gris u ocultas) y vecinales, con sus leyendas.
- **Incidencias de serenazgo por tipo:** Robos, Hurtos, Daños/Patrimonio, Drogas, Extorsión, Feminicidios, Homicidios, Secuestros, Sicariatos, Barras. Se muestran como clusters o puntos.
- **Incidencias PNP:** como clusters o puntos.
- **Cluster combinado** (serenazgo + PNP).
- **Mapa de calor de incidencias.**
- **Radios GPS en vivo** (`CapaRadios`), con leyenda, **recorrido histórico de una radio** (`CapaRecorridoRadio`) y **cercos GPS** (`CapaCercosGPS`).
- **Bodycams** en vivo e historial.
- **Puntos cercanos:** marcas un punto y ves qué radios estuvieron o están en un radio de N metros.
- **Rutas de vehículo** (`CapaRutas`): haces clic en varios puntos y calcula la ruta con **OSRM público** (`router.project-osrm.org`).
- **Calculador de rutas con Google** (`GoogleRoutesCalculator`): DirectionsService con tráfico y waypoints optimizados (versión Google Maps).
- **Otros:** jurisdicciones (y jurisdicción CODISEC), comisarías, Defensa Civil, paraderos autorizados y no autorizados, residuos, sostenimiento, actividades, puntos de obra, búsqueda de direcciones, ubicador de puntos o coordenadas, y "mi ubicación".
- **Controles:** búsqueda de cámaras, radios, bodycams y direcciones; panel de filtros de seguridad; panel para activar y desactivar capas; rutas de móviles; rutas de bodycams; radios flotante.

### A.3.3 Sesión en la web
`AuthContext` maneja el JWT, los permisos (`custom-role/mine`) y la conexión SSE (`sessionGuard.js`): si llega un evento de revocación, se cierra la sesión con su mensaje. Si la web corre dentro de la app, `nativeDevice.js` habla con el puente nativo para firmar con el celular.

---

## A.4 App móvil (`map610-app`, nombre "MIT")
- Expo SDK 54 con EAS Build (cuenta `dmat39`). Paquete Android **`mit.sjl`**, versión 1.0.1, en **prueba interna** de Google Play Console.
- **Arquitectura:** un **WebView** que carga `https://mit.munisjl.gob.pe/`, más un puente (`src/bridge.ts`) y un **módulo nativo Kotlin `device-key`**. Ese módulo genera una llave ECDSA en el Keystore o StrongBox del celular, firma los retos del login y entrega la cadena de Key Attestation.
- Por ahora **no tiene**: permiso de ubicación, servicio de GPS en segundo plano, notificaciones push (FCM), sonido de alarma ni pantallas nativas. **Todo eso hace falta para el despacho.**
- iOS pendiente. Expo Go no sirve (no trae el módulo nativo).

---

## A.5 Piezas que ya sirven para el despacho

| Necesidad del despacho | Lo que ya existe |
|---|---|
| Ver dónde están las unidades | `gps-radio` (Dolphin, en vivo cada 15 s) + `CapaRadios` |
| Saber qué unidad está cerca de un punto | `gps-radio/cercanos` y `radios/cercanas` (distancia en línea recta) |
| Historial de recorridos | `gps-radio/historico`, `km-dias`, `CapaRecorridoRadio` |
| Zonas o sectores con unidades asignadas | `gps-zona` (GeoJSON + `radios_issi`) |
| Incidencias históricas para puntos críticos | `incidence` (serenazgo, con turno y franja horaria) + `pnp-incidence` + mapa de calor |
| Cámaras cerca de una incidencia | `camaras/cercanas` |
| Tiempo real del servidor a los dispositivos | SSE (`session-events`), hoy solo para sesiones; se puede generalizar |
| Identificar con seguridad el equipo de la camioneta | Usuario `mobile_only` + celular vinculado + Key Attestation |
| App instalada en Android | `map610-app` (`mit.sjl`) |
| Calcular rutas | OSRM (público) y Google Directions en la web |
| Roles y permisos para nuevas pantallas | `CustomRole` + `RoleModulePermission` (agregar `module_key` `despacho`) |
| Trazabilidad | `AuditLog` |

**Lo que no existe todavía:**
- entidad "Unidad/Móvil" propia (hoy la radio de Dolphin es la "unidad"),
- incidencias **creadas en la central** con estado de atención (las de serenazgo vienen de otro sistema y son de solo lectura),
- asignaciones, estados de la unidad, notificaciones push, GPS desde la tablet,
- puestos fijos, sectores de patrullaje, rutas sugeridas, cumplimiento del patrullaje,
- guardar nosotros el historial de GPS (hoy depende de Dolphin).

---

## A.6 El Sistema de Incidencias CECOM (la "BD externa" es nuestra)

La BD externa que SIVECAM lee en solo lectura (`cecom_incidencias`) es la del **Sistema de Incidencias CECOM**, desarrollado por el mismo equipo. Está en `2-Proyectos_01\SISTEMAS CECOM NUEVO\`:
- `incidencias_cecom_back`: NestJS 11 + Prisma 6 + PostgreSQL + **WebSockets (Socket.IO)**.
- `incidencias_cecom_front`: **Next.js 14** + Leaflet + socket.io-client.

**Qué tiene:**
- **Incidencia:** código correlativo según el medio (`R2026…`, `WA…`); clasificación Unidad (SERENAZGO, POLICÍA, BOMBEROS: *es la institución, no el vehículo*) → Tipo → Subtipo; reportante; `direccion` + `latitud/longitud`; severidad; jurisdicción; `situacionId` (PENDIENTE, EN ATENCIÓN, ATENDIDA, CERRADA, CANCELADA); medio; operador; usuario; datos de la atención (`descripcionIntervencion`, agraviado); serenos que participaron (`incidencia_serenos`); evidencias; apoyo de convenio y participación de motorizados. Tiempos: `registradoEn`, `ocurridoEn`, `atendidoEn`.
- **Endpoints:** CRUD, `PATCH :id/estado`, `PATCH :id/atencion`, `PATCH :id/serenos`, evidencias, mapa, mapa de calor, estadísticas y métricas por operador.
- **Eventos Socket.IO:** `nueva-incidencia`, `incidencia-actualizada`, `incidencia-atendida`, `incidencia-cerrada` y alertas de pánico (`alerta-panico-nueva`, `-tomada`, `-liberada`, `-actualizada`). Un operador "toma" una alerta y queda bloqueada para los demás.
- **Módulos:** `panico-app` (webhook del **botón de pánico digital** / app "Vecino Seguro", que crea la incidencia y le asigna la jurisdicción con un GeoJSON), `svi` (envío al sistema SVI), `gestionate` (personal por DNI), `serenos`, `reportes`, `auditoria`, `rutas` (tabla de tracking GPS por unidad, **vacía**).
- **Medios de reporte:**
  - R = Digitación: lo que el sereno reporta por radio y escribe el operador de la torre.
  - G = Radio / cámaras.
  - WA = WhatsApp.
  - C = Llamada fija.
  - APP = Vecino Seguro.
  - BP = Botón de pánico / Boletín.
- **Operadores (puestos):** TORRE-CENTRO, TORRE-NORTE, TORRE-SUR, TORRE-OPERACIONES, OP. CÁMARAS por zona (Bayóvar, Canto Rey, Zárate, Huayrona, etc.), OPERADOR-WHATSAPP-n, OPERADOR-TELEFONÍA-n.
- **Documentos de análisis** en esa carpeta: `ANALISIS_DUPLICIDAD_INCIDENCIAS.md` (el operador de cámaras y el digitador registran el **mismo evento dos veces**), `ANALISIS_CAMPOS_INCIDENCIAS_COMPLETO.md` (la pestaña "Atención" casi nunca se llena) y otros.

**Datos reales** (copia local de la BD, de solo lectura; últimos 90 días disponibles, del 2026-03-07 al 2026-06-05; producción puede diferir):

| Métrica | Valor |
|---|---|
| Incidencias en total (desde el 2024-12-31) | 103,794 |
| Por día | **~123** (Mañana 6–14 h: 20 · Tarde 14–22 h: 77 · Noche 22–6 h: 26) |
| Por medio (90 días) | R 4,501 · WA 3,727 · G 1,404 · C 1,394 · APP 6 |
| Con GPS / con dirección | **99.9%** / 99.9% (las dos cosas) |
| Usuarios que registran | 67 distintos; **promedio de 3.8 y máximo de 11** registrando en la misma hora |
| Demora `registradoEn − ocurridoEn` | mediana de **~1 min**; p90 de ~2 h; 10% registradas más de 2 h después |
| Estado | **98.8% ATENDIDA** · PENDIENTE 16 · EN ATENCIÓN 2 |
| `atendidoEn` lleno | solo ~17% (1,932 de 11,033) |
| Con serenos vinculados | ~11% |
| Tracking GPS (`rutas`) | 0 filas |
| Tipos más frecuentes | Infracciones a ordenanzas (58%), buenas costumbres, auxilio y rescate, tranquilidad y orden, tránsito, patrimonio |

**Lo que se deduce:**
- Casi todo se registra **ya como ATENDIDA**. El sistema funciona como **bitácora**, no como despacho: no hay ciclo pendiente → asignada → en camino → atendida.
- El **tiempo de respuesta no se mide** de forma confiable: `atendidoEn` casi siempre está vacío.

## A.7 Cómo se opera hoy (confirmado por el usuario, 2026-11-02)

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se despacha? | **Solo por radio TETRA**, por voz. |
| ¿Y si la móvil no encuentra el lugar? | Por **"línea baja"**: llamada de celular o WhatsApp, con fotos para ubicarse. |
| ¿Quién decide qué móvil va? | **La torre** (TORRE-CENTRO, NORTE, SUR y OPERACIONES; cada una maneja su zona). |
| ¿Quién registra y cuándo? | El **sereno envía los datos por WhatsApp** al terminar y el **operador los escribe** en el Sistema de Incidencias. Por eso casi todo entra como ATENDIDA. |
| ¿Se mide el tiempo de respuesta? | **No.** |

**Consecuencias para el diseño:**
1. **La radio TETRA se mantiene** como canal de voz. El sistema la complementa: da la ubicación exacta, la navegación, los estados y los tiempos.
2. **El usuario del despacho es el operador de la torre.** La vista "Despacho" se filtra por la zona de cada torre (jurisdicciones o `GpsZone`).
3. **Las radios TETRA ya tienen GPS (Dolphin).** Con eso se puede medir el tiempo de respuesta **sin tablets**: la torre asigna la incidencia a una radio (ISSI) en el sistema y la llegada se detecta sola cuando esa radio entra a unos 50 m del punto.
4. **Los problemas para ubicarse** (llamadas y fotos por WhatsApp) se resuelven mandando el **pin exacto** y abriendo Waze o Google Maps. Mientras no haya app, puede ser un enlace por WhatsApp.
5. **El reporte que hoy llega por WhatsApp** se reemplaza más adelante por un formulario en la app con fotos y GPS, que llega directo al Sistema de Incidencias. El operador **revisa** en lugar de volver a escribir todo, y se evitan duplicados.

---

# PARTE B — LAS IDEAS DEL USUARIO (ordenadas)

Esto es lo que planteó el responsable del proyecto, con sus palabras ordenadas:

1. **¿Módulo dentro de este sistema o sistema aparte?** "Aquí está todo." La pregunta es si conviene hacer el despacho como módulo de este mismo sistema o como un sistema nuevo.

2. **Despacho desde la central:** el operador ve en el mapa que, por ejemplo, **la móvil 34 está cerca** de una incidencia. **Hace clic en la móvil** y le indica: "tienes una incidencia en tal punto".

3. **Pantalla en las camionetas:** las camionetas tienen una pantalla. Hay que decidir si se instala **una aplicación** o si se entra **por la web**, y verificar qué es lo correcto y qué es posible.

4. **Que le diga cómo llegar:** cuando le asignan la incidencia, la móvil debe recibir **cómo llegar**. La mejor experiencia sería **integrar Waze y Google Maps**.

5. **Móviles fijas en un punto:** habrá **móviles estacionadas en un punto fijo** (por ejemplo, **remolques**).

6. **Móviles patrullando alrededor de la fija:** cerca de cada móvil fija, sin alejarse mucho, habrá **móviles patrullando**.

7. **Patrullaje según incidencias:** las patrulleras se mueven según las incidencias. Por eso importa el **reporte de incidencias de serenos y de la policía**: para que las móviles **ronden por los puntos donde hay o hubo incidencias, cerca del punto de la móvil fija**, pasando por donde hubo incidencias anteriores.

8. **Finalidad:** seguridad ciudadana. Hay que darle vueltas a la idea y ver qué sale.

---

# PARTE C — PROPUESTA TÉCNICA (lo que añadió Claude)

## C.1 Decisión (revisada al saber que el Sistema de Incidencias es nuestro)
**La incidencia vive en un solo lugar: el Sistema de Incidencias CECOM.** El despacho no crea "otra incidencia":
- **Sistema de Incidencias:** sigue siendo la **única fuente** de la incidencia y de su ciclo de vida. Se usa de verdad PENDIENTE → EN ATENCIÓN → ATENDIDA, y `atendidoEn` se llena solo. Los operadores registran donde ya lo hacen.
- **SIVECAM (módulo `dispatch`):** mapa de despacho, unidades y vehículos, GPS (Dolphin y tablet), asignación, app de la camioneta y patrullaje. Guarda `DispatchAssignment` con referencia al `incidencias.id` o al `codigoIncidencia`.
- **Integración entre ambos:**
  - SIVECAM escucha `nueva-incidencia` / `incidencia-actualizada` (Socket.IO) o recibe un webhook, y muestra las PENDIENTES en el mapa de despacho.
  - Los cambios de estado de la unidad (asignada, en camino, llegó, cerró) se escriben de vuelta **por la API** del Sistema de Incidencias (`PATCH :id/estado`, `:id/atencion`, `:id/serenos`), con un usuario de servicio. **No se escribe directo en su BD.**
- **Alternativa:** poner el despacho completo dentro del Sistema de Incidencias. Se descarta porque el GPS, los vehículos, el vínculo con el celular y la app ya están en SIVECAM.
- **Efecto extra:** con el registro desde el inicio y un solo origen, se reduce la **duplicidad** (cámaras + digitación) documentada en `ANALISIS_DUPLICIDAD_INCIDENCIAS.md`. Al asignar, el sistema puede sugerir "posible duplicado: incidencia a menos de 200 m en los últimos 30 min".
- **Cuidado con los nombres:** `Unidad` en el Sistema de Incidencias es la institución (Serenazgo, PNP, Bomberos). El vehículo en SIVECAM se llamará `Vehicle` / "Móvil".

Lo que sigue en esta sección aplica a la parte de SIVECAM:
- Un sistema aparte tendría que copiar justo lo que ya existe: usuarios, roles, auditoría, GPS de Dolphin, incidencias de serenazgo y PNP, cámaras, SSE y el vínculo con el celular.
- Lo que sí se separa es la **pantalla**:
  - **Central:** vista nueva "Despacho" en la web actual, sobre el mismo mapa.
  - **Camioneta:** un "modo unidad" en la app Android (`mit.sjl`), con una pantalla simple de botones grandes.
- Solo se separaría en un servicio aparte más adelante, si la carga lo exige (muchas unidades enviando GPS cada pocos segundos).

## C.2 Decisión: app en la camioneta, no web
| Necesidad | Web (navegador) | App Android |
|---|---|---|
| Sonar una alarma con la pantalla apagada o bloqueada | ❌ | ✅ push FCM de alta prioridad |
| Enviar GPS en segundo plano | ❌ el navegador lo suspende | ✅ servicio en primer plano |
| Modo kiosko (la pantalla queda fija en la app) | ❌ | ✅ |
| Abrir Waze o Google Maps con el destino | ✅ | ✅ |
| Saber que el equipo es de la camioneta 34 | ❌ | ✅ ya resuelto (`mobile_only` + Key Attestation) |
| Seguir funcionando con mala señal (cola de envíos) | limitado | ✅ |

**Implicancias para la app:**
- agregar `expo-location` + `expo-task-manager` (ubicación en segundo plano),
- agregar notificaciones con FCM (`expo-notifications`) y un canal de alta prioridad con sonido propio,
- pantallas nativas del modo unidad, o seguir con la web dentro del WebView más avisos nativos,
- pedir permisos de ubicación "todo el tiempo" y quitar la optimización de batería,
- **compilar una APK nueva.**

Cada camioneta tiene un **usuario de tipo unidad** vinculado a su tablet o celular.

## C.3 Navegación con Waze y Google
**No construir un navegador propio.** Al recibir la incidencia, la app muestra botones grandes que abren la app de navegación con el destino ya puesto:
- **Waze:** `https://waze.com/ul?ll=LAT,LNG&navigate=yes`
- **Google Maps (Android):** `google.navigation:q=LAT,LNG&mode=d`
- **Google Maps (universal):** `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=driving` (acepta `waypoints=` para varias paradas, útil en el patrullaje)

Es gratis, no necesita clave de API y el chofer ya conoce esas apps. En Lima, Waze suele dar la mejor ruta por el tráfico.

**Tiempo estimado de llegada para elegir la móvil (en la central), por etapas:**
1. **Distancia en línea recta** (haversine; ya existe). Gratis e inmediato.
2. **OSRM propio** (instalado en nuestro servidor con el mapa de OpenStreetMap de Lima). Gratis, da la distancia real por calles, pero **no ve el tráfico**. Hoy la web usa el OSRM público, que no está pensado para uso en producción.
3. **Google Routes API** (`computeRouteMatrix`). Tiene tráfico real y es **de pago por elemento**; usarla solo con los 3 o 4 candidatos más cercanos.
4. **Waze for Cities** (programa gratuito para gobiernos): la municipalidad comparte datos y recibe un feed de tráfico, accidentes y cierres. Sirve para alertas y mapas de la central, no para calcular rutas.

## C.4 Flujo de despacho
```
Origen de la incidencia: operador de cámaras / llamada / sereno / PNP / app ciudadana / botón de pánico de cámara
  → se crea la incidencia de despacho (tipo, prioridad, punto, descripción)
  → la central ve los móviles DISPONIBLES ordenados por tiempo de llegada (y las cámaras cercanas)
  → elige la móvil 34 (o el sistema la sugiere) → ASIGNADA
  → push con alarma en la tablet → el chofer ACEPTA (si no acepta en 60 s, se avisa a la central)
  → EN CAMINO (botón de Waze o Google)
  → a menos de unos 50 m del punto, pasa sola a EN EL LUGAR (geocerca)
  → atención → cierre con resultado, nota y fotos → DISPONIBLE
  → se registran los tiempos: creación→asignación, asignación→aceptación, aceptación→llegada, llegada→cierre
```
**Estados de la unidad:** DISPONIBLE, ASIGNADA, EN_CAMINO, EN_ESCENA, OCUPADA (otra tarea), FUERA_DE_SERVICIO (descanso, mantenimiento, sin señal).
**Estados de la incidencia de despacho:** NUEVA, ASIGNADA, EN_ATENCIÓN, CERRADA, CANCELADA. También puede tener **varias unidades** asignadas (apoyo).
**Indicador clave:** el tiempo de respuesta. Es lo que piden las autoridades y lo que justifica el sistema.

## C.5 Puestos fijos y patrullaje inteligente
**Modelo:**
- **Puesto fijo:** punto donde se queda una móvil (por ejemplo, un remolque), con su horario.
- **Sector:** radio o polígono alrededor del puesto (por ejemplo, entre 1 y 1.5 km). Se puede reutilizar `GpsZone`.
- **Patrulleras:** unidades asignadas a ese puesto o sector, por turno.

**Algoritmo de puntos críticos:**
1. Dividir el sector en celdas (cuadrícula de unos 100 m o índice **H3** de Uber).
2. Puntaje de cada celda = Σ incidencias × **peso por gravedad** (sicariato > robo > hurto…) × **antigüedad** (por ejemplo, la mitad del peso cada 30 días) × **coincidencia de horario** (misma franja de 2 h y mismo día de la semana pesan más). Se usan las incidencias de serenazgo y de la PNP.
3. Las celdas con mayor puntaje dentro del sector son los **puntos de control** del turno.
4. Ordenarlos en una ruta (vecino más cercano o un TSP simple con OR-Tools o OSRM `trip`) e incluir **algo de aleatoriedad** para que el patrullaje **no sea predecible**.
5. Recalcular cada turno o cada 2 horas, y también cuando entra una incidencia nueva en el sector.

**En la tablet:** la ruta sugerida con sus puntos de control en el mapa. El GPS **confirma solo** si la móvil pasó por cada punto (a menos de unos 50 m).
**En la central:** el **cumplimiento del patrullaje** (por ejemplo, "la móvil 12 cubrió 8 de 10 puntos") y la cobertura del sector.

**Reglas:**
- Al despachar, se propone primero una patrullera y **no** la móvil fija, para no dejar el puesto vacío.
- Si una patrullera sale de su sector por un despacho, la central recibe el aviso **"sector X sin cobertura"** y el sistema propone mover otra.
- El supervisor puede fijar puntos de control a mano (colegios a la hora de salida, paraderos, mercados).

**Referencias para investigar:** *hot spot policing*, *predictive policing* (PredPol / Geolitica y sus críticas), Kernel Density Estimation, el método *near-repeat*, *Risk Terrain Modeling* y la "regla de Koper" (paradas de 10–15 minutos en los puntos críticos).

## C.6 Ideas adicionales
- **Cámaras cercanas al despacho:** al crear o asignar, la central ve las cámaras cerca del punto (ya existe `camaras/cercanas`) y puede seguir la unidad.
- **Guardar nuestro propio historial de GPS** (tabla de posiciones) para reproducir recorridos y medir el cumplimiento sin depender de Dolphin. Considerar **PostGIS** y particionar por fecha.
- **Botón de pánico** en la tablet (alerta a la central con la posición).
- **Turnos y tripulación:** qué serenos van en qué móvil y en qué turno.
- **Chat o mensajes cortos** central ↔ unidad (plantillas: "solicito apoyo", "llegué", "sin novedad").
- **Fotos y evidencia** en el cierre.
- **Panel de indicadores:** tiempo promedio de respuesta por sector y turno, incidencias atendidas, cumplimiento del patrullaje, km recorridos.
- **Integraciones futuras:** el botón de pánico de las cámaras municipales (`buttom`), una app ciudadana o canal de denuncias, la central 105 de la PNP y las comisarías.
- **Funcionar sin señal:** la tablet guarda los eventos y los envía al reconectar.
- **Tiempo real a escala:** el SSE actual vive en memoria; con varias instancias del backend hará falta Redis pub/sub o WebSockets (Socket.IO con adaptador Redis).

## C.7 Modelo de datos propuesto (borrador)
```
Vehicle (unidad/móvil)  id, code ("34"), plate, type (CAMIONETA/MOTO/REMOLQUE/A_PIE), radio_issi (Dolphin),
                        device_user_id (User mobile_only de la tablet), status, is_fixed, fixed_post_id?, active
FixedPost (puesto fijo) id, name, lat, lng, radius_m, sector_zone_id? (GpsZone), schedule
PatrolAssignment        id, vehicle_id, fixed_post_id/sector_id, shift, date, crew (serenos)
DispatchIncident        id, source (CENTRAL/CAMARA/SERENO/PNP/CIUDADANO/PANICO), external_ref?, type, priority,
                        lat, lng, address, description, status, created_by, created_at, closed_at, result
DispatchAssignment      id, incident_id, vehicle_id, assigned_by, assigned_at, accepted_at, en_route_at,
                        arrived_at, cleared_at, rejected_reason, eta_seconds_at_assign, distance_m_at_assign
VehiclePosition         id, vehicle_id, lat, lng, speed, heading, source (DOLPHIN/TABLET), recorded_at   (alto volumen)
PatrolRoute             id, vehicle_id, sector_id, generated_at, valid_until, algorithm_version
PatrolCheckpoint        id, route_id, order, lat, lng, score, reason, visited_at?
DeviceToken             id, user_id, fcm_token, platform, updated_at
```

## C.8 Endpoints propuestos (borrador)
- `GET dispatch/vehicles` (estado y posición) · `PATCH dispatch/vehicles/:id/status`
- `POST dispatch/incidents` · `GET dispatch/incidents?status=` · `PATCH dispatch/incidents/:id`
- `GET dispatch/incidents/:id/candidates` (unidades ordenadas por tiempo de llegada)
- `POST dispatch/incidents/:id/assign` · `POST dispatch/assignments/:id/{accept|reject|arrive|clear}`
- `POST dispatch/positions` (lote de posiciones desde la tablet)
- `GET dispatch/patrol/my-route` (tablet) · `POST dispatch/patrol/routes/generate` · `GET dispatch/patrol/compliance`
- Tiempo real: canal `dispatch-events` (SSE o WebSocket) para la central y push FCM para las tablets.

## C.9 Fases
0. **Fase 0 (sin hardware nuevo, con la radio TETRA de siempre):**
   - La torre crea la incidencia como **PENDIENTE** al despachar por radio (o la toma si ya entró por cámaras, WhatsApp o pánico).
   - En el mapa de SIVECAM ve las radios cercanas (Dolphin) y **asigna una radio (ISSI)**.
   - La llegada se marca sola por geocerca con el GPS de Dolphin, y la torre marca ATENDIDA.
   - Se miden por primera vez los tiempos de asignación, llegada y cierre.
   - Opcional: botón "enviar ubicación por WhatsApp", que copia el enlace de Waze o Google Maps.
1. **Fase 1 (MVP de despacho):** `Vehicle` vinculado a una radio de Dolphin y a la tablet; estados; crear incidencia de despacho; candidatos por distancia en línea recta; asignar; push con alarma; botones de Waze y Google; aceptar, llegar y cerrar; registro de tiempos. Vista "Despacho" en la web y modo unidad en la app (APK nueva con ubicación y notificaciones).
2. **Fase 2:** tiempo de llegada real (OSRM propio o Google Routes en los mejores candidatos), llegada automática por geocerca, aviso cuando nadie acepta, apoyo con varias unidades, historial propio de GPS.
3. **Fase 3 (patrullaje):** puestos fijos, sectores, mapa de puntos críticos por franja horaria, rutas sugeridas, puntos de control y cumplimiento, alerta de sector sin cobertura.
4. **Fase 4 (análisis):** reproducción de recorridos, indicadores, comparación entre turnos y sectores, evaluación del efecto del patrullaje en las incidencias.

## C.11 Costos estimados de mapas y rutas (investigado el 2026-11-02)

**Qué se usa hoy:**

| Sistema | Mapa base | Búsqueda de direcciones | Rutas | Google |
|---|---|---|---|---|
| SIVECAM web | Leaflet + teselas de OpenStreetMap (por defecto) y Carto en modo oscuro; hay un modo Google opcional (`mapType`) | Nominatim y Photon (gratis) | OSRM público | Maps JavaScript API (`places`, `geometry`, `routes`, `visualization`), Geocoder, DirectionsService y HeatmapLayer, **solo en el modo Google** |
| Sistema de Incidencias | Leaflet + teselas de OpenStreetMap | Nominatim (dirección desde el pin) | — | No usa |

**Riesgos de lo actual:**
- `tile.openstreetmap.org` y Nominatim público tienen políticas de uso justo (Nominatim: máximo 1 consulta por segundo, sin uso intensivo). Una central 24/7 puede ser bloqueada.
- `google.maps.visualization.HeatmapLayer` quedó deprecada el 2025-05-27 y se retiró en la versión de mayo de 2026. El mapa de calor del modo Google necesita reemplazo (deck.gl u otro).

**Precios de Google Maps Platform** (pago por uso; cada SKU trae una cuota gratis al mes por cuenta de facturación; tramo hasta 100 mil, en USD por cada 1,000):

| SKU | Gratis/mes | Precio |
|---|---|---|
| Dynamic Maps (Maps JS; se cobra por **carga de mapa**, no por mover el mapa ni hacer zoom) | 10,000 | $7.00 |
| Maps SDK Android (mapa nativo en la tablet) | **ilimitado** | $0 |
| Geocoding | 10,000 | $5.00 |
| Autocomplete Requests | 10,000 | $2.83 |
| Place Details Essentials | 10,000 | $5.00 |
| Compute Routes / Route Matrix Essentials (sin tráfico, hasta 10 paradas) | 10,000 | $5.00 |
| Compute Routes / Route Matrix **Pro** (`TRAFFIC_AWARE`, con tráfico) | 5,000 | $10.00 |
| Navigation SDK (navegación dentro de nuestra app) | 1,000 | $25.00 |
| Map Tiles 2D (para usar teselas de Google con Leaflet) | 100,000 | $0.60 |
| Static Maps | 10,000 | $2.00 |

- Route Matrix se cobra por **elemento** (orígenes × destinos).
- **Suscripciones** (alternativa a pagar por uso): Starter $100/mes por 50 mil llamadas (solo Dynamic Maps + Geocoding); Essentials $275/mes por 100 mil; Pro $1,200/mes por 250 mil. Con nuestro volumen sale **más barato pagar por uso**.

**Waze:**
- Los enlaces que abren Waze o Google Maps (`waze.com/ul`, `google.navigation:`) son **gratis**.
- Waze for Cities es gratis para entidades públicas (se intercambian datos).
- Waze no tiene una API de rutas pública que se pueda usar desde nuestro sistema.

**Supuestos de volumen:** ~123 incidencias al día (~3,700 al mes); unos 30 usuarios activos al día en SIVECAM con unas 15 cargas de mapa cada uno; 5 móviles candidatas por despacho; tablets con mapa nativo.

| Escenario | Qué incluye | USD/mes |
|---|---|---|
| **A. Mínimo** | Se queda Leaflet; solo Route Matrix sin tráfico al despachar | **~$45** |
| **B. Recomendado** | Google Maps JS en la central de SIVECAM; Geocoding; Route Matrix **con tráfico** al asignar; ruta de la unidad asignada; tablet nativa (SDK gratis); Waze y Google por enlace | **~$160** (unos $90 si la matriz con tráfico se calcula solo para las 3 más cercanas) |
| **C. Todo Google** | B + el Sistema de Incidencias también pasa a Google (selector de pin, autocompletado) | **~$400** |
| **D. Alto** | Uso intenso, recálculo de tiempos de llegada en vivo y Navigation SDK dentro de la app | **~$1,400** |
| Patrullaje (rutas de hasta 10 puntos, 30 móviles, 12 rutas al día) | Compute Routes Essentials | ~$0–25 (o $0 con OSRM propio) |
| Mostrar teselas de Google dentro de Leaflet (Map Tiles) | 20 operadores, 1,500–3,000 teselas al día cada uno | ~$480–$920 (**no conviene**) |

**Reglas para controlar el gasto:**
1. **No volver a cargar el mapa** al navegar entre pantallas (cada carga cuesta).
2. Calcular el tiempo de llegada **solo al asignar** y solo para las 3–5 más cercanas en línea recta.
3. La tablet con mapa **nativo** (gratis), no con el mapa web dentro del WebView.
4. Navegación por enlace a Waze o Google Maps, no Navigation SDK.
5. Configurar en Google Cloud **cuotas diarias por API** y **alertas de presupuesto**. Restringir la llave por dominio (web) y por paquete `mit.sjl` + firma (Android).

## C.10 Preguntas abiertas y temas para investigar

**Preguntas al usuario (decisiones de campo):**
1. ¿Qué es la pantalla de la camioneta: tablet o celular Android, radio de auto con pantalla, Android Auto? ¿Marca y modelo?
2. ¿El GPS de Dolphin va **en la camioneta** o en la **radio que lleva el sereno**? (Define si la unidad se ubica por Dolphin o por la tablet.)
3. ¿Las tablets tienen **chip con datos móviles**? ¿Cómo es la cobertura en las zonas altas de SJL?
4. ¿Cuántas móviles, motos, puestos fijos (remolques) y turnos hay?
5. ~~¿Quién despacha?~~ **Resuelto:** la torre (ver A.7). Falta saber cuántos operadores hay por torre y por turno.
6. ~~¿Las incidencias de despacho se escriben también en la BD externa?~~ **Resuelto:** la BD externa es nuestro Sistema de Incidencias; la incidencia vive ahí (ver C.1).
7. ~~¿Cómo despachan hoy?~~ **Resuelto:** solo por radio TETRA; si la móvil no encuentra el lugar, por llamada o WhatsApp con fotos (ver A.7).
8. ~~¿Por qué casi todo entra como ATENDIDA?~~ **Resuelto:** el sereno manda los datos por WhatsApp al terminar y el operador los escribe.
9. ~~¿Se mide el tiempo de respuesta?~~ **Resuelto:** no se mide.
10. ~~¿Cada móvil lleva su propia radio TETRA con GPS?~~ **Resuelto (2026-11-12):** cada móvil tiene una radio TETRA **fija** instalada. Falta verificar: (a) que esa radio reporte GPS a Dolphin, (b) cada cuánto reporta, (c) si los serenos además llevan radios portátiles que también aparecen en Dolphin, y (d) quién actualiza la relación radio-móvil cuando se cambia una radio por reparación.
11. ¿Hay presupuesto para Google Maps Platform, o solo opciones gratuitas?

**Temas para investigar en internet:**
- Sistemas CAD (*Computer-Aided Dispatch*) de código abierto y comerciales, para tomar ideas de flujo y pantallas.
- Deep links de **Waze** (`waze.com/ul`) y de **Google Maps** (intents de Android y URLs universales), y sus límites (cantidad de waypoints).
- **Waze for Cities / Waze Partner Hub:** requisitos para que una municipalidad peruana se inscriba y qué datos entrega.
- **Google Routes API** (`computeRouteMatrix`): precio actual, cuota gratuita y alternativas.
- **OSRM** o **Valhalla** propios con el extracto de OpenStreetMap de Perú (Geofabrik): requisitos de servidor.
- **Expo:** `expo-location` en segundo plano + `expo-task-manager`, `expo-notifications` con FCM de alta prioridad, servicio en primer plano en Android 14/15, modo kiosko (*lock task mode* / *Device Owner*), y restricciones de Google Play para ubicación en segundo plano (declaración de permisos).
- **Hot spot policing**, near-repeat, KDE, Risk Terrain Modeling y la regla de Koper; también la evidencia y las críticas de la *predictive policing*.
- **H3** (indexado hexagonal) y **PostGIS** para la cuadrícula y las consultas espaciales.
- Experiencias de serenazgo en municipalidades de Lima (Miraflores, San Isidro, Surco, La Molina) con despacho y GPS.
- Normativa peruana: Ley 27933 (Sistema Nacional de Seguridad Ciudadana), protección de datos personales (Ley 29733) para el GPS de trabajadores y las fotos.

---

# PARTE D — REVISIÓN DE LOS PROYECTOS PARALELOS Y PLAN PARA UNIRLOS EN MIT (2026-11-12)

**Meta (palabras del usuario):** todo unificado en **MIT** (por eso se hizo la seguridad por módulo, el cierre de sesión y los límites). Tres cosas en un solo sistema:
1. **Rutas inteligentes** para cada móvil, **por turno, 24/7, todo el año**, marcadas según las incidencias que se recopilan a diario, con un análisis casi predictivo que **aprende** con cada incidencia nueva.
2. **Despacho:** cuando ocurre una incidencia, mandar una móvil.
3. **Ruta manual:** un usuario la crea por **orden del subgerente o del alcalde**.

Proyectos revisados: `Despacho-Asistido-SJL`, `PredivctiveIncidence` (análisis predictivo; es la pieza de las "rutas inteligentes") y `Sivecam_Backend`.

## D.1 `Despacho-Asistido-SJL` — prototipo de despacho

**Qué es:** Express 5 + Socket.IO (server) y React 19 + Vite 8 + Tailwind 4 + Leaflet (client); un solo commit. Pantallas: panel CECOM (mapa 65 % / panel 35 %), "terminal móvil" web con sirena (Web Audio) y guía de integración con fragmentos NestJS y Kotlin. La carpeta `android-app/` (`com.cecom.patrullero`) tiene **solo archivos Gradle, sin código fuente**.

**Qué vale la pena rescatar:**
- `server/src/geoService.ts`: prefiltro Haversine de las 8 más cercanas → ruta vial OSRM en paralelo con *timeout* de 2.5 s → respaldo heurístico (distancia recta × 1.35, 28 km/h) → orden por disponibilidad y ETA. Es exactamente el ranking de C.4.
- La generación de enlaces Waze y Google Maps.
- Los nombres de eventos Socket.IO (`despacho:alerta_unidad`, `despacho:asignado_global`, `patrulla:ubicacion_actualizada`, `despacho:estado_actualizado`) y las salas por móvil (`movil:<id>`).
- El diseño de pantallas (panel CECOM, alerta en la terminal con sirena, botones Waze / Google Maps) como referencia de UX.

**Qué no sirve para producción (y por qué):**

| # | Problema | Consecuencia |
|---|---|---|
| 1 | Todo en memoria (`Store` con `Map`); 6 patrullas inventadas con nombres y teléfonos de ejemplo; simulación GPS **encendida por defecto** | Al reiniciar se pierde todo y no hay historial |
| 2 | **Cero autenticación** en REST y sockets, con `cors: '*'`: cualquiera puede unirse a `movil:X`, enviar GPS falso o cambiar estados | Inaceptable en un sistema de seguridad |
| 3 | `POST /api/incidencias` **auto-despacha** sin confirmación | Contradice la operación real: **la torre decide** (A.7). Debe ser sugerencia + confirmación con un clic |
| 4 | Crea sus propias incidencias | Duplica el Sistema de Incidencias CECOM (contradice C.1) |
| 5 | `atendidaEn` se llena al **asignar**; no guarda hora de aceptación, salida, llegada ni cierre | No mide el tiempo de respuesta, que es el objetivo principal |
| 6 | `cambiar-estado` mezcla estados de patrulla e incidencia y no valida transiciones; se puede asignar una móvil ya ocupada (el ranking la devuelve si no hay ninguna disponible) | Estados inconsistentes |
| 7 | La ubicación viene solo de la tablet | Ignora el GPS TETRA de Dolphin que SIVECAM ya tiene (Fase 0 sin hardware) |
| 8 | OSRM público: 8 consultas por incidencia + 1 al asignar | Viola la política de uso con volumen real; usar OSRM propio o Google Matrix (ver C.11) |
| 9 | Usa `waze://` y un iframe de `embed.waze.com` | En Android es más robusto `https://waze.com/ul?...` (abre la app o la web); el iframe solo muestra un mapa, no navega |
| 10 | Es una tercera app Android separada (`com.cecom.patrullero`; la guía menciona `com.bodycam.tracker`) | Debe ser una pantalla de **MIT** (`mit.sjl`), no otra app |
| 11 | `.idea/` versionado; README con rutas de otra PC | Higiene |

**Veredicto:** buen **mockup funcional** para validar el flujo con la torre, pero **no es base de producción**. Se portan la lógica de `geoService.ts` al módulo `dispatch` de SIVECAM, las pantallas a `MAP_610_NEW` y la terminal a MIT.

## D.2 `PredivctiveIncidence` — motor predictivo (la pieza más madura)

**Qué es:** Python (pandas, scikit-learn) + PostgreSQL propio (puerto 5433) + FastAPI + frontend React (mapa de zonas y pronóstico). Lee **en vivo** la API de producción del Sistema de Incidencias (`GET /incidencias?unidadId=1` cada 10 s, con usuario de solo lectura y sin copiar datos personales).

**Lo que está bien hecho y hay que conservar:**
- **Auditoría y limpieza** con reglas trazables: jurisdicciones de 2025 permutadas (41 071 filas corregidas), dobles envíos, coordenada por defecto `-11.977148, -76.996402` repetida 14 962 veces, etc.
- **Backtest honesto.** Pronóstico jurisdicción × tipo × día. Error diario de 35 % y semanal de 20 % (ensamble RF + suavizado exponencial), ≈5 % mejor que el baseline. Techo práctico ≈30 %.
- **Modelo espacial.** Celdas de 200 m, semivida 21 días. El 10 % de celdas marcadas concentra ~58 % de las incidencias (~59–66 % en la prueba en vivo desde el 23-oct). **Esto es lo que hace útil la ruta inteligente.**
- **`GET /api/hotspots`.** Devuelve zonas con nivel, tipos probables, **franja horaria**, cámara más cercana y mensaje de acción. Elige puntos separados ≥350 m, que ya sirven como **paradas de ruta**.
- **"Aprende" de verdad.** El patrón espacial se reconstruye con cada incidencia nueva (decaimiento exponencial). El modelo temporal no se reentrena solo; falta programarlo.

**Qué falta o hay que corregir antes de unirlo:**

| # | Problema | Acción |
|---|---|---|
| 1 | **No es un repositorio git** | `git init` con un `.gitignore` que excluya `pgdata/`, `.env`, `models/*.joblib` (38 MB) y `data/*.csv` (5 MB de incidencias) |
| 2 | `.env` con credenciales de la API de producción dentro de la carpeta | No subirlo nunca; usar un usuario de solo lectura dedicado (el README ya lo indica) |
| 3 | La API **no tiene autenticación** (CORS solo localhost) | Publicarla solo en la red interna; SIVECAM la consulta servidor a servidor con `x-api-key` y el navegador nunca la llama directo |
| 4 | Franjas de 6 h (madrugada / mañana / tarde / noche) | Los turnos reales son 3 (`Shift`: MORNING / AFTERNOON / NIGHT en SIVECAM; Mañana / Tarde / Noche en Incidencias). Alinear a las horas reales de cada turno |
| 5 | La franja es solo una etiqueta ("la más frecuente") | Para rutas por turno hace falta un **puntaje por celda × turno**: `Λ[celda, turno] = Λ[celda] × participación_turno[celda]`, con la matriz `turno` que ya existe en `SpatialModel`. Nuevo endpoint `GET /api/hotspots?turno=&sector=` |
| 6 | Solo usa Serenazgo (`unidadId = 1`) | SIVECAM tiene `PnpIncidence` (incidencias PNP con coordenadas, turno y fecha). Incorporarlas como fuente; la idea original del usuario era serenazgo + policía |
| 7 | El reentrenamiento es manual | Reentrenamiento **semanal** programado + monitoreo de deriva (predicho vs. real, por celda y turno) |
| 8 | La sincronización solo detecta filas nuevas, no ediciones | Aceptable para el modelo; dejar anotada la limitación |
| 9 | **Sesgo de retroalimentación**: más patrullaje en una zona → más incidencias registradas ahí → más patrullaje | Guardar la **cobertura real** (minutos de patrulla por celda, del GPS) y usarla para corregir (ver D.5) |
| 10 | Usa solo las 34 cámaras de `camaras_nuevas.json` | Exportar las 610 desde SIVECAM (`CAMARAS_JSON`) o consultarlas por la API de integración (`camaras/cercanas`) |

**Veredicto:** **mantenerlo como microservicio Python aparte** (no reescribirlo en Node). SIVECAM lo consume.

## D.3 `Sivecam_Backend` — lo que ya está listo para unir y lo que falta

**Listo y reutilizable:**
- Seguridad por módulo y por capa (`CustomRoleGuard`, `@ModuleKey`, `@LayerKey`, `RoleModulePermission` con `can_create/edit/delete`).
- Límite de sesiones, horario de acceso, vinculación al celular (`mobile_only`), SSE de eventos de sesión y `AuditLog`.
- GPS de radios TETRA (Dolphin) con caché de 15 s.
- **`GpsZone`** (geocercas con `radios_issi`): la base natural de los **sectores** de patrullaje.
- `PnpIncidence`, la lectura del Sistema de Incidencias y la API de integración con `x-api-key`.

**Lo que falta para la meta:**

| Falta | Por qué es necesario |
|---|---|
| **Catálogo de móviles** (`Unit`: código, tipo, placa, radio ISSI, tablet vinculada, sector, puesto fijo) | Hoy la "móvil" no existe como entidad, y todo lo demás cuelga de ella |
| **Tripulación por turno** (quién va en qué móvil, qué día, qué turno) | Además, es la variable que el modelo predictivo dice que le falta para bajar del 35 % al 30 % de error |
| **Historial de posiciones** | Dolphin solo se cachea 15 s; sin historial no hay cumplimiento de ruta, tiempo de respuesta ni cobertura |
| **Gateway Socket.IO** (hoy solo hay SSE de sesión) | Para las alertas a la tablet y las actualizaciones en vivo del panel |
| Módulos `despacho`, `patrullaje`, `rutas-manuales` y capas `hotspots`, `moviles` | Se registran como `module_key` / `layer_key` nuevos y encajan en el sistema de permisos actual sin cambiarlo |
| En **MIT**: permiso de ubicación, servicio en primer plano, notificaciones push (FCM) | Hoy la app no tiene ubicación ni push |

## D.4 Arquitectura unificada propuesta

```
                    Sistema de Incidencias CECOM  (dueño de la incidencia)
                       │ Socket.IO / API                     ▲ PATCH estado / atención
                       ▼                                     │
 Motor predictivo ◀── SIVECAM backend (NestJS) = cerebro de MIT ──▶ Dolphin (GPS TETRA)
 (Python, interno)    · auth / roles / módulos / sesiones
  /api/hotspots       · móviles · tripulación · sectores (GpsZone)
  ?turno=&sector=     · despacho · planes de patrullaje · historial GPS
                       │ REST + Socket.IO
            ┌──────────┴───────────┐
       MAP_610_NEW (web)       MIT app (mit.sjl, tablet)
       torre / CECOM /         alerta de despacho, ruta del turno,
       subgerencia             Waze / Google por enlace, GPS
```

Regla: **un solo login (SIVECAM)**, una sola app (MIT) y una sola web. El motor predictivo y el Sistema de Incidencias quedan detrás del backend.

## D.5 Los tres tipos de ruta y cómo conviven

**Prioridad:** Despacho > Ruta manual > Ruta inteligente. La móvil siempre tiene **un solo plan activo**. Al terminar un despacho, MIT ofrece "reanudar ruta" en la siguiente parada pendiente.

**1. Ruta inteligente (automática, por turno, 24/7)**
- Un *job* genera el plan de cada móvil **~1 h antes de cada turno**, todos los días.
- Entradas: los `hotspots` del turno dentro del sector de la móvil, el puesto fijo (remolque) más cercano, las incidencias de las últimas horas (*near-repeat*) y la cobertura de los últimos días (para no ir siempre a lo mismo).
- Salida: 6–10 paradas con tiempo de permanencia (p. ej. 10–15 min), ordenadas por vecino más cercano + 2-opt sobre una matriz OSRM propia, con algo de aleatoriedad para no ser predecible.
- **Replanificación dentro del turno:** si entra un grupo de incidencias en el sector, se agregan o reemplazan paradas, con aprobación de la torre.
- **Cumplimiento:** la parada cuenta como visitada si el GPS (Dolphin o tablet) estuvo a menos de ~75 m durante al menos X minutos.

**2. Despacho (incidencia en vivo)**
- Sigue el flujo de C.4 y la Fase 0.
- El ranking se porta de `geoService.ts`, pero como **sugerencia que la torre confirma**.
- Guarda las horas de cada etapa: asignada, aceptada, en camino, en lugar (por geocerca automática) y cerrada.
- Escribe el estado de vuelta al Sistema de Incidencias por su API.

**3. Ruta manual (orden de subgerente o alcalde)**
- La crea un usuario con permiso `rutas-manuales` (crear): dibuja o elige puntos en el mapa, o reutiliza zonas guardadas.
- Se indican las móviles, fechas, turnos, prioridad y **quién lo ordenó** (cargo y nombre, número de memorando u oficio, adjunto opcional).
- Puede requerir **aprobación** de un rol superior (`can_edit` en el módulo).
- Todo queda en `AuditLog`.
- En ese turno reemplaza a la ruta inteligente, o se combina con ella: las paradas manuales son obligatorias y las inteligentes completan el resto.

**Cómo "aprende" el sistema (circuito completo):**
1. **Diario:** cada incidencia nueva actualiza el patrón espacial (esto ya existe).
2. **Semanal:** reentrenamiento del modelo temporal y reporte de deriva.
3. **Por turno:** se guarda **predicho vs. ocurrido** por celda y la **cobertura real** de las móviles. Con eso se mide si el patrullaje sirve (¿baja la incidencia en las celdas cubiertas?) y se corrige el sesgo de retroalimentación.

## D.6 Modelo de datos a agregar en SIVECAM (complementa C.7)

- `Unit`: código, tipo (camioneta / moto / a pie), placa, `radio_issi`, `device_user_id` (tablet MIT), `sector_id` → `GpsZone`, `fixed_post_id`, activo.
- `UnitShift`: `unit_id`, fecha, `shift`, tripulantes (usuarios o nombres), estado (en servicio / fuera de servicio).
- `PatrolPlan`: `unit_id`, fecha, `shift`, `source` (AUTO / MANUAL), prioridad, `ordered_by` (cargo y nombre), `order_ref` (memorando u oficio), `approved_by`, estado (borrador / aprobado / activo / cerrado), `model_version`.
- `PatrolStop`: `plan_id`, orden, lat, lng, `cell_id`, motivo (texto del hotspot o de la orden), permanencia en minutos, `eta`, `visited_at`, `dwell_s`, estado.
- `Dispatch`: `incident_id` (del Sistema de Incidencias), `unit_id`, `suggested_rank`, `assigned_by`, horas de cada etapa.
- `UnitPosition`: `unit_id`, lat, lng, velocidad, fuente (DOLPHIN / APP), `ts`. Índice por (unit, ts); retención a definir; se recomienda PostGIS.
- `CellCoverage` (agregado diario): `cell_id`, fecha, turno, minutos patrullados, incidencias predichas y ocurridas.

## D.7 Orden de trabajo recomendado

| Paso | Qué | Dónde | Depende de |
|---|---|---|---|
| 0 | Higiene: git en `PredivctiveIncidence` (+ `.gitignore`); quitar `.idea/` de `Despacho-Asistido-SJL` | ambos | — |
| 1 | Catálogo de **móviles**, tripulación por turno y sectores (reusar `GpsZone`) | SIVECAM + web | pregunta 10 (¿radio por móvil?) |
| 2 | **Historial de posiciones** (guardar lo que trae Dolphin) | SIVECAM | 1 |
| 3 | Capa **hotspots** en el mapa: proxy SIVECAM → motor predictivo con `x-api-key`, permiso `hotspots` | SIVECAM + web + motor | — (victoria rápida) |
| 4 | **Despacho Fase 0**: la torre ve la sugerencia y asigna, geocerca de llegada, tiempos, escritura en Incidencias; se porta `geoService.ts` | SIVECAM + web | 1, 2 |
| 5 | **Rutas manuales** con orden, aprobación, auditoría y cumplimiento por geocerca | SIVECAM + web | 1, 2 |
| 6 | Motor: `hotspots?turno=&sector=`, turnos reales, PNP como fuente, reentrenamiento semanal | motor | — |
| 7 | **Rutas inteligentes**: generador por turno, replanificación y cumplimiento | SIVECAM + motor | 5, 6 |
| 8 | **MIT en la tablet**: ubicación en segundo plano, push, pantalla de alerta, pantalla de ruta, enlaces Waze / Google | map610-app | 4, 5 |
| 9 | Circuito de aprendizaje: cobertura, predicho vs. ocurrido, tablero de efectividad | todos | 7, 8 |

Los pasos 3, 5 y 6 pueden avanzar en paralelo. Como cada móvil tiene una radio TETRA fija (pregunta 10, resuelta), **la radio identifica a la móvil**: si esa radio reporta GPS a Dolphin con buena frecuencia, los pasos 4, 5 y 7 funcionan **sin tablets**, y la tablet (paso 8) queda como mejora (alerta visual, ruta en pantalla, Waze).

---

# PARTE E — PRUEBA PILOTO (2026-11-12): QUÉ SE CONSTRUYÓ Y QUÉ SALIÓ

Prueba hecha con **datos reales**:
- GPS en vivo de las radios TETRA de Dolphin.
- Incidencias de hoy, que el motor predictivo copia de la API de producción.
- Modelo predictivo actualizado al 11-nov.

Corre en local; todavía no está en producción. Capturas en `docs/prueba_piloto/`.

## E.1 Qué se construyó

| Pieza | Dónde | Qué hace |
|---|---|---|
| Módulo `patrullaje` (NestJS) | `Sivecam_Backend/src/modules/patrullaje/` | Móviles = radios de vehículo de Dolphin (CAMION, AUTOMOVIL, MOTO). Rutas inteligentes, rutas manuales, cumplimiento por histórico GPS y despacho asistido con llegada automática |
| Tablas `PatrolPlan`, `PatrolStop`, `Dispatch` | `prisma/migrations/20261112120000_add_patrol_and_dispatch` | Solo `CREATE` (aditiva). Aplicada en la BD local |
| Permisos `despacho`, `patrullaje`, `rutas-manuales` | `CustomRoleGuard` y `GestionRoles.jsx` | Encajan en el sistema de roles actual. Despacho y rutas manuales pueden **leer** móviles y zonas |
| Pantalla **Despacho y Patrullaje** | `MAP_610_NEW/src/components/despacho/` (ruta `/despacho`) | Mapa + panel con 4 pestañas: Resumen, Rutas, Despacho y Ruta manual |
| Motor predictivo | `PredivctiveIncidence/backend/app/` | `hotspots?turno=` puntúa por turno real con el perfil horario de cada celda. Nuevo `incidencias/recientes`. Llave `x-api-key` (`PREDICCION_API_KEY`). Se corrigió `db_start.ps1` |

**Cómo se calcula cada cosa:**
- **Ruta inteligente:**
  1. Pide al motor las zonas del turno.
  2. Varía un ±15 % el puntaje para no ser predecible.
  3. Asigna cada zona, de mayor a menor riesgo, a la móvil en línea más cercana que aún tenga cupo (6 paradas por defecto).
  4. Ordena las paradas por vecino más cercano + 2-opt.
  5. Traza la ruta por calles con OSRM.
- **La ruta manual tiene prioridad:** reemplaza la ruta del turno de esa móvil y exige registrar quién la ordenó y con qué documento (queda en `AuditLog`).
- **Cumplimiento:** una parada cuenta como visitada si la radio pasó a 120 m o menos. Se calcula con el histórico de Dolphin.
- **Despacho:** prefiltro por distancia recta (8 candidatas) y luego una sola consulta OSRM *table* para el tiempo por calles.
  - La torre elige y asigna.
  - La **llegada se marca sola** cuando la radio reporta a 75 m o menos (revisión cada 20 s).
  - Enlaces Waze / Google y botón **WhatsApp** con el destino, porque hoy ya coordinan por WhatsApp.

## E.2 Resultados reales del 12-nov (turno mañana)

- **Radios de vehículo en Dolphin: 78.** En línea a las 10:45: **15** (AUTOMOVIL 6/45, CAMION 5/24, MOTO 4/9). **51 llevan más de 1 día sin reportar** ("NO REPORTA - MAL APAGADO"), algunas desde hace más de un año. **Es el primer cuello de botella, y no es de software.**
- **Frecuencia de reporte de las radios que funcionan: ~1 cada 60 s.** Alcanza para detectar llegadas y cumplimiento.
- **Zonas por turno:** el motor da zonas distintas por turno (mañana: Bayóvar / La Huayrona; tarde: 10 de Octubre; noche: Bayóvar / Santa Elizabeth).
- **Rutas generadas:** 15 rutas de 6 paradas trazadas por calles (4 a 22 km cada una).
- **Línea base de cobertura:** desde las 06:00 y **sin que nadie se las asignara**, las móviles pasaron por **25 de las 87 paradas de riesgo (29 %)**. Es el número a mejorar con las rutas.
- **Despacho:**
  - 17 incidencias reales en las últimas 3 h.
  - Para una de ellas, el ranking puso primero a ORION 62, que estaba a 45 m.
  - La llegada se detectó sola y el tiempo de respuesta se midió. El despacho de prueba se canceló para no alterar las métricas.
- En la captura del despacho, la incidencia real R202644733 **cayó dentro de una zona de riesgo marcada** por el motor.

## E.3 Supuestos y límites de la prueba (resolver antes de producción)

1. **Horarios de turno supuestos:** 06–14, 14–22 y 22–06. Confirmar los reales (`turnos.util.ts` y `TURNOS_SERENAZGO` del motor).
2. **Las incidencias del despacho salen del motor predictivo** (que ya lee la API de producción). En producción deben llegar por Socket.IO del Sistema de Incidencias, y el despacho debe **escribir el estado de vuelta** por su API con un usuario de servicio (C.1). No implementado todavía.
3. **OSRM público** solo para la prueba. Producción: OSRM propio con el extracto de Perú (`OSRM_URL`) o Google (ver C.11).
4. **No hay catálogo de móviles todavía:** el código y el tipo salen de Dolphin. Falta la tabla `Unit` con sector y tripulación (D.6).
5. ~~No hay sectores~~ **Resuelto (v2):** cada móvil patrulla la jurisdicción del polígono (GeoJSON) donde está al generar la ruta. Si cae fuera de todos, se usa la más cercana. Pendiente: si una móvil está de paso por otra jurisdicción, le tocan zonas de esa.
6. **Radios:** 120 m (visita) y 75 m (llegada) son valores iniciales; calibrarlos con datos reales.
7. **Sin tablet:** la alerta llega a la torre y se comunica por radio o WhatsApp como hoy. La pantalla en la camioneta es el paso 8.
8. **Migración:** la BD local tenía cambios aplicados sin registrar en `_prisma_migrations`. La migración nueva se aplicó con `prisma db execute`. En el servidor se aplica normal con `prisma migrate deploy`.

## E.3-bis Cambios v2 (2026-11-12, tarde)

- **Rutas por jurisdicción:**
  - La jurisdicción de cada móvil sale del polígono (GeoJSON del motor, mismo id que las zonas de riesgo) donde está.
  - Las zonas de riesgo se piden por jurisdicción y solo se reparten entre las móviles de esa jurisdicción.
  - La pantalla agrupa las rutas por jurisdicción y avisa cuáles quedan **sin ninguna móvil con GPS**. El 12-nov fueron Bayóvar, Canto Rey y Santa Elizabeth.
- **El despacho incluye al personal a pie:**
  - Radios portátiles (Dolphin, tipo PERSONA): ~400 en línea de 587.
  - Bodycams: ~139 en línea de 362.
  - Se muestran en un bloque aparte, **"Personal a pie cerca"** (a menos de 800 m, tiempo caminando ≈ 4.7 km/h × 1.35 por calles), debajo del bloque **"Móviles"**.
  - Una radio y una bodycam a menos de 30 m se muestran como un solo sereno.
  - Se puede enviar cualquiera de los tres tipos. `Dispatch.resource_type` = MOVIL / RADIO / BODYCAM, y la llegada automática funciona igual con el GPS de la radio o de la bodycam.
- **Orden visual:**
  - En el mapa solo se dibujan los 5 recursos a pie sugeridos, no los cientos que hay.
  - Símbolos distintos: círculo = móvil, cuadrado = radio, rombo = bodycam.
  - Leyenda fija y límites de jurisdicción punteados (el nombre aparece al pasar el mouse).
  - En cada bloque se ven 3 opciones y "Ver más".

## E.3-ter Cambios v3 (2026-11-12): cámaras y rediseño

- **Cámaras en el despacho:**
  - Municipales y vecinales a menos de 300 m.
  - Primero aparecen las que **ven el punto**, calculado con su tipo (C360, C180, LPR), ángulo y alcance; es la misma geometría que el cono de visión del mapa.
  - Se respetan las capas del rol (`camaras`, `camarasVecinales`).
  - De las vecinales solo se muestran dirección, marca y modo, sin datos del vecino.
- **Pines según el tipo de recurso** (íconos Phosphor de `react-icons/pi`, sin instalar nada):
  - Vehículos: auto, camioneta (ORION tipo CAMION) o moto, en un círculo del color de su ruta.
  - A pie: persona caminando si tiene radio portátil, videocámara si tiene bodycam.
  - Cámaras: cámara, en verde si ve el punto.
  - Emergencia: gota roja con sirena.
- **Rediseño** siguiendo `design-taste-frontend`:
  - Lectura: consola operativa de servicio público. Dials 3 / 2 / 6.
  - Un solo acento: el índigo de SIVECAM.
  - Radios fijos: 10 px en tarjetas y 8 px en controles.
  - Sin em-dash, carga con esqueletos, mapa base apagado para que resalten los pines.
  - Con una emergencia abierta, las rutas se atenúan.

## E.4 Cómo levantar la prueba

```powershell
# 1) Motor predictivo (PostgreSQL 5433 + API 8000)
cd PredivctiveIncidence\backend; .\scripts\db_start.ps1; python -m uvicorn app.api:app --port 8000
# 2) SIVECAM (necesita PREDICCION_API_URL y PREDICCION_API_KEY en .env; misma llave que el motor)
cd Sivecam_Backend; npm run start:dev
# 3) Web
cd MAP_610_NEW; npm run dev     # menú lateral → "Despacho y Patrullaje"
```

## E.5 Guion sugerido para presentar (10 minutos)

1. **Resumen:** "Hoy hay 78 radios de vehículo y solo 15 reportan GPS". Muestra el problema de equipamiento.
2. **Rutas → Generar:** el motor marca las zonas del turno y cada móvil recibe su ruta por calles.
3. **Resumen → Cobertura desde el inicio del turno:** "sin rutas, las móviles pasaron por el 29 % de las zonas de riesgo". Es la línea base.
4. **Despacho:** elegir una incidencia real, ver la móvil que llega primero y asignar. La llegada se marca sola y el tiempo de respuesta queda medido, algo que hoy no se mide.
5. **Ruta manual:** una orden del subgerente reemplaza la ruta de una móvil y queda registrado quién la dio.
6. **Pedidos:** reparar las ~50 radios que no reportan, confirmar horarios de turno y sectores, y el servidor OSRM propio.
