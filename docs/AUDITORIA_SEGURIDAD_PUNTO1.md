# Auditoría de seguridad: Punto 1, cierre de accesos sin login

**Fecha:** 2026-10-06
**Rama:** `diego` (backend `Sivecam_Backend` y frontend `MAP_610_NEW`)
**Estado:** implementado y probado en local, **sin desplegar ni commitear**

Este trabajo es el paso previo a la vinculación de supervisores a un dispositivo (app con llave en Keystore). Blindar el login no sirve si hay datos que salen sin login.

---

## 1. Hallazgos (estado anterior)

| # | Hallazgo | Riesgo | Dónde |
|---|----------|--------|-------|
| H1 | `GET /api/camaras/cercanas`, `/api/radios/cercanas` y `/api/bodycams/cercanas` **sin autenticación**. Con un radio grande devolvían las ubicaciones en vivo de las radios y bodycams de todo el distrito y la ubicación de todas las cámaras. | **Alto**: ubicación en tiempo real del personal de seguridad expuesta a cualquiera que conozca la URL del backend. | `src/app.controller.ts` |
| H2 | El frontend llamaba **directo** a la API externa de bodycams con el token `cecom2026` en el código. El token quedaba dentro del JavaScript que descarga cualquier visitante. | **Alto**: con el token se consulta la lista completa de bodycams (nombre y ubicación) y el historial de recorridos, sin login. | `MAP_610_NEW/src/services/bodycamService.js`, `.env.local` |
| H3 | CORS abierto a cualquier origen (`origin: '*'`). | **Medio**: cualquier página web de terceros puede consultar el backend desde el navegador de sus visitantes. | `src/main.ts` |
| H4 | Token de la API de bodycams escrito en el código del backend. | Bajo (el código del backend no es público), pero impide rotarlo sin redeploy. | `src/app.service.ts` |

> **Corrección a lo dicho en la conversación:** desde la PC donde se hizo la prueba, `gps-bodycam.munisjl.gob.pe` resuelve a una IP **interna** (`10.10.40.20`). Por eso no está confirmado que la API de bodycams sea alcanzable desde internet; eso hay que verificarlo con datos móviles. El riesgo H2 se mantiene igual: el token estaba publicado en el JavaScript, y cualquiera con acceso a esa red, o a la API si está expuesta, puede usarlo.

---

## 2. Cambios realizados

### Backend (`Sivecam_Backend`)

| Archivo | Cambio |
|---------|--------|
| `src/modules/bodycam/bodycam.service.ts` *(nuevo)* | Proxy hacia la API externa de bodycams. URL y token desde `BODYCAM_API_URL` / `BODYCAM_API_TOKEN`. Caché de la lista por 10 s, compartida entre peticiones simultáneas. Si la API externa falla, devuelve la última lista conocida. Timeout de 20 s con conexión propia (`agent: false`). Valida el `codigo` (`^[A-Za-z0-9_-]{1,64}$`) para evitar path traversal hacia la API externa. `limite` acotado a 1–10000. |
| `src/modules/bodycam/bodycam.controller.ts` *(nuevo)* | `GET /api/bodycams` (capa `bodycams`) y `GET /api/bodycams/:codigo/ubicaciones?desde&hasta&limite` (capa `rutasBodycams`). Ambos con `JwtAuthGuard` + `CustomRoleGuard`. |
| `src/modules/bodycam/bodycam.module.ts` *(nuevo)* | Módulo, registrado en `app.module.ts`. |
| `src/modules/auth/guard/api-key.guard.ts` *(nuevo)* | `ApiKeyGuard`: exige la cabecera `x-api-key` con una de las llaves de `INTEGRATION_API_KEYS` (separadas por comas, una por sistema). Compara hashes SHA-256 con `timingSafeEqual`. **Sin llaves configuradas, el endpoint queda cerrado.** |
| `src/app.controller.ts` | Los 3 endpoints `.../cercanas` ahora usan `ApiKeyGuard`. `bodycams/cercanas` usa `BodycamService` (con caché). |
| `src/app.service.ts` | Se eliminan el token hardcodeado y `bodycamsCercanas` (movido a `BodycamService`). |
| `src/modules/auth/guard/custom-role.guard.ts` | Fallback: la capa `bodycams` (lectura) también se concede a quien tiene la capa `rutasBodycams` o el módulo `bodycams` (panel "Gestión Bodycams"), porque esas pantallas también cargan la lista. |
| `src/main.ts` | CORS configurable con `CORS_ORIGINS` (lista separada por comas). **Si está vacío se mantiene abierto** para no romper el despliegue actual, y se registra un `WARN` al arrancar. |
| `.env.template` | Nuevas variables: `CORS_ORIGINS`, `BODYCAM_API_URL`, `BODYCAM_API_TOKEN`, `INTEGRATION_API_KEYS`. |
| `.env` (local, no versionado) | Se agregaron las variables anteriores con valores de prueba y una llave de integración aleatoria. |

