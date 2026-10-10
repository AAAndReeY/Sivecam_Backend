# Auditoría de seguridad: Punto 2, vinculación de usuarios a un dispositivo móvil (backend)

**Fecha:** 2026-10-09
**Rama:** `diego` (backend `Sivecam_Backend`; un ajuste menor en `MAP_610_NEW`)
**Estado:** implementado y probado en local (**53/53 pruebas OK**), **sin desplegar ni commitear**
**Depende de:** [Punto 1](AUDITORIA_SEGURIDAD_PUNTO1.md) (cierre de accesos sin login)

---

## 1. Requisito

| Requisito | Cómo se cumple |
|-----------|----------------|
| Ciertos usuarios solo entran desde **su** celular | Check `mobile_only` por usuario. En el login, además de la contraseña, se exige una firma ECDSA hecha con la llave del celular vinculado. |
| Logout y nuevo login en el mismo celular → funciona | La llave vive en el Keystore del celular y sobrevive al logout. |
| Otro celular o una PC → rechazado aunque la contraseña sea correcta | No tiene la llave privada registrada → `403 DEVICE_MISMATCH` / `403 MOBILE_ONLY`. |
| Cambio real de celular → el admin resetea | `POST /api/user/:id/reset-device`. Cierra la sesión al instante (SSE) y el próximo login desde la app vincula el equipo nuevo. |
| Una sesión a la vez | Con `mobile_only`, `max_sessions` se fuerza a 1. |
| Un token robado no debe servir mucho tiempo | Access token de 15 min. El refresh exige una firma nueva del celular y rota en cada uso. |
| El SSE no debe quedar como puerta trasera | El canal valida la sesión al conectar, rechaza sesiones sin firma de usuarios `mobile_only` y se cierra cuando vence el token. |

Los usuarios **sin** `mobile_only` no cambian nada: login web igual, token de `JWT_EXPIRES_IN` (8 h) y sin refresh.

---

## 2. Diseño

### Criptografía
- **ECDSA P-256 + SHA-256**: lo soportan el **Android Keystore** y el **Secure Enclave de iOS** (para la futura versión de iPhone).
- La llave privada **nunca sale del celular**. El backend solo guarda la pública (`User.device_public_key`, SPKI DER base64).
- Formatos de llave pública aceptados: **SPKI DER** (Android, `PublicKey.getEncoded()`) y **X9.63 sin comprimir de 65 bytes** (iOS, `SecKeyCopyExternalRepresentation`). Se normalizan a SPKI.
- Firma esperada: **DER** (lo que devuelven por defecto `Signature.getInstance("SHA256withECDSA")` en Android y `.ecdsaSignatureMessageX962SHA256` en iOS).
- Mensaje firmado: `sivecam-device|<purpose>|<username>|<nonce>`. Incluye el propósito y el usuario, así que una firma no sirve para otro uso ni para otra cuenta. El backend lo devuelve armado en `message`.

### Retos (`DeviceChallenge`)
- De **un solo uso**: se marcan como usados aunque el intento falle.
- Expiran a los **2 minutos**.
- Atados a `username` y `purpose` (`login` | `refresh`).
- Pedir un reto **no revela** si el usuario existe.

### Sesiones móviles (`UserSession.is_mobile`)
- **Access token:** `MOBILE_ACCESS_TOKEN_TTL` (por defecto `15m`).
- **Refresh token:** `<session_id>.<secreto>`. En la BD solo se guarda el SHA-256 del secreto. Dura `MOBILE_REFRESH_TTL_DAYS` (por defecto 30 días).
- **Rotación en cada refresh**, de forma atómica. Si llega un refresh token **ya rotado**, se asume robo y se **revoca la sesión entera** (`REFRESH_REUSED`).

---

## 3. Contrato de la API (para la app, punto 3)

### 3.1 Pedir reto
```http
POST /api/auth/device/challenge
{ "username": "jperez", "purpose": "login" }        // o "refresh"

200 → { "data": { "challenge_id": "uuid", "nonce": "...", "message": "sivecam-device|login|jperez|...", "expires_in": 120 } }
```

### 3.2 Login desde la app
```http
POST /api/auth/login
{
  "username": "jperez",
  "password": "********",
  "device": {
    "challenge_id": "uuid",
    "signature": "<firma DER base64 de data.message>",
    "public_key": "<llave pública base64>",          // obligatoria la 1.ª vez; se puede enviar siempre
    "device_name": "Samsung SM-A546E, Android 14"   // opcional, lo ve el admin
  }
}

201 → { "data": { "user", "rol", "custom_role_id", "custom_role_name",
                  "token", "refresh_token", "expires_in" } }
```

