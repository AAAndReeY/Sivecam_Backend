# Despliegue: horario de acceso por usuario

> **Para Claude Code (o la persona) que ejecuta esto en el servidor de producción del BACKEND.**
> Sigue los pasos **en orden**. Si algo no coincide con lo esperado, **detente y avisa al usuario**.
> La web (`MAP_610_NEW`) está en otro servidor y la despliega el usuario después del paso 5.
> **No requiere un APK nuevo**: la app MIT carga la web.

## Qué cambia
- Cada usuario puede tener un horario de acceso: hora de inicio, hora de fin (hora de Lima) y días de la semana.
- Fuera del horario no puede iniciar sesión (403 `OUT_OF_SCHEDULE`).
- Al terminar el horario se cierra su sesión, en la web y en la app:
  - si está conectado, en 30 segundos como máximo (revisión automática);
  - si no, en su siguiente petición.
- Turnos de noche permitidos: si la hora de fin es menor que la de inicio (ej. 22:00 a 06:00), termina al día siguiente. El día marcado es el día en que empieza el turno.
- Sin horario configurado = sin restricción (todos los usuarios actuales siguen igual).

## Paso 0 — Verificar el código
```bash
cd /var/www/Sivecam_Backend
git log --oneline -3
ls src/modules/auth/access-schedule.ts
```

## Paso 1 — Respaldo de la base de datos
Igual que en `DESPLIEGUE_SERVIDOR.md` (pg_dump). No continuar sin respaldo.

## Paso 2 — Migración SQL (ANTES de compilar y reiniciar)
Solo agrega 3 columnas a `"User"`. Es idempotente y el backend actual la tolera.
**No usar `prisma db push` ni `prisma migrate dev`.**

```sql
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "access_start" VARCHAR(5),
  ADD COLUMN IF NOT EXISTS "access_end"   VARCHAR(5),
  ADD COLUMN IF NOT EXISTS "access_days"  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
```

Verificación (deben salir las 3 columnas):
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'User' AND column_name LIKE 'access_%';
```

## Paso 3 — Compilar
```bash
npx prisma generate
npm run build      # o yarn build, como se haga siempre en este servidor
```
No hay dependencias nuevas ni variables nuevas en el `.env`.

## Paso 4 — Reiniciar el backend
Con la misma herramienta de siempre (pm2 / systemd / docker).

## Paso 5 — Verificar
```bash
curl -s https://backend-incidencias.munisjl.gob.pe/api/            # "Welcome to SIVECAM Backend"
curl -s -o /dev/null -w '%{http_code}\n' "https://backend-incidencias.munisjl.gob.pe/api/radios/cercanas?lat=-12&lng=-77"   # 401
```
- [ ] Iniciar sesión en la web funciona.
- [ ] En los logs de arranque no hay errores.

Avisar al usuario que ya puede desplegar la web.

## Web (la despliega el usuario en su servidor)
`git pull` → `npm install` → `npm run build` → publicar `dist/`. Sin cambios en el `.env`.

Prueba con un usuario de prueba en Gestión de Usuarios → Editar → **Horario de acceso** → "Restringir horario":
- [ ] Horario que no incluye la hora actual → al guardar se cierra su sesión, y al intentar entrar dice "Tu horario de acceso es de … Fuera de ese horario no puedes ingresar."
- [ ] Horario que incluye la hora actual → entra normal; en la tabla aparece la etiqueta azul con el horario.
- [ ] Desmarcar "Restringir horario" → vuelve a entrar a cualquier hora.

## Reversión
Volver al commit anterior, compilar y reiniciar. Las 3 columnas pueden quedarse (el código anterior las ignora).

## Pruebas realizadas en local
- `npx jest src/modules/auth`: 39 pruebas OK (incluye 21 casos de horario: día, noche, cruce de medianoche, días vacíos).
- `node scripts/test-access-schedule.js`: 21 verificaciones e2e OK (validaciones, login, SSE, revisión automática en 28,5 s, app móvil).
- `node scripts/test-device-binding.js`: 51 OK (sin regresiones en la vinculación de celular).