### Frontend (`MAP_610_NEW`)

| Archivo | Cambio |
|---------|--------|
| `src/services/bodycamService.js` | Ya no llama a la API externa: usa `${VITE_API_URL}bodycams` con el JWT del usuario. Pasa de `axios` a `fetch`, así el `sessionGuard` existente también cierra la sesión si el backend responde 401. **La firma de las funciones no cambia**, así que los 5 componentes que la usan (capa, búsqueda, rutas, gestión, Google Maps) no se tocaron. |
| `.env.local` (local, no versionado) | Se quitaron `VITE_BODYCAM_API_URL` y `VITE_BODYCAM_API_TOKEN`. |

---

## 3. Verificación

Pruebas con el backend compilado (`nest build`) corriendo en `localhost:3099`, contra la BD local y la API real de bodycams.

### Sin credenciales: debe rechazar
| Petición | Resultado |
|----------|-----------|
| `GET /api/bodycams` | ✅ 401 |
| `GET /api/bodycams/:codigo/ubicaciones` | ✅ 401 |
| `GET /api/camaras/cercanas` | ✅ 401 "API key inválida o ausente" |
| `GET /api/radios/cercanas` | ✅ 401 |
| `GET /api/bodycams/cercanas` | ✅ 401 |
| `.../cercanas` con `x-api-key` falsa | ✅ 401 |
| `GET /api/bodycams` con JWT basura | ✅ 401 |

### Con login (sesión real de SUPERADMIN): debe funcionar
| Petición | Resultado |
|----------|-----------|
| `GET /api/bodycams` ×5 | ✅ 200, 362 bodycams. 1.ª en ~270 ms, siguientes ~5 ms (caché) |
| `GET /api/bodycams/fbe3ebc3b6107fd0/ubicaciones` ×20 | ✅ 20/20 OK (una tardó 11 s por la API externa y aun así respondió) |
| Historial con `desde`/`hasta` | ✅ 200, mismo formato `{ bodycam, total, ubicaciones }` que antes |
| Código malicioso `../x` | ✅ 400 "Código de bodycam inválido" |

### Integración con `x-api-key` válida: debe funcionar
| Petición | Resultado |
|----------|-----------|
| `camaras/cercanas`, `radios/cercanas`, `bodycams/cercanas` | ✅ 200 los tres |

### CORS con `CORS_ORIGINS=http://localhost:5173,...`
| Origen | Resultado |
|--------|-----------|
| `http://localhost:5173` (permitido) | ✅ `Access-Control-Allow-Origin: http://localhost:5173` |
| `https://evil.example` (no permitido) | ✅ sin cabecera `Allow-Origin` (el navegador bloquea) |

### Compilación
- Backend: `tsc --noEmit` y `nest build` sin errores.
- Frontend: `vite build` sin errores; **el bundle generado no contiene `cecom2026`**.

### Problema encontrado y corregido durante las pruebas
La API externa de bodycams **a veces tarda ~11 s** en responder (comprobado también con `curl` directo, sin pasar por el backend). El agente HTTP global de Node 22 corta los sockets keep-alive a los 5 s, así que esas peticiones fallaban con 502. Se corrigió usando una conexión propia (`agent: false`) con timeout de 20 s, más el respaldo de la última lista en caché.

### No verificado (pendiente de prueba manual)
- **Usuarios con rol personalizado** (no SUPERADMIN): en la BD local solo había una sesión activa (superadmin), así que el fallback de permisos de `custom-role.guard.ts` no se probó con roles reales. Ver checklist §4.
- **Flujo en el navegador**: no se abrió el mapa en el navegador. La compatibilidad se razonó sobre el código (mismas funciones y mismo formato de respuesta).

---

## 4. Checklist de prueba manual

Con el backend y el frontend de esta rama corriendo:

- [ ] **Superadmin**: capa Bodycams, búsqueda de bodycams, Rutas Bodycams (buscar un recorrido) y `/admin/bodycams` funcionan igual que antes.
- [ ] **Rol con solo la capa `bodycams`**: ve la capa y la búsqueda. Al consultar rutas recibe 403 (no tiene `rutasBodycams`).
- [ ] **Rol con solo `rutasBodycams`**: la lista del selector de rutas carga y el recorrido se dibuja.
- [ ] **Rol sin capas de bodycams**: no ve bodycams (403 si se llama al endpoint a mano).
- [ ] En DevTools → Network, ninguna petición va a `gps-bodycam.munisjl.gob.pe`; todas van a `/api/bodycams`.
- [ ] En DevTools → Sources, buscar `cecom2026`: no debe aparecer.
- [ ] Al cerrar la sesión desde otro dispositivo, la capa de bodycams también provoca el aviso de sesión finalizada (401 → `sessionGuard`).
- [ ] Desde un celular **con datos móviles**, abrir `https://<dominio-backend>/api/radios/cercanas?lat=-11.98&lng=-77&radio=20000`: debe dar 401.

---

## 5. Despliegue

**Orden:** primero el backend, después el frontend. El frontend viejo sigue funcionando con el backend nuevo, porque llama directo a la API externa; el frontend nuevo, en cambio, necesita el endpoint `/api/bodycams`.

Variables en el `.env` del servidor:

```env
BODYCAM_API_URL="http://gps-bodycam.munisjl.gob.pe:8087"
BODYCAM_API_TOKEN="<token actual>"
INTEGRATION_API_KEYS="<una llave aleatoria por cada sistema externo, separadas por coma>"
CORS_ORIGINS="https://<dominio-del-mapa>"   # incluir otros orígenes legítimos
```

- Generar llaves: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
- Si falta `BODYCAM_API_URL` o `BODYCAM_API_TOKEN`, `/api/bodycams` responde **503** con un mensaje claro.
- Si `INTEGRATION_API_KEYS` está vacío, los `.../cercanas` quedan **cerrados para todos**.
- Si `CORS_ORIGINS` está vacío, CORS sigue abierto y aparece un `WARN` en el log.
- Cuando se haga la app Capacitor, agregar su origen a `CORS_ORIGINS` (`https://localhost` en Android, `capacitor://localhost` en iOS).

---

## 6. Pendientes y riesgos residuales

| # | Pendiente | Responsable | Prioridad |
|---|-----------|-------------|-----------|
| P1 | **Rotar el token `cecom2026`** en la API de bodycams. Estuvo publicado en el JavaScript de la web, así que hay que asumirlo comprometido. Después, actualizar solo `BODYCAM_API_TOKEN` en el servidor. | Admin de la API de bodycams | **Alta** |
| P2 | **Identificar quién consume los `.../cercanas`** (revisar logs del servidor o del proxy) y entregarle su llave de `INTEGRATION_API_KEYS`. Hasta entonces, esa integración recibirá 401. | Equipo backend | **Alta** |
| P3 | Configurar `CORS_ORIGINS` en producción. | Despliegue | Media |
| P4 | Verificar si `gps-bodycam.munisjl.gob.pe` es alcanzable desde internet. Si lo es y solo la consume este backend, restringirla a la red interna. | Infraestructura | Media |
| P5 | Filtro de bodycams por jurisdicciones permitidas del rol (`allowed_jurisdictions`). Requiere los polígonos de jurisdicción en el backend; hoy las radios tampoco filtran por zona. | Opcional | Baja |
| P6 | El SSE `auth/session-events` recibe el token en la URL (queda en logs). Se aborda junto con el token corto y el refresh (punto 2). | Punto 2 | Media |
| P7 | Credenciales de Dolphin (`DOLPHIN_*`) no están en `.env.template`. Documentarlas. | Equipo backend | Baja |

---

## 7. Reversión

Los cambios son aditivos y aislados. Para revertir:
- **Backend:** revertir el commit. Los endpoints `.../cercanas` vuelven a ser públicos y `/api/bodycams` desaparece.
- **Frontend:** revertir `bodycamService.js` y volver a poner `VITE_BODYCAM_API_URL` / `VITE_BODYCAM_API_TOKEN` en el `.env`. Esto **vuelve a exponer el token**: usarlo solo como emergencia.
