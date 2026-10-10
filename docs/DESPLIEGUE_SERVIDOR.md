# Despliegue en el servidor — seguridad de accesos y vinculación de celulares

> **Para Claude Code (o la persona) que ejecuta esto en el servidor de producción del BACKEND.**
> Sigue los pasos **en orden**. Si algo no coincide con lo esperado, **detente y avisa al usuario** antes de continuar. No improvises sobre la base de datos.
>
> **Alcance: solo el backend.** La web (`MAP_610_NEW`) está en **otro servidor** y la despliega el usuario. Al terminar el paso 7, avisa al usuario que ya puede desplegar la web (paso 8).

**Qué se despliega:** los cambios de la rama `diego` descritos en `docs/GUIA_COMPLETA_SEGURIDAD_Y_APP_MOVIL.md`:
1. Los endpoints `/camaras|radios|bodycams/cercanas` exigen una API key; las bodycams pasan por el backend.
2. Vinculación de usuarios "solo app móvil" a un celular (nuevas columnas en la BD).
3. Verificación de Key Attestation de Android.

**Producción:** backend `https://backend-incidencias.munisjl.gob.pe/api/` · web `https://mit.munisjl.gob.pe/`

---

## ⚠️ Reglas críticas
1. **La migración de la BD (paso 3) va ANTES de arrancar el backend nuevo.** Sin ella, **nadie puede iniciar sesión**: el código nuevo consulta columnas que no existirían.
2. **El backend va antes que la web.** La web nueva pide `/api/bodycams`, que solo existe en el backend nuevo. La web está en otro servidor: **no la toques desde aquí**.
3. **No pongas `DEVICE_ATTESTATION=off`** en producción.
4. **No actives "Solo app móvil" a ningún usuario.** Eso se hará cuando exista el APK.
5. **No subas ni muestres en logs o mensajes** los valores de `.env` (tokens, llaves, contraseñas).

---

## Paso 0 — Verificar que el pull trajo el código correcto
Desde la carpeta del backend:
```bash
git log --oneline -3
ls src/modules/bodycam/ src/modules/auth/device/ src/modules/auth/guard/api-key.guard.ts
grep -n "mobile_only\|DeviceChallenge" prisma/schema.prisma
```
**Esperado:** existen `bodycam.service.ts`, `android-attestation.ts`, `device-crypto.ts`, `api-key.guard.ts`, y `schema.prisma` contiene `mobile_only` y `model DeviceChallenge`.
Si falta algo → **detente**: el pull no trajo los cambios.

Identifica también **cómo corre hoy el backend**, para reiniciarlo de la misma forma en el paso 6:
```bash
pm2 list 2>/dev/null; systemctl list-units --type=service 2>/dev/null | grep -i -E "sivecam|nest|node"; docker ps 2>/dev/null
```

---

## Paso 1 — Respaldo de la base de datos (obligatorio)
```bash
# DATABASE_URL está en el .env del backend
export $(grep '^DATABASE_URL=' .env | tr -d '"')
pg_dump "${DATABASE_URL%%\?*}" -Fc -f ~/backup_sivecam_$(date +%Y%m%d_%H%M).dump
ls -lh ~/backup_sivecam_*.dump | tail -1
```
**Esperado:** un archivo `.dump` con tamaño mayor que 0. Si `pg_dump` no existe o falla → **detente y avisa**.

---

## Paso 2 — Dependencias
```bash
npm install
```
Se agregan `@peculiar/asn1-android`, `@peculiar/asn1-schema` y `@peculiar/asn1-x509` (y `@peculiar/x509` solo para pruebas).

---

## Paso 3 — Migración de la base de datos
La carpeta `prisma/migrations` está en `.gitignore`, por eso **el SQL va aquí**.
Solo **agrega** columnas y una tabla, con `IF NOT EXISTS`: no borra ni modifica datos, y ejecutarla dos veces no hace daño. El código viejo ignora estas columnas, así que también se puede aplicar antes de reiniciar.

Guarda este SQL en un archivo temporal (por ejemplo `/tmp/add_mobile_device_binding.sql`):

```sql
-- Vinculación de usuarios a un dispositivo móvil (app con llave en Keystore).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mobile_only"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "device_public_key" TEXT,
  ADD COLUMN IF NOT EXISTS "device_info"       TEXT,
  ADD COLUMN IF NOT EXISTS "device_bound_at"   TIMESTAMP(3);

-- Sesiones móviles: access token corto + refresh token (hash) que exige firma
ALTER TABLE "UserSession"
  ADD COLUMN IF NOT EXISTS "is_mobile"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "refresh_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "refresh_expires_at" TIMESTAMP(3);

-- Retos de un solo uso (expiran a los 2 minutos)
CREATE TABLE IF NOT EXISTS "DeviceChallenge" (
  "id"         TEXT         NOT NULL,
  "username"   TEXT         NOT NULL,
  "purpose"    TEXT         NOT NULL,
  "nonce"      TEXT         NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeviceChallenge_expires_at_idx" ON "DeviceChallenge"("expires_at");
```

