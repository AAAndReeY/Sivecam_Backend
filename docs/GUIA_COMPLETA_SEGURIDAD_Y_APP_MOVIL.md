# Guía completa: seguridad de accesos y app móvil SIVECAM

**Última actualización:** 2026-10-10
**Rama:** `diego` en `Sivecam_Backend` y `MAP_610_NEW`; `master` en `map610-app`
**Estado general:** implementado y probado en local. **Nada está commiteado ni desplegado.** Falta compilar el APK y probarlo en un celular real.

Este documento resume todo el trabajo. Los detalles técnicos y los resultados de cada prueba están en los informes de auditoría:

- [Punto 1: Cierre de accesos sin login](AUDITORIA_SEGURIDAD_PUNTO1.md)
- [Punto 2: Vinculación usuario ↔ celular (backend)](AUDITORIA_SEGURIDAD_PUNTO2.md)
- [Punto 3: App móvil, Key Attestation y pantalla de admin](AUDITORIA_SEGURIDAD_PUNTO3.md)

---

## Índice
1. [Objetivo](#1-objetivo)
2. [Resumen de lo realizado](#2-resumen-de-lo-realizado)
3. [Sistemas y URLs](#3-sistemas-y-urls)
4. [Cómo funciona](#4-cómo-funciona)
5. [Decisiones tomadas y por qué](#5-decisiones-tomadas-y-por-qué)
6. [Inventario de cambios por proyecto](#6-inventario-de-cambios-por-proyecto)
7. [Configuración (.env)](#7-configuración-env)
8. [Despliegue paso a paso](#8-despliegue-paso-a-paso)
9. [Compilar y repartir el APK](#9-compilar-y-repartir-el-apk)
10. [Uso diario para el administrador](#10-uso-diario-para-el-administrador)
11. [Pruebas realizadas](#11-pruebas-realizadas)
12. [Pruebas pendientes en celular real](#12-pruebas-pendientes-en-celular-real)
13. [Riesgos y pendientes](#13-riesgos-y-pendientes)
14. [Preguntas frecuentes](#14-preguntas-frecuentes)
15. [Glosario](#15-glosario)

---

## 1. Objetivo

**Requisito original:**
- Ciertos usuarios (por ejemplo, supervisores) solo deben poder entrar desde el **primer celular** donde iniciaron sesión.
- Si cierran sesión y vuelven a entrar en **ese mismo celular**, debe funcionar.
- Desde **otro celular o una PC** deben ser rechazados, **aunque la contraseña sea correcta**.
- Si cambian de celular de verdad, **un admin resetea** la vinculación.
- Una sesión a la vez.
- Se accede **solo por una app (APK)**; por la web se rechaza.

**Hallazgo previo:** antes de blindar el login, había datos que se podían ver **sin login** (ubicaciones en vivo de radios, bodycams y cámaras). Eso se resolvió primero (punto 1).

---

## 2. Resumen de lo realizado

| Punto | Qué resuelve | Estado |
|-------|--------------|--------|
| **1. Cierre de accesos sin login** | Los endpoints `/camaras`, `/radios` y `/bodycams/cercanas` exigen una API key. Las bodycams pasan por el backend (el token `cecom2026` sale del JavaScript de la web). CORS configurable. | ✅ Probado · ⚠️ **No desplegado. En producción `radios/cercanas` todavía responde sin login.** |
| **2. Vinculación usuario ↔ celular (backend)** | Check `mobile_only` por usuario; login con firma del celular; token de 15 min + refresh con firma; reset por admin; SSE que se cierra al vencer el token; auditoría. Corrige además un bug que ya existía en el límite de sesiones. | ✅ Probado (53/53) |
| **3. App móvil + Key Attestation + admin** | App Expo `map610-app` que abre la web y guarda la llave en el chip del celular. El backend verifica con Google que la llave es de un Android real y de nuestra app. Pantalla de admin para activar el modo y resetear. | ✅ Probado sin hardware (18/18 + 53/53 + 5/5) · ⏳ **Falta el APK en un celular** |

---

## 3. Sistemas y URLs

| Sistema | Ubicación local | Producción | ¿Debe ser público? |
|---------|-----------------|------------|--------------------|
| Backend (NestJS) | `SISTEMA MAPA OPERADORES\Sivecam_Backend` | `https://backend-incidencias.munisjl.gob.pe/api/` | **Sí** (ya lo es) |
| Web (React + Vite) | `SISTEMA MAPA OPERADORES\MAP_610_NEW` | `https://mit.munisjl.gob.pe/` | **Sí** (ya lo es); la app la muestra adentro |
| App móvil (Expo) | `SISTEMA MAPA OPERADORES\map610-app` | Se reparte como APK | No aplica |
| API externa de bodycams | — | `http://gps-bodycam.munisjl.gob.pe:8087` | Solo la necesita el backend |

### Sobre `pe.gob.sjl.sivecam`
**No es una dirección web y no hay que publicarla.** Es el **identificador interno de la app** (package name). Se escribe al revés que un dominio solo por convención, para que no choque con apps de otras organizaciones. `panico-app` usa `pe.gob.sjl.panico` de la misma forma.

Para qué sirve:
- Android lo usa para reconocer las actualizaciones de la app.
- Play Store lo usará como identificador cuando se publique.
- El backend lo verifica para confirmar que la llave la creó nuestra app.

**No se puede cambiar después de repartir la app.**

---

## 4. Cómo funciona

### 4.1 Usuarios normales (web)
No cambia nada: login con usuario y contraseña, token de 8 h (`JWT_EXPIRES_IN`), sin refresh.

### 4.2 Usuarios "Solo app móvil"
```
                ┌──────────────── Celular ─────────────────┐
                │  App SIVECAM Móvil                        │
                │  ┌──────────────────────┐  ┌───────────┐  │
 Usuario ──────►│  │ Web mit (WebView)     │◄►│ Módulo    │  │
                │  │ login, mapa, etc.     │  │ Keystore  │  │
                │  └──────────┬───────────┘  │ (llave    │  │
                │             │ puente seguro │  privada) │  │
                │             │ (solo firma   └───────────┘  │
                │             │  retos)                      │
                └─────────────┼─────────────────────────────┘
                              │ HTTPS
                              ▼
                ┌─────────────────────────────┐
                │ Backend                     │
                │  · reto de un solo uso      │
                │  · verifica la firma        │
                │  · 1.ª vez: verifica con    │
                │    Google (Key Attestation) │
                │  · token 15 min + refresh   │
                └─────────────────────────────┘
```

**Primer ingreso (vinculación):**
1. La web, dentro de la app, pide un **reto** al backend (un texto aleatorio que dura 2 min y sirve una sola vez).
2. La app crea una **llave nueva en el chip de seguridad** del celular. El reto queda grabado dentro del certificado que emite el hardware.
3. La app **firma** el reto y envía, junto con la contraseña: la firma, la llave pública, la cadena de certificados (*attestation*) y el modelo del celular.
4. El backend verifica la contraseña, la firma y la attestation:
   - La cadena termina en una raíz de **Google**.
   - Contiene **este reto**.
   - La llave está en **hardware** (TEE o StrongBox), no emulada.
   - La creó la app **`pe.gob.sjl.sivecam`** firmada con **nuestro certificado**.
   - El celular **no está rooteado** (bootloader bloqueado).
   - El hardware **no fue revocado** por Google.
5. Si todo está bien, guarda la llave pública: **el celular queda vinculado**.

**Ingresos siguientes:** reto → firma con la llave ya guardada → el backend compara con la llave vinculada. No hace falta volver a hacer la attestation.

**Durante el uso:**
- El token dura **15 minutos**. Antes de que venza, la app lo renueva sola con un reto nuevo firmado. El usuario no nota nada.
- Si una petición falla por token vencido, se renueva y se **repite automáticamente**.
- El canal de avisos en tiempo real (SSE) se cierra cuando vence el token y se reconecta con el renovado.

**Qué se rechaza:**

| Intento | Resultado |
|---------|-----------|
| Entrar por la web (PC o navegador del celular) | `403` "Este usuario solo puede ingresar desde la app móvil autorizada" |
| Entrar desde la app en otro celular | `403` "Esta cuenta está vinculada a otro dispositivo…" |
| Script o navegador que intenta hacerse pasar por la app | `400`/`403`: sin attestation válida de Google no se vincula |
| Token robado del celular | Sirve como máximo 15 min; no se puede renovar sin la llave del chip |
| Reusar un refresh token viejo | Se cierra la sesión entera por seguridad |
| Celular rooteado | `403 ATTESTATION_BOOTLOADER` (configurable) |

### 4.3 Reset por el administrador
Gestión de Usuarios → botón **Restablecer dispositivo**:
- La app del celular viejo recibe el aviso **al instante** y su sesión se cierra.
- El próximo ingreso desde la app vincula el celular nuevo.
- Queda registrado en la auditoría quién lo hizo.

---

## 5. Decisiones tomadas y por qué

| Decisión | Alternativas descartadas | Motivo |
|----------|--------------------------|--------|
| **App (APK) con la llave en el chip del celular** | Token en una cookie del navegador; "huella" del navegador (fingerprinting) | La cookie se pierde o se copia; el fingerprinting falla con cada actualización del navegador. El chip es lo único que no se puede copiar. |
| **Expo + EAS Build** | Capacitor | Compila en la nube (no hace falta el Android SDK en la PC); permite iOS sin Mac a futuro; el equipo ya lo usa en `panico-app`. |
| **La app muestra la web (WebView)** | Rehacer el mapa en la app | No se duplica el trabajo; los cambios de la web llegan a la app sin un APK nuevo. |
| **Key Attestation obligatoria** | Confiar en el primer vínculo | Sin attestation, alguien que conociera la contraseña antes que el supervisor podía vincular un script. Con attestation solo se vincula un Android real con nuestra app. |
| **Activación por usuario** (no por rol) | Por rol | Más control; se puede ir activando de a poco (por ejemplo, los usuarios de iPhone siguen por web). |
| **Token de 15 min + refresh con firma** | Token largo | Un token robado deja de servir en minutos. |
| **Una sesión a la vez** para estos usuarios | — | Un solo celular vinculado. |
| **Android primero; iPhone después** | — | Un APK no funciona en iPhone; iOS requiere la cuenta de Apple (99 USD/año) y TestFlight o App Store. |

---

## 6. Inventario de cambios por proyecto

### 6.1 `Sivecam_Backend` (rama `diego`)
**Nuevos**
- `src/modules/bodycam/` — proxy de bodycams con JWT (punto 1)
- `src/modules/auth/guard/api-key.guard.ts` — API key para integraciones (punto 1)
- `src/modules/auth/device/device-crypto.ts` — retos, verificación de firmas (punto 2)
- `src/modules/auth/device/android-attestation.ts` — verificación de Key Attestation (punto 3)
- `src/modules/auth/device/google-attestation-roots.ts` — raíces de Google (punto 3)
- `src/modules/auth/device/android-attestation.spec.ts` — 18 pruebas (punto 3)
- `src/modules/auth/dto/device.dto.ts` — DTOs de reto, firma y refresh (puntos 2 y 3)
- `prisma/migrations/20261009120000_add_mobile_device_binding/` — migración (punto 2)
- `scripts/test-device-binding.js` — prueba end-to-end (puntos 2 y 3)
- `docs/` — esta guía y los 3 informes

**Modificados**
- `src/app.controller.ts`, `src/app.service.ts`, `src/app.module.ts`, `src/main.ts` (punto 1)
- `src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `jwt/jwt.strategy.ts`, `dto/login.dto.ts`, `dto/index.ts`, `guard/custom-role.guard.ts`, `guard/index.ts`
- `src/modules/session-events/session-events.service.ts` (nuevos motivos y bug corregido)
- `src/modules/user/` — `mobile_only`, reset de dispositivo
- `prisma/schema.prisma`
- `.env.template`
- `package.json`, `package-lock.json`, `yarn.lock` — dependencias nuevas `@peculiar/asn1-*` y, solo para pruebas, `@peculiar/x509`

### 6.2 `MAP_610_NEW` (rama `diego`)
- `src/services/bodycamService.js` — bodycams vía backend (punto 1)
- `src/services/nativeDevice.js` *(nuevo)* — integración con la app (punto 3)
- `src/services/authService.js` — login con firma dentro de la app
- `src/services/sessionGuard.js` — avisos nuevos, renovación y reintento, reconexión del SSE
- `src/main.jsx` — renovación automática
- `src/components/admin/GestionUsuarios.jsx` + `.css` — check "Solo app móvil", columna Acceso, reset
- `src/services/usuariosService.js` — `resetDevice`
- `.env.local` (no versionado) — se quitaron `VITE_BODYCAM_*`

### 6.3 `map610-app` (nuevo)
- `App.tsx`, `src/bridge.ts`, `src/config.ts`
- `modules/device-key/` — módulo nativo Kotlin
- `app.json`, `eas.json`, `package.json`
- `README.md` — cómo compilar

---

## 7. Configuración (.env)

### Backend (`Sivecam_Backend/.env`)
| Variable | Valor en producción | Para qué |
|----------|---------------------|----------|
| `CORS_ORIGINS` | `https://mit.munisjl.gob.pe` (más otros orígenes legítimos) | Solo la web oficial (y la app, que carga esa web) puede consultar el backend desde un navegador |
| `BODYCAM_API_URL` | `http://gps-bodycam.munisjl.gob.pe:8087` | API de bodycams |
| `BODYCAM_API_TOKEN` | El token **nuevo** (rotar `cecom2026`) | Solo vive en el servidor |
| `INTEGRATION_API_KEYS` | Una llave aleatoria por sistema externo | Para quien consuma los endpoints `.../cercanas` |
| `MOBILE_ACCESS_TOKEN_TTL` | *(vacío = 15m)* | Duración del token de la app |
| `MOBILE_REFRESH_TTL_DAYS` | *(vacío = 30)* | Tras 30 días sin uso hay que volver a ingresar |
| `DEVICE_ATTESTATION` | *(vacío = required)* — **nunca `off` en producción** | Exige la verificación de Google al vincular |
| `ANDROID_PACKAGE_NAME` | *(vacío = pe.gob.sjl.sivecam)* | Identificador de la app |
| `ANDROID_SIGNING_CERT_SHA256` | El SHA-256 que da `eas credentials` (§9) | Solo se acepta nuestro APK firmado |
| `ATTESTATION_REQUIRE_LOCKED_BOOTLOADER` | *(vacío = true)* | Rechaza celulares rooteados |

Generar llaves aleatorias: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

### Web (`MAP_610_NEW/.env`)
Solo `VITE_API_URL`. **Nunca van secretos en el `.env` de la web**: todo lo que se pone ahí termina en el JavaScript que descarga cualquier visitante.

---

## 8. Despliegue paso a paso

> Orden obligatorio: **backend → web → APK → activar usuarios.** El backend nuevo es compatible con la web actual.

### Paso 1 — Backend (urgente por el punto 1)
1. Subir la rama con los cambios.
2. `npm install`
3. Aplicar la migración `20261009120000_add_mobile_device_binding`, con el mismo método que las anteriores (`prisma migrate deploy` o ejecutando el SQL).
4. `npx prisma generate` y `npm run build`
5. Configurar el `.env` (§7). `ANDROID_SIGNING_CERT_SHA256` puede quedar vacío hasta el paso 3.
6. Reiniciar y comprobar:
   - Desde un celular **con datos móviles**, `https://backend-incidencias.munisjl.gob.pe/api/radios/cercanas?lat=-11.98&lng=-77&radio=1000` debe responder **401**.
   - El log muestra las rutas `/api/bodycams` y `/api/auth/device/challenge`.
7. Entregar su `INTEGRATION_API_KEYS` a cualquier sistema externo que use los `.../cercanas`.

### Paso 2 — Web
1. Desplegar `MAP_610_NEW`.
2. Comprobar que las capas de bodycams, la búsqueda y las rutas funcionan, y que en DevTools ya no aparecen llamadas a `gps-bodycam` ni el texto `cecom2026`.

### Paso 3 — APK (§9)

### Paso 4 — Activar usuarios
Solo cuando el usuario **ya tenga el APK instalado**: Gestión de Usuarios → editar → **Solo app móvil** → Guardar.

### Tareas fuera del código
- **Rotar el token `cecom2026`** de la API de bodycams: estuvo publicado en la web. Lo hace quien administra esa API.

---

## 9. Compilar y repartir el APK

No hace falta Android Studio: compila Expo en la nube.

```bash
cd "SISTEMA MAPA OPERADORES/map610-app"
npm install
npx eas-cli@latest login       # con TU cuenta de Expo (o una organización del equipo)
npx eas-cli@latest init        # solo la primera vez
npx eas-cli@latest build -p android --profile preview
```

1. La primera vez EAS pregunta si crea la **llave de firma del APK**: responder **Sí**. Queda guardada en la cuenta de Expo. **Si se pierde, no se pueden publicar actualizaciones.**
2. Al terminar, EAS da un **enlace de descarga del `.apk`**.
3. Obtener la huella de firma:
   ```bash
   npx eas-cli@latest credentials -p android
   ```
   Copiar el **SHA256 Fingerprint** a `ANDROID_SIGNING_CERT_SHA256` en el backend y reiniciarlo.
4. Repartir el `.apk` (WhatsApp, correo, enlace). En el celular hay que permitir "instalar apps de orígenes desconocidos". Android puede mostrar un aviso de Play Protect; es normal en apps fuera de la tienda.

**Cuenta de Expo:** se recomienda una propia o una organización del equipo, no la cuenta personal de otra persona (`panico-app` está en la cuenta `jozze1`). Así nadie depende de un tercero para actualizar la app.

**Actualizaciones:**
- Cambios en la web → **no requieren un APK nuevo**.
- Cambios en `map610-app` → nuevo `eas build` y repartir el APK. Se instala encima, sin perder la vinculación.

---

## 10. Uso diario para el administrador

| Situación | Qué hacer |
|-----------|-----------|
| Dar acceso a un supervisor solo por la app | Que instale el APK → Gestión de Usuarios → editar → **Solo app móvil** → Guardar → que ingrese desde la app (se vincula) |
| Verificar a qué celular está vinculado | Columna **Acceso** → pasar el mouse sobre "App · vinculado", o abrir el formulario de edición |
| Cambió de celular o reinstaló la app | **Restablecer dispositivo** → que ingrese desde la app en el celular nuevo |
| Dice "vinculada a otro dispositivo" **sin haber cambiado de celular** | Posible uso indebido: **restablecer y cambiar la contraseña** |
| Volver a permitirle la web | Editar → desmarcar **Solo app móvil** |
| Usuario con iPhone | Por ahora **no activar** "Solo app móvil"; sigue por web |
| Ver el historial | Módulo de Auditoría: acciones `DEVICE_BOUND` y `DEVICE_RESET` |

**Avisos para los usuarios de la app:**
- No desinstalar la app: se pierde la vinculación y el admin tiene que restablecerla.
- Si el celular está rooteado o modificado, no podrá vincularse.

---

## 11. Pruebas realizadas

| Prueba | Resultado |
|--------|-----------|
| Punto 1: endpoints sin login → 401; con login o API key → 200; CORS restringido; bodycams vía backend (20/20, incluida una respuesta lenta de 11 s); bundle sin `cecom2026` | ✅ |
| Punto 2: `scripts/test-device-binding.js` — 13 escenarios: web, primera vinculación, mismo celular, otro celular, retos, refresh, expiración y SSE, reset, llave en formato iOS, validaciones, desactivar | ✅ 53/53 |
| Punto 3: pruebas unitarias del verificador de attestation | ✅ 18/18 |
| Punto 3: modo producción (`--attestation`): sin attestation, falsificada, ilegible → rechazadas | ✅ 5/5 |
| Compilación: backend (`tsc`, `nest build`), web (`vite build`), app (`tsc`, `expo-doctor`, `prebuild`) | ✅ |

Repetir las pruebas:
```bash
cd Sivecam_Backend
npx jest src/modules/auth/device
# backend en otro terminal: PORT=3099 MOBILE_ACCESS_TOKEN_TTL=20s DEVICE_ATTESTATION=off node dist/src/main.js
node scripts/test-device-binding.js http://localhost:3099/api
# backend con attestation exigida: PORT=3099 node dist/src/main.js
node scripts/test-device-binding.js http://localhost:3099/api --attestation
```
> El script crea un usuario temporal en la BD de `.env` y lo borra al terminar. **No usar contra producción.**

---

## 12. Pruebas pendientes en celular real

- [ ] `eas build` compila sin errores (el código Kotlin solo se compila en EAS).
- [ ] Ingresar desde la app con un usuario "Solo app móvil": se vincula; el admin ve el modelo del celular.
- [ ] La auditoría `DEVICE_BOUND` muestra `securityLevel` TEE o StrongBox (confirma la attestation real de Google).
- [ ] El mismo usuario en la web de la PC: rechazado.
- [ ] La app abierta más de 15 min sigue funcionando (renovación automática).
- [ ] Cerrar sesión y volver a entrar en el mismo celular: OK.
- [ ] El APK en otro celular: "vinculada a otro dispositivo".
- [ ] Restablecer desde el admin: aviso inmediato en la app; el celular nuevo se vincula.
- [ ] Pantalla de admin en el navegador: columna Acceso, check, botón de reset.
- [ ] Usuarios normales: web sin cambios.

---

## 13. Riesgos y pendientes

| # | Pendiente | Prioridad |
|---|-----------|-----------|
| 1 | **Desplegar el punto 1** (las radios siguen expuestas sin login en producción) | 🔴 Urgente |
| 2 | **Rotar el token `cecom2026`** de la API de bodycams | 🔴 Alta |
| 3 | Averiguar quién consume `.../cercanas` y darle su API key | 🔴 Alta |
| 4 | Compilar el APK, configurar `ANDROID_SIGNING_CERT_SHA256` y probar en un celular (§12) | 🔴 Alta |
| 5 | Configurar `CORS_ORIGINS` en producción | 🟡 Media |
| 6 | Rate limiting en login y retos (hoy no limita intentos por IP) | 🟡 Media |
| 7 | `PATCH`/`DELETE /user/:id` no exigen permiso de edición (problema que ya existía: con acceso de lectura al módulo se puede editar) | 🟡 Media |
| 8 | Verificar si la API de bodycams es accesible desde internet; si solo la usa el backend, restringirla a la red interna | 🟡 Media |
| 9 | Las exportaciones a Excel no descargan dentro de la app | 🟢 Baja |
| 10 | Versión iOS (Secure Enclave + App Attest, cuenta de Apple) | 🟢 Futuro |
| 11 | Filtrar las bodycams por jurisdicción del rol | 🟢 Opcional |
| 12 | Hacer commit de los tres proyectos y abrir PR hacia `andre` | ⏳ Cuando se valide |

Los riesgos residuales detallados (token del SSE en la URL, canal SSE en memoria, etc.) están en los informes de los puntos 2 y 3.

---

## 14. Preguntas frecuentes

**¿Qué es el SDK de Android? ¿Tengo que instalarlo?**
Son las herramientas de Google para convertir el código en un APK. **No hace falta instalarlo**: con Expo/EAS el APK se compila en la nube.

**¿`pe.gob.sjl.sivecam` tiene que ser una web pública?**
No. Es el nombre interno de la app (ver §3). Solo deben ser públicos el backend y la web `mit`, y ya lo son.

**¿La app necesita la web `mit` o solo el backend?**
Las dos: la app muestra la web `mit` adentro y la web consulta el backend.

**¿Puedo pasarle el APK a un usuario con iPhone?**
No: un APK solo funciona en Android. Para iPhone hace falta la cuenta de Apple Developer (99 USD/año) y distribuir por TestFlight o App Store. Con Expo se compila sin Mac. Mientras tanto, esos usuarios siguen por web (sin activar "Solo app móvil").

**¿Hay que subir la app a Play Store?**
No es obligatorio. Se puede repartir el APK directo. Si se sube después, se usa la misma llave de firma de EAS para no perder las vinculaciones.

**¿Qué pasa si el usuario desinstala la app o le hace un reset de fábrica al celular?**
La llave se borra. El admin debe usar **Restablecer dispositivo** y el usuario vuelve a ingresar desde la app.

**¿Qué pasa si roban el celular?**
El ladrón necesita además la contraseña. Para cortar el acceso al instante: **Restablecer dispositivo** y cambiar la contraseña.

**¿Cada cambio de la web obliga a sacar un APK nuevo?**
No. Solo los cambios en `map610-app` (la parte nativa).

**¿Por qué la attestation rechaza mi emulador o mi celular rooteado?**
Por diseño: solo se aceptan llaves en el hardware de un Android no modificado. Para pruebas locales sin celular existe `DEVICE_ATTESTATION=off`, **solo en local**.

---

## 15. Glosario

| Término | Significado |
|---------|-------------|
| **APK** | Archivo instalador de una app Android |
| **Expo / EAS Build** | Herramienta para hacer apps con React Native; EAS compila el APK en la nube |
| **WebView** | Navegador interno de la app que muestra la web |
| **Keystore / StrongBox / TEE** | Zona segura del celular (TEE) o chip dedicado (StrongBox) donde vive la llave privada; no se puede extraer |
| **Llave pública / privada** | Par criptográfico: la privada (en el celular) firma; la pública (en el backend) verifica |
| **Reto (challenge / nonce)** | Texto aleatorio de un solo uso que el celular firma para demostrar que tiene la llave |
| **Key Attestation** | Certificado que emite el hardware del celular, firmado por Google, que describe la llave y la app que la creó |
| **Access token / refresh token** | El access token (15 min) autoriza las peticiones; el refresh token (30 días) permite renovarlo, siempre con una firma nueva del celular |
| **SSE** | Canal de avisos en tiempo real del backend a la web (sesión cerrada, permisos cambiados) |
| **Package name** | Identificador interno de la app (`pe.gob.sjl.sivecam`) |
| **SHA-256 del APK** | Huella del certificado con que se firma el APK; el backend la usa para aceptar solo nuestra app |
| **CORS** | Regla del navegador que define qué webs pueden consultar el backend |