### 3.3 Renovar token (antes de que venza, o tras un 401 por expiración)
```http
POST /api/auth/refresh
{ "refresh_token": "...", "challenge_id": "<reto con purpose=refresh>", "signature": "..." }

200 → { "data": { "token", "refresh_token", "expires_in" } }   // guardar el refresh_token NUEVO
```
> **Importante para la app:** las renovaciones deben ir **una a la vez**. Si se envían dos refresh en paralelo con el mismo token, el segundo se toma como reuso y la sesión se cierra.

### 3.4 SSE
`GET /api/auth/session-events?token=...` emite estos eventos:
- `session-ended` `{code, message}`: la sesión fue revocada (reemplazo, reset, deshabilitado…). Ir al login.
- `token-expired`: el token del canal venció. Renovar con `/auth/refresh` y reconectar con el token nuevo.
- `perms-changed`: recargar permisos.

### 3.5 Admin
```http
PATCH /api/user/:id            { "mobile_only": true | false }
POST  /api/user/:id/reset-device                                   // requiere módulo "usuarios" con permiso de edición
GET   /api/user, /api/user/:id → incluye mobile_only, device_info, device_bound_at (nunca la llave)
```

### 3.6 Códigos de error (`body.code`)
| Código | HTTP | Cuándo | Qué mostrar o hacer |
|--------|------|--------|---------------------|
| `MOBILE_ONLY` | 403 | Login web (sin `device`) de un usuario solo móvil, o una sesión sin firma | "Este usuario solo puede ingresar desde la app móvil autorizada" |
| `DEVICE_MISMATCH` | 403 | Otro celular, o una firma que no corresponde a la llave vinculada | "Cuenta vinculada a otro dispositivo, pide un reset al admin" |
| `DEVICE_KEY_REQUIRED` | 400 | Primera vinculación sin `public_key` | Bug de la app |
| `INVALID_DEVICE_KEY` | 400 | La llave no es P-256 | Bug de la app |
| `INVALID_SIGNATURE` | 401 | Firma inválida al vincular o al hacer refresh | Reintentar; si persiste, es un bug |
| `INVALID_CHALLENGE` | 401 | Reto vencido, usado, de otro usuario o de otro propósito | Pedir un reto nuevo |
| `REFRESH_REUSED` | 401 | Reuso de un refresh token ya rotado | Ir al login |
| `SESSION_EXPIRED` | 401 | El refresh token venció (30 días) | Ir al login |
| `MOBILE_ONLY_ENABLED` / `DEVICE_RESET` / `SESSION_REPLACED` / `USER_DISABLED` | 401 | La sesión fue revocada | Mostrar el `message` e ir al login |

---

## 4. Cambios realizados

### Base de datos (migración `20261009120000_add_mobile_device_binding`)
- `User`: `mobile_only` (bool, por defecto false), `device_public_key`, `device_info`, `device_bound_at`.
- `UserSession`: `is_mobile`, `refresh_token_hash`, `refresh_expires_at`.
- Tabla nueva `DeviceChallenge`.
- La migración es idempotente (`IF NOT EXISTS`), igual que las anteriores. **Ya está aplicada en la BD local.**

### Backend
| Archivo | Cambio |
|---------|--------|
| `src/modules/auth/device/device-crypto.ts` *(nuevo)* | Mensaje del reto, normalización de llaves (SPKI / X9.63), verificación ECDSA, hashes y tokens aleatorios. |
| `src/modules/auth/dto/device.dto.ts` *(nuevo)* | `DeviceChallengeDto`, `DeviceProofDto`, `RefreshTokenDto`, con validación y largos máximos. |
| `src/modules/auth/dto/login.dto.ts` | Campo opcional `device`. |
| `src/modules/auth/auth.service.ts` | Login de dos caminos (web / app firmada), vinculación atómica (si dos celulares se vinculan a la vez, gana uno), `createChallenge`, `refresh` con rotación y detección de reuso, SSE con cierre al vencer el token y rechazo de sesiones sin firma. Auditoría `DEVICE_BOUND`. |
| `src/modules/auth/auth.controller.ts` | `POST /auth/device/challenge`, `POST /auth/refresh`. |
| `src/modules/auth/jwt/jwt.strategy.ts` | Rechaza, en **cada petición**, las sesiones sin firma de usuarios `mobile_only` (`MOBILE_ONLY`). |
| `src/modules/session-events/session-events.service.ts` | Nuevos motivos (`DEVICE_RESET`, `MOBILE_ONLY_ENABLED`, `REFRESH_REUSED`). **Bug corregido** en `enforceSessionLimit`, ver §6. |
| `src/modules/user/*` | `mobile_only` en crear y editar (fuerza `max_sessions = 1`; al activarlo se cierran las sesiones abiertas). Nuevo `POST /user/:id/reset-device` (`ModuleOp('edit')`, protege cuentas Superadmin, auditoría `DEVICE_RESET`). El listado muestra `mobile_only`, `device_info` y `device_bound_at`. |
| `.env.template` | `MOBILE_ACCESS_TOKEN_TTL`, `MOBILE_REFRESH_TTL_DAYS`. |
| `scripts/test-device-binding.js` *(nuevo)* | Prueba end-to-end que simula la app. |