Antes de ejecutarlo, **comprueba que existe la tabla `UserSession`**: viene de la migración anterior `add_user_sessions`, que ya debería estar aplicada en producción.
```bash
psql "${DATABASE_URL%%\?*}" -c '\d "UserSession"' | head -5
```
Si `UserSession` **no existe** → **detente y avisa**: falta una migración anterior.

Ejecuta:
```bash
psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f /tmp/add_mobile_device_binding.sql
```
(Alternativa si no hay `psql`: `npx prisma db execute --file /tmp/add_mobile_device_binding.sql --schema prisma/schema.prisma`. Si `schema.prisma` exige `DIRECT_URL`, exporta `DIRECT_URL=$DATABASE_URL` para ese comando.)

Verifica:
```bash
psql "${DATABASE_URL%%\?*}" -c "SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name IN ('mobile_only','device_public_key','device_info','device_bound_at');"
psql "${DATABASE_URL%%\?*}" -c "SELECT column_name FROM information_schema.columns WHERE table_name='UserSession' AND column_name IN ('is_mobile','refresh_token_hash','refresh_expires_at');"
psql "${DATABASE_URL%%\?*}" -c '\d "DeviceChallenge"' | head -3
```
**Esperado:** 4 columnas, 3 columnas y la tabla `DeviceChallenge`.

> ⚠️ **No uses `prisma db push` ni `prisma migrate dev`** en producción: pueden intentar borrar lo que no coincida con `schema.prisma`.

---

## Paso 4 — Variables de entorno (`.env` del backend)
**Agrega** estas variables, sin borrar las existentes. Antes de editar, haz una copia: `cp .env .env.bak_$(date +%Y%m%d)`.

```env
# CORS: dejar VACÍO en este primer despliegue (queda abierto como hoy). Se configura después.
CORS_ORIGINS=

# API externa de bodycams (antes estaba en el código del frontend)
BODYCAM_API_URL="http://gps-bodycam.munisjl.gob.pe:8087"
BODYCAM_API_TOKEN="<token actual de la API de bodycams; pedirlo al usuario si no se conoce>"

# Llaves para sistemas externos que usen /camaras|radios|bodycams/cercanas (cabecera x-api-key)
INTEGRATION_API_KEYS="<generar una, ver abajo>"

# App móvil (valores por defecto si se dejan vacíos)
MOBILE_ACCESS_TOKEN_TTL=
MOBILE_REFRESH_TTL_DAYS=

# Key Attestation: vacío = required. NUNCA "off" en producción.
DEVICE_ATTESTATION=
ANDROID_PACKAGE_NAME=
# Se completa cuando exista el primer APK (eas credentials). Mientras tanto, vacío.
ANDROID_SIGNING_CERT_SHA256=
ATTESTATION_REQUIRE_LOCKED_BOOTLOADER=
```

Generar la llave de integración:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
**Entrégale esa llave al usuario por un canal privado**; no la escribas en el chat ni en logs. Es para el sistema externo que consuma los `.../cercanas`, si existe.

Si no conoces el valor de `BODYCAM_API_TOKEN` → **pregúntaselo al usuario**. Sin él, la capa de bodycams quedará vacía (error 503).

---

## Paso 5 — Generar el cliente de Prisma y compilar
```bash
npx prisma generate
npm run build
```
Si `prisma generate` exige `DIRECT_URL` y no está en el `.env`: `DIRECT_URL=$DATABASE_URL npx prisma generate`.
**Esperado:** sin errores. Si `npm run build` falla → **no reinicies**: el backend actual sigue funcionando. Avisa con el error.

---

## Paso 6 — Reiniciar el backend
Reinicia **de la misma forma en que corre hoy** (paso 0). Por ejemplo:
```bash
pm2 restart <nombre>        # si usa pm2
# o: sudo systemctl restart <servicio>
# o: docker compose up -d --build
```
Revisa el log de arranque. **Esperado:**
- `Mapped {/api/bodycams, GET} route`
- `Mapped {/api/auth/device/challenge, POST} route`
- `Mapped {/api/auth/refresh, POST} route`
- `Server running on port ...`

