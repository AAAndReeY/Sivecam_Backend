# Despliegue: pin de ubicación, sesiones abiertas y cámaras caídas ocultas

> **Para Claude Code (o la persona) que ejecuta esto en el servidor de producción del BACKEND.**
> El usuario **ya hizo `git pull` y el respaldo de la base de datos** antes de pedirte esto.
> Sigue los pasos **en orden**. Si algo no coincide con lo esperado, **detente y avisa al usuario**.
> La web (`MAP_610_NEW`) está en otro servidor y la despliega el usuario después del paso 6. **No la toques desde aquí.**
> **No requiere un APK nuevo**, salvo para ver el pin de ubicación dentro de la app (ver el final).

**Producción:** backend `https://backend-incidencias.munisjl.gob.pe/api/` · web `https://mit.munisjl.gob.pe/`

## Qué cambia
1. **Pin de "mi ubicación"** (columna nueva `User.show_location_pin`): el admin lo habilita a cada usuario en Gestión de Usuarios. Viaja en `GET /custom-role/mine` y, al cambiarlo, el usuario lo recibe al instante (aviso `perms-changed` por SSE).
2. **Sesiones abiertas** (sin cambios en la base de datos):
   - `GET /user/:id/sessions`: lista las sesiones abiertas (no revocadas y con el token vigente).
   - `DELETE /user/:id/sessions` (todas) y `DELETE /user/:id/sessions/:sessionId` (una): el admin cierra sesiones. Necesita la operación *edit* del módulo `usuarios`.
   - El dispositivo recibe `ADMIN_LOGOUT` ("El administrador cerró tu sesión") y vuelve al login. Queda en la auditoría (`SESSION_CLOSE`).
   - `GET /user` devuelve además `active_sessions` por usuario.
3. **Cámaras municipales caídas** (columna nueva `Municipal.map_hidden`):
   - `PATCH /municipal/:id/map-visibility` con body `{ "map_hidden": true|false }`. Necesita la operación *edit* de `camaras-municipales` y queda en la auditoría (`MAP_HIDE` / `MAP_SHOW`).
   - `GET /municipal` sigue devolviendo **todas** las cámaras (con `map_hidden`) para que los totales del mapa no bajen. La web oculta el pin.
   - Filtro nuevo `?map_hidden=true|false`.
   - Las ocultas ya no salen en `/camaras/cercanas`.
   - Al ocultar o mostrar una cámara, el backend avisa por SSE (`map-visibility`, solo con `{ id, map_hidden }`) a todos los conectados. El pin desaparece o vuelve sin recargar la página.

No hay dependencias nuevas ni variables nuevas en el `.env`.

---

## Paso 0 — Verificar que el pull trajo el código correcto
```bash
cd /var/www/Sivecam_Backend      # o la carpeta real del backend
git log --oneline -3
ls src/modules/municipal/dto/map-visibility.dto.ts docs/DESPLIEGUE_UBICACION_SESIONES_CAMARAS.md
grep -n "show_location_pin\|map_hidden" prisma/schema.prisma
grep -n "ADMIN_LOGOUT" src/modules/session-events/session-events.service.ts | head -2
```
**Esperado:**
- existe `map-visibility.dto.ts`;
- `schema.prisma` tiene `show_location_pin` (en `User`) y `map_hidden` (en `Municipal`);
- aparece `ADMIN_LOGOUT`.

Si falta algo → **detente**: el pull no trajo los cambios.

Identifica también **cómo corre hoy el backend**, para reiniciarlo igual en el paso 5:
```bash
pm2 list 2>/dev/null; systemctl list-units --type=service 2>/dev/null | grep -i -E "sivecam|nest|node"; docker ps 2>/dev/null
```

---

## Paso 1 — Respaldo de la base de datos
Lo hace el usuario antes de pedirte el despliegue. Si te dice que el respaldo ya está, continúa: no lo busques ni lo repitas.
Solo si el usuario **no** menciona el respaldo, pregúntale antes de seguir. **No continúes sin respaldo.**

---

## Paso 2 — Migración SQL (ANTES de compilar y reiniciar)
La carpeta `prisma/migrations` está en `.gitignore`, por eso **el SQL va aquí**.
- Solo agrega 2 columnas con valor por defecto `false`: nadie tiene el pin y no hay cámaras ocultas.
- Es idempotente (`IF NOT EXISTS`) y el backend actual ignora estas columnas, así que se puede aplicar antes de reiniciar.
- **No usar `prisma db push` ni `prisma migrate dev`.**

Guarda esto en `/tmp/ubicacion_camaras.sql`:
```sql
-- Pin de "mi ubicación" en el mapa, habilitado por usuario desde Gestión de Usuarios.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "show_location_pin" BOOLEAN NOT NULL DEFAULT false;

-- Cámara municipal caída (ej. sin energía): su pin no se dibuja en el mapa, pero sigue contando.
ALTER TABLE "Municipal"
  ADD COLUMN IF NOT EXISTS "map_hidden" BOOLEAN NOT NULL DEFAULT false;
```

Ejecuta:
```bash
export $(grep '^DATABASE_URL=' .env | tr -d '"')
psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f /tmp/ubicacion_camaras.sql
```
(Alternativa si no hay `psql`: `DIRECT_URL="$DATABASE_URL" npx prisma db execute --file /tmp/ubicacion_camaras.sql --schema prisma/schema.prisma`.)