### Frontend web
| Archivo | Cambio |
|---------|--------|
| `src/services/sessionGuard.js` | Avisos para `MOBILE_ONLY_ENABLED`, `MOBILE_ONLY`, `DEVICE_RESET`, `REFRESH_REUSED`. |

El login web ya muestra el `message` del backend, así que un usuario solo móvil ve *"Este usuario solo puede ingresar desde la app móvil autorizada"* sin más cambios.

---

## 5. Verificación

`node scripts/test-device-binding.js http://localhost:3099/api`, con el backend compilado y `MOBILE_ACCESS_TOKEN_TTL=20s` para poder probar la expiración. El script crea un usuario temporal y una sesión temporal de superadmin en la BD local, y **los borra al terminar**.

**Resultado: 53 OK, 0 fallidas.**

| # | Escenario | Verificado |
|---|-----------|------------|
| 1 | Usuario normal | Login web OK, sin `refresh_token`, token de 8 h. |
| 2 | Admin activa `mobile_only` | `max_sessions` pasa a 1; la sesión web abierta se cierra al instante (`MOBILE_ONLY_ENABLED`). |
| 3 | Login web | `403 MOBILE_ONLY`. Con contraseña incorrecta, `401` genérico (no revela que el usuario es solo móvil). El reto para un usuario inexistente responde igual. |
| 4 | Primer login desde la app | Vincula; guarda llave, equipo y fecha; access token de 20 s + refresh; auditoría `DEVICE_BOUND`. |
| 5 | Mismo celular | Logout y re-login OK, con o sin reenviar la llave; la sesión anterior se cierra (`SESSION_REPLACED`). |
| 6 | Otro celular | `403 DEVICE_MISMATCH`, con o sin enviar su llave; la sesión del celular A sigue activa. |
| 7 | Retos | Reuso → `INVALID_CHALLENGE`. También rechazados: reto de otro propósito, de otro usuario y vencido. |
| 8 | Refresh | Rota los tokens. Firmado por otro celular → `INVALID_SIGNATURE`. Sin firma → 400. Refresh viejo reusado → `REFRESH_REUSED` y la sesión entera se cierra. |
| 9 | Expiración | Token vencido a los 20 s → 401. El SSE emite `token-expired` a los 20 s y se cierra. El refresh firmado sigue funcionando con el token vencido. El SSE de una sesión revocada → `session-ended`. |
| 10 | Reset del admin | El celular recibe `session-ended` (`DEVICE_RESET`) **al instante** por SSE; su token y su refresh dejan de servir; auditoría con quién lo hizo. |
| 11 | Celular nuevo | Se vincula con una llave en formato iOS (X9.63); el celular viejo queda rechazado. |
| 12 | Validaciones | Llave RSA → `INVALID_DEVICE_KEY`; sin llave → `DEVICE_KEY_REQUIRED`; firma que no corresponde → `INVALID_SIGNATURE` y **no vincula**. |
| 13 | Admin desactiva `mobile_only` | Vuelve a entrar por la web. |

Compilación: `tsc --noEmit` y `nest build` sin errores.

---

## 6. Bug preexistente encontrado y corregido

**`enforceSessionLimit` podía cerrar la sesión recién creada.** `UserSession.created_at` se guarda con `timezoneHelper()`, que tiene precisión de **segundos**. Si dos logins del mismo usuario caían en el mismo segundo, el orden por fecha era ambiguo, y con `max_sessions = 1` se podía revocar la sesión **nueva** y conservar la vieja. Las pruebas lo detectaron (re-login inmediato en el mismo celular).

**Corrección:** el login pasa el id de la sesión recién creada (`keep_id`) y esa sesión siempre se conserva. El comportamiento cuando el admin reduce `max_sessions` no cambia.

---

## 7. Límites conocidos y riesgos residuales