Avisos **normales** que pueden aparecer:
- `CORS_ORIGINS no configurado: CORS abierto a cualquier origen`
- `ANDROID_SIGNING_CERT_SHA256 vacío: no se verifica la firma del APK en la attestation`

**Errores que indican un problema** → ver el plan de reversión:
- `column ... does not exist` → la migración no se aplicó (paso 3).
- `Cannot find module '@peculiar/...'` → falta `npm install` (paso 2).

---

## Paso 7 — Verificación del backend
```bash
B=https://backend-incidencias.munisjl.gob.pe/api
curl -s $B/                                                                  # → Welcome to SIVECAM Backend
curl -s -o /dev/null -w "%{http_code}\n" "$B/radios/cercanas?lat=-11.98&lng=-77&radio=500"    # → 401 (antes 200)
curl -s -o /dev/null -w "%{http_code}\n" "$B/camaras/cercanas?lat=-11.98&lng=-77&radio=500"   # → 401
curl -s -o /dev/null -w "%{http_code}\n" "$B/bodycams/cercanas?lat=-11.98&lng=-77&radio=500"  # → 401
curl -s -o /dev/null -w "%{http_code}\n" "$B/bodycams"                                        # → 401 (sin token)
curl -s -X POST $B/auth/device/challenge -H "Content-Type: application/json" \
     -d '{"username":"prueba_inexistente","purpose":"login"}' -o /dev/null -w "%{http_code}\n" # → 200
```
Con la llave de integración (no la imprimas):
```bash
KEY=$(grep '^INTEGRATION_API_KEYS=' .env | cut -d'"' -f2 | cut -d, -f1)
curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: $KEY" "$B/radios/cercanas?lat=-11.98&lng=-77&radio=500"  # → 200
```

**Pide al usuario que pruebe en la web actual** (todavía la versión vieja):
- [ ] Iniciar sesión funciona.
- [ ] El mapa, las cámaras y las radios cargan.
- [ ] Gestión de Usuarios abre y lista usuarios.

Si el **login falla** → reversión inmediata (abajo).

---

## Paso 8 — Web (`MAP_610_NEW`): la despliega el usuario en su servidor
**Claude Code del backend: no ejecutes este paso.** Solo avisa al usuario que el backend quedó OK y que ya puede desplegar la web.

Para el usuario, en el servidor de la web, el despliegue de siempre, con dos cuidados:
1. En el `.env` de producción del frontend:
   - `VITE_API_URL=https://backend-incidencias.munisjl.gob.pe/api/`
   - **Elimina `VITE_BODYCAM_API_URL` y `VITE_BODYCAM_API_TOKEN`** si existen: ya no se usan y exponen el token.
2. `git pull` → `npm install` → `npm run build` → publicar `dist/` como siempre.

Verificación en el navegador:
- [ ] Iniciar sesión funciona.
- [ ] Las capas Bodycams, Búsqueda de bodycams y Rutas bodycams funcionan.
- [ ] En F12 → Network **no aparecen llamadas a `gps-bodycam`**; las bodycams salen de `/api/bodycams`.
- [ ] Gestión de Usuarios muestra la columna **Acceso** ("Web" para todos) y el check **Solo app móvil**. **No activarlo a nadie.**

---

## Plan de reversión
**Backend:**
```bash
git log --oneline -5              # identificar el commit anterior al despliegue
git checkout <commit_anterior>    # o git revert <commit_nuevo>
npm install && npx prisma generate && npm run build
# reiniciar como en el paso 6
```
**No hace falta deshacer la migración**: el código viejo ignora las columnas nuevas.
Si fuera imprescindible restaurar la BD: `pg_restore --clean -d "<DATABASE_URL>" ~/backup_sivecam_<fecha>.dump` (**solo con autorización del usuario**).

**Web** (otro servidor, la revierte el usuario): volver a publicar el `dist/` anterior. Si se revierte el backend, la web nueva pierde las bodycams: revertir también la web.

---

## Después del despliegue (informar al usuario)
- Confirmar qué pasos se hicieron y el resultado de cada verificación.
- Recordar los pendientes:
  1. **Rotar el token de la API de bodycams** (el anterior estuvo publicado en la web) y actualizar `BODYCAM_API_TOKEN`.
  2. Averiguar si algún sistema externo usa `.../cercanas` (revisar logs del proxy) y darle su `x-api-key`.
  3. Configurar `CORS_ORIGINS="https://mit.munisjl.gob.pe"` y verificar que la web siga funcionando.
  4. Cuando exista el APK: completar `ANDROID_SIGNING_CERT_SHA256` y reiniciar.
- **No ejecutar `scripts/test-device-binding.js` contra producción**: crea y borra usuarios de prueba.