Verifica:
```bash
psql "${DATABASE_URL%%\?*}" -c "SELECT table_name, column_name, data_type, column_default FROM information_schema.columns WHERE (table_name='User' AND column_name='show_location_pin') OR (table_name='Municipal' AND column_name='map_hidden');"
```
**Esperado:** 2 filas (`User.show_location_pin` y `Municipal.map_hidden`), las dos `boolean` con valor por defecto `false`.

> ⚠️ Si se reinicia el backend nuevo **sin** este SQL, `GET /custom-role/mine` falla con `P2022`. Con PostgreSQL en español el error dice "The column `existe` does not exist". Eso rompe la carga de permisos de **todos** los usuarios. Por eso este paso va antes.

---

## Paso 3 — Dependencias
```bash
npm install
```
No se agregan paquetes nuevos. Es por si el `package-lock` del servidor quedó atrás.

---

## Paso 4 — Generar el cliente de Prisma y compilar
```bash
npx prisma generate
npm run build      # o yarn build, como se haga siempre en este servidor
```
**Esperado:** sin errores. Si `npm run build` falla → **no reinicies**: el backend actual sigue funcionando. Avisa con el error.

---

## Paso 5 — Reiniciar el backend
Con la misma herramienta de siempre (la que identificaste en el paso 0):
```bash
pm2 restart <nombre>        # si usa pm2
# o: sudo systemctl restart <servicio>
# o: docker compose up -d --build
```
Revisa los logs de arranque: debe salir `Nest application successfully started` y no debe haber errores de Prisma.

---

## Paso 6 — Verificar el backend
```bash
API=https://backend-incidencias.munisjl.gob.pe/api
curl -s $API/                                                                   # "Welcome to SIVECAM Backend"
Z=00000000-0000-0000-0000-000000000000
curl -s -o /dev/null -w 'sessions        %{http_code}\n' "$API/user/$Z/sessions"                        # 401
curl -s -o /dev/null -w 'map-visibility  %{http_code}\n' -X PATCH "$API/municipal/$Z/map-visibility"   # 401
curl -s -o /dev/null -w 'cercanas        %{http_code}\n' "$API/radios/cercanas?lat=-12&lng=-77"        # 401
```
**Esperado:** todo **401** (las rutas existen y piden login). Un **404** en `sessions` o `map-visibility` significa que sigue corriendo el build viejo: revisa el paso 4 y el 5.

Pide al usuario que confirme (todavía con la web vieja):
- [ ] Iniciar sesión en la web funciona y el mapa carga las cámaras.
- [ ] En los logs no aparecen errores `P2022` ni `column ... does not exist`.

**Avisa al usuario que el backend quedó OK y que ya puede desplegar la web.**

---

## Paso 7 — Web (`MAP_610_NEW`): la despliega el usuario en su servidor
**Claude Code del backend: no ejecutes este paso.**

Para el usuario: `git pull` → `npm install` → `npm run build` → publicar `dist/`. Sin cambios en el `.env`.
**El backend va antes que la web:** la web nueva llama a `/user/:id/sessions` y `/municipal/:id/map-visibility`, que no existen en el backend viejo.

Pruebas en producción (https, la ubicación funciona en el navegador del celular):
- [ ] **Pin:** Gestión de Usuarios → Editar → sección **Mapa** → "Pin de mi ubicación".
  - Con ese usuario, el mapa pide la ubicación, se centra una vez y muestra el pin azul.
  - El botón redondo "Mi ubicación" vuelve a centrar.
  - Al tocar una cámara pegada al pin se abre la cámara, no el pin.
- [ ] **Sesiones:** la columna **Sesiones** muestra "N activas / límite". Al abrirla y **Cerrar** una sesión de otro navegador, ese navegador vuelve al login con "El administrador cerró tu sesión".
- [ ] **Cámaras caídas:** Gestión de Cámaras Municipales → columna **En el mapa** → "Oculta".
  - El admin la ve en gris en el mapa.
  - Un usuario sin permiso de edición no la ve ni la encuentra en el buscador.
  - El **total de cámaras no baja**.
  - Con otro usuario con el mapa abierto, el pin desaparece al instante, sin recargar.

---

## Reversión
**Backend:** volver al commit anterior → `npm install && npx prisma generate && npm run build` → reiniciar como en el paso 5. Las 2 columnas pueden quedarse: el código anterior las ignora.
**Web** (la revierte el usuario): volver a publicar el `dist/` anterior. Si se revierte el backend, revertir también la web (la web nueva necesita las rutas nuevas).

---

## App móvil (MIT)
- Sesiones y cámaras ocultas funcionan en la app sin APK nuevo, porque la app carga la web.
- **El pin de ubicación no funciona en la APK actual (1.0.1)**: no tiene permiso de ubicación y su WebView tiene la geolocalización apagada.
- Hace falta la versión 1.0.2: agregar los permisos `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` y `geolocationEnabled` en el WebView, luego `eas build` + `eas submit`.
- No se hace en este servidor.

## Pruebas realizadas en local
- Backend: `npx tsc --noEmit` sin errores; columnas aplicadas en la base local (`User.show_location_pin`, `Municipal.map_hidden`); rutas nuevas responden 401 sin token.
- Web: `vite build` OK; lint sin errores nuevos (los existentes ya estaban antes).