| # | Riesgo | Detalle | Mitigación |
|---|--------|---------|------------|
| R1 | **Primer vínculo: gana la primera llave que se presenta** | Si alguien conoce la contraseña **antes** de que el supervisor vincule su celular, puede vincular su propio "dispositivo" con un script, o incluso desde un navegador con WebCrypto. Una vez vinculado el celular real, ya no es posible. | **Ahora:** activar `mobile_only` justo cuando se entrega la app, cambiar la contraseña en ese momento y verificar en el admin que `device_info` sea el equipo esperado. Si el supervisor recibe `DEVICE_MISMATCH` sin haber cambiado de celular, hay que resetear **y cambiar la contraseña**. **Definitivo (punto 3):** Android **Key Attestation**. La app envía la cadena de certificados de la llave y el backend verifica, contra la raíz de Google, que la llave está en el hardware de un Android real y pertenece a **tu** app (paquete y firma). Con eso, ni un script ni un navegador pueden vincularse. |
| R2 | Desinstalar la app = perder la vinculación | La llave del Keystore se borra con la app. | Avisar a los usuarios; el admin resetea. |
| R3 | Sin límite de intentos (rate limiting) | `/auth/login` y `/auth/device/challenge` no limitan intentos por IP. Afecta a todos los usuarios, no solo a los móviles. | Agregar `@nestjs/throttler` (pendiente). |
| R4 | Token en la URL del SSE | Limitación de `EventSource`. Queda en los logs del proxy. | Para los móviles el token dura 15 min. A futuro, el SSE de la app puede usar la cabecera `Authorization` (la app nativa no depende de `EventSource`). |
| R5 | `User.token` guarda el último JWT en texto plano | Campo heredado; no se usa para validar. | Evaluar si se puede eliminar. |
| R6 | `PATCH /user/:id` y `DELETE /user/:id` no tienen `@ModuleOp` | Preexistente: cualquiera con acceso de **lectura** al módulo "usuarios" podría editar o eliminar usuarios, incluido activar o desactivar `mobile_only`. `reset-device` sí exige `edit`. | Agregar `@ModuleOp('edit')` / `@ModuleOp('delete')` (cambio de una línea cada uno; no se hizo para no alterar permisos sin acordarlo). |
| R7 | Canal SSE en memoria | Con varias instancias del backend, el aviso inmediato solo llega a los conectados a esa instancia. Los demás se enteran en su siguiente petición (≤ 15 min en el peor caso, para móviles). | Preexistente; aceptable con una sola instancia. |

---

## 8. Despliegue

1. **Aplicar la migración** en la BD de producción, con el mismo método que `20261003120000_add_user_sessions` (`prisma migrate deploy` o ejecutando el SQL).
2. `npx prisma generate` y `nest build`.
3. Opcional en el `.env`: `MOBILE_ACCESS_TOKEN_TTL=15m`, `MOBILE_REFRESH_TTL_DAYS=30` (son los valores por defecto).
4. Desplegar el backend. **Es compatible con la web actual**: mientras nadie tenga `mobile_only`, todo funciona igual.
5. Desplegar el frontend (avisos nuevos en `sessionGuard.js`).
6. **No activar `mobile_only` en ningún usuario hasta tener la app (punto 3)**: quedaría sin poder entrar.

**Nota local:** para regenerar Prisma sin detener el backend de desarrollo se renombró `node_modules/.prisma/client/query_engine-windows.dll.node` a `*.old-<timestamp>`. Se puede borrar después de reiniciar el backend.

---

## 9. Pendientes

| # | Pendiente | Prioridad |
|---|-----------|-----------|
| P1 | **UI de admin en la web**: check "Solo app móvil" en el formulario de usuario, mostrar equipo y fecha de vinculación, botón "Restablecer dispositivo". Sin esto, solo se puede administrar por API. | **Alta** (antes de usarlo) |
| P2 | **Punto 3: app Capacitor** con llave en el Keystore, siguiendo el contrato de §3. Incluir **Key Attestation** (R1). | **Alta** |
| P3 | Rate limiting en login y retos (R3). | Media |
| P4 | `@ModuleOp` en `PATCH`/`DELETE /user/:id` (R6). | Media |
| P5 | Probar con el backend de desarrollo reiniciado y con la web real (checklist §10). | Alta |

---

## 10. Checklist de prueba manual (web)

- [ ] Reiniciar el backend de desarrollo (para cargar el código y la migración).
- [ ] Un usuario normal entra por la web como siempre.
- [ ] Por API, activar `mobile_only` a un usuario de prueba. Si tenía la web abierta, ve el aviso *"Tu usuario ahora solo puede ingresar desde la app móvil autorizada"*.
- [ ] Ese usuario intenta entrar por la web y ve el mensaje de solo app móvil.
- [ ] Desactivar `mobile_only` y verificar que vuelve a entrar por la web.
- [ ] (Opcional) `node scripts/test-device-binding.js http://localhost:3005/api`: con TTL de 15 min, la prueba de expiración se omite automáticamente.
