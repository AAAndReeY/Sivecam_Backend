# Auditoría de seguridad: Punto 3, app móvil, Key Attestation y pantalla de admin

**Fecha:** 2026-10-09
**Proyectos:** `map610-app` (nuevo), `Sivecam_Backend` y `MAP_610_NEW`, rama `diego`
**Estado:** implementado y probado sin hardware. **Falta compilar el APK y probarlo en un celular real.** Sin commits ni despliegue.
**Depende de:** [Punto 1](AUDITORIA_SEGURIDAD_PUNTO1.md), [Punto 2](AUDITORIA_SEGURIDAD_PUNTO2.md)

---

## 1. Decisiones

| Tema | Decisión | Motivo |
|------|----------|--------|
| Tecnología | **Expo SDK 54 + EAS Build** (como `panico-app`) | Compila en la nube, sin el Android SDK en la PC; a futuro compila iOS sin Mac; el equipo ya la conoce. |
| Interfaz | La app abre la web (`https://mit.munisjl.gob.pe/`) en un **WebView** | Los cambios de la web no requieren un APK nuevo. |
| Llave | **Módulo nativo propio** en Kotlin (`modules/device-key`): ECDSA P-256 en Android Keystore, en **StrongBox** si existe | La llave privada no se puede exportar. |
| Vinculación | **Key Attestation obligatoria** en la primera vinculación | Cierra el riesgo R1 del punto 2 (primer vínculo). |
| Identificador | `pe.gob.sjl.sivecam` | Mismo estilo que `pe.gob.sjl.panico`. Es permanente y lo verifica el backend. |
| Carpeta | `SISTEMA MAPA OPERADORES\map610-app` | Parte del mismo sistema que el backend y la web. |

---

## 2. Cómo funciona de punta a punta

```
Celular (app)                         Web en WebView                       Backend
─────────────                         ──────────────                       ───────
                                      login(usuario, clave)
                                      ├─ device.info ─────────────► (nativo)
                                      ├─ POST /auth/device/challenge ─────────► nonce, message
  ┌ ¿Tiene llave?
  │ No / backend dice "sin vincular" (DEVICE_KEY_REQUIRED):
  │  device.createKey(nonce) → llave nueva en Keystore,
  │     cadena de attestation con el nonce adentro
  │  device.sign(message)
  │                                   └─ POST /auth/login {password, device:{firma,
  │                                        public_key, attestation[], device_name}} ──►
  │                                                                      verifica firma
  │                                                                      verifica attestation:
  │                                                                       raíz Google, reto,
  │                                                                       hardware, paquete,
  │                                                                       firma APK, bootloader,
  │                                                                       revocación → vincula
  │ Sí: device.sign(message) → login solo con la firma ─────────────────► compara con la
  └                                                                      llave vinculada
                                      token (15 min) + refresh_token
                                      cada ~14 min: reto "refresh" + firma → /auth/refresh
                                      401 por vencimiento → refresh y repite la petición
                                      SSE "token-expired" → refresh y reconecta
```

---

## 3. Cambios realizados

### 3.1 App `map610-app` (nuevo)
| Archivo | Contenido |
|---------|-----------|
| `modules/device-key/android/.../DeviceKeyModule.kt` | `generateKey(alias, challenge)`: P-256 + SHA-256, attestation challenge = nonce, StrongBox con respaldo en TEE; devuelve la llave pública SPKI y la cadena de certificados. `sign(alias, message)`: firma DER. `hasKey`, `getPublicKey`, `deleteKey`. |
| `modules/device-key/index.ts` | Wrapper TypeScript (`requireOptionalNativeModule`, que no rompe en plataformas sin el módulo). |
| `src/bridge.ts` | `window.SivecamNative.request(method, params)`. Firma **solo** mensajes `sivecam-device|…` de hasta 512 caracteres. Nunca expone la llave privada. |
| `src/config.ts` | URL de la web (sobrescribible con `EXPO_PUBLIC_WEB_URL`), orígenes permitidos, alias de la llave. |
| `App.tsx` | WebView: el puente solo responde a orígenes permitidos; los otros dominios se abren en el navegador; botón atrás; pantalla "Sin conexión"; user-agent `SivecamApp/1`. |
| `app.json` | `allowBackup: false` (los datos de la app no van al respaldo de Google). Permisos bloqueados: almacenamiento, superposición de ventanas, vibración. **Resultado: solo el permiso `INTERNET`** (verificado en el manifest generado). |
| `eas.json` | Perfiles `development` (APK con dev client), `preview` (APK para distribuir) y `production`. |
| `README.md` | Cómo compilar con EAS y configurar la huella del APK. |

### 3.2 Backend
| Archivo | Cambio |
|---------|--------|
| `src/modules/auth/device/android-attestation.ts` *(nuevo)* | Verificador de Key Attestation (detalle en §4). Lista de revocación de Google con caché de 12 h. |
| `src/modules/auth/device/google-attestation-roots.ts` *(nuevo)* | Las 2 raíces oficiales de Google (RSA 4096 hasta 2042; EC P-384 "Key Attestation CA1" hasta 2035), descargadas de `android.googleapis.com/attestation/root`. |
| `src/modules/auth/device/android-attestation.spec.ts` *(nuevo)* | 18 pruebas unitarias. |
| `src/modules/auth/auth.service.ts` | En la **primera vinculación** exige y verifica la attestation (`checkAttestation`). La auditoría `DEVICE_BOUND` registra el nivel de seguridad (TEE/StrongBox) y el estado del arranque. Avisos al arrancar si la attestation está apagada o falta la huella del APK. |
| `src/modules/auth/dto/device.dto.ts` | Campo `attestation: string[]` (máximo 10 certificados de 8 KB). |
| `.env.template` | `DEVICE_ATTESTATION`, `ANDROID_PACKAGE_NAME`, `ANDROID_SIGNING_CERT_SHA256`, `ATTESTATION_REQUIRE_LOCKED_BOOTLOADER`. |
| `scripts/test-device-binding.js` | Nuevo modo `--attestation`. |
| Dependencias | `@peculiar/asn1-android`, `@peculiar/asn1-schema`, `@peculiar/asn1-x509`; en desarrollo, `@peculiar/x509` (solo pruebas). |

### 3.3 Web `MAP_610_NEW`
| Archivo | Cambio |
|---------|--------|
| `src/services/nativeDevice.js` *(nuevo)* | `nativeLogin` (firma con la llave existente o vincula una nueva con attestation si el backend responde `DEVICE_KEY_REQUIRED`), `refreshMobileSession` (una renovación a la vez), renovación automática cada 30 s si faltan menos de 90 s, y también al volver la app al frente. |
| `src/services/authService.js` | Dentro de la app usa `nativeLogin`; el logout limpia el refresh token. |
| `src/services/sessionGuard.js` | Ante un 401 **sin código de revocación** en la app: renueva y **repite la petición** de forma transparente. SSE: ante `token-expired`, renueva y reconecta; ante un token renovado, reconecta. En el navegador normal el comportamiento no cambia. |
| `src/main.jsx` | Arranca la renovación automática (no hace nada fuera de la app). |
| `src/components/admin/GestionUsuarios.jsx` + `.css` | Columna **Acceso** (Web / App sin vincular / App vinculado), check **"Solo app móvil"** (fija 1 sesión y avisa que se cierran las sesiones abiertas), equipo y fecha de vinculación, botón **"Restablecer dispositivo"** con confirmación (en la tabla y en el formulario). |
| `src/services/usuariosService.js` | `resetDevice(id)`. |

---

## 4. Verificación de Key Attestation (backend)

Se acepta la primera vinculación **solo si se cumple todo** lo siguiente:

| # | Regla | Error si falla | Qué bloquea |
|---|-------|----------------|-------------|
| 1 | La cadena tiene entre 2 y 10 certificados, cada uno firmado por el siguiente, y los intermedios están vigentes | `ATTESTATION_CHAIN` | Cadenas armadas o mezcladas |
| 2 | Termina en una **raíz de Google** (se compara la llave pública) | `ATTESTATION_UNTRUSTED` | Scripts, navegadores, emuladores, cadenas falsificadas |
| 3 | Ningún certificado está en la **lista de revocación de Google** | `ATTESTATION_REVOKED` | Celulares con el hardware comprometido |
| 4 | La hoja certifica **la misma llave** que se presenta | `ATTESTATION_KEY_MISMATCH` | Reusar la attestation de otra llave |
| 5 | El attestation challenge es **el nonce de este reto** | `ATTESTATION_CHALLENGE` | Replay de una attestation vieja |
| 6 | Nivel de seguridad **TEE o StrongBox** (no software) | `ATTESTATION_SOFTWARE` | Llaves emuladas |
| 7 | Paquete `pe.gob.sjl.sivecam` y **firma del APK** en la lista configurada | `ATTESTATION_APP` | Otra app, o nuestra app re-firmada / modificada |
| 8 | **Bootloader bloqueado y arranque verificado** (configurable) | `ATTESTATION_BOOTLOADER` | Celulares rooteados o con sistema modificado |

Los logins siguientes con la llave ya vinculada **no** requieren attestation: basta la firma, porque la llave ya quedó comprobada como de hardware.

---

## 5. Pruebas

| Prueba | Resultado |
|--------|-----------|
| **Unitarias del verificador** (`npx jest src/modules/auth/device`). Cadenas generadas con una raíz de prueba inyectada: válida TEE y StrongBox, digest con formato `AB:CD:…`, raíz no Google, eslabón mezclado, cadena corta, otra llave, otro reto, software, otro paquete, re-firmada, sin digests, sin app id, sin extensión, bootloader desbloqueado (rechazo y modo relajado), revocado, carga de las 2 raíces oficiales | ✅ **18/18** |
| **E2E con `DEVICE_ATTESTATION=off`** (`node scripts/test-device-binding.js`): la batería completa del punto 2, para confirmar que no hubo regresión | ✅ **53/53** |
| **E2E con attestation exigida** (`--attestation`): vincular sin attestation → `400 ATTESTATION_REQUIRED`; con cadena autofirmada → `403 ATTESTATION_UNTRUSTED`; ilegible → `403 ATTESTATION_CHAIN`; el usuario sigue sin vincular; la web sigue rechazada | ✅ **5/5** |
| Backend `tsc --noEmit` + `nest build` | ✅ |
| Web `vite build` | ✅ (el aviso de CSS `Unexpected "}"` ya existía antes) |
| App `tsc --noEmit`; `expo-doctor` 17/18 (el que falla es una consulta a un servidor externo de Expo que no respondió); `expo prebuild` genera el proyecto, enlaza `device-key` y deja **solo `INTERNET`** en el manifest | ✅ |

### No verificado todavía (requiere el APK en un celular)
- **Compilación del Kotlin.** No hay Android SDK en la PC; lo compila EAS en la nube. Si falla, el log de EAS dirá dónde.
- **Una cadena de attestation real de Google.** Las pruebas usan una raíz de prueba; la lectura de la extensión real se valida con el primer celular.
- **El flujo web dentro del WebView** (login, renovación cada 15 min, reintento tras 401, reconexión del SSE). La lógica se escribió sobre el contrato ya probado del backend, pero no se ejecutó en un WebView.
- **La pantalla de admin en el navegador.** Compila, pero no se abrió.

---

## 6. Pasos para probar en un celular

1. **Backend** (local o un servidor de pruebas) con este código y la migración del punto 2 aplicada. Si la app apunta a producción, desplegar primero los puntos 1–3 (ver §8).
2. Compilar el APK (`map610-app/README.md`): `eas login` → `eas init` → `eas build -p android --profile preview`.
3. `eas credentials` → copiar el **SHA-256** a `ANDROID_SIGNING_CERT_SHA256` en el backend y reiniciarlo.
4. Instalar el APK en el celular (permitir "orígenes desconocidos").
5. En Gestión de Usuarios, crear un usuario de prueba con **"Solo app móvil"**.
6. Comprobar:
   - [ ] Entrar desde la app: vincula, y la tabla muestra "App · vinculado" con el modelo del celular.
   - [ ] La auditoría muestra `DEVICE_BOUND` con `securityLevel` TEE o StrongBox.
   - [ ] El mismo usuario desde la web en la PC: rechazado.
   - [ ] La app abierta más de 15 min sigue funcionando (renovación automática).
   - [ ] Cerrar sesión y volver a entrar en el mismo celular: funciona.
   - [ ] Instalar el APK en otro celular e intentar entrar: `DEVICE_MISMATCH`.
   - [ ] Restablecer el dispositivo desde el admin: la app recibe el aviso al instante; el otro celular ya puede vincularse.

---

## 7. Riesgos residuales

| # | Riesgo | Mitigación |
|---|--------|------------|
| R1 | La huella del APK no está configurada hasta la primera compilación. Mientras tanto se verifica solo el paquete. | Configurar `ANDROID_SIGNING_CERT_SHA256` apenas exista el primer APK. El backend avisa al arrancar mientras falte. |
| R2 | `ATTESTATION_REQUIRE_LOCKED_BOOTLOADER=true` rechaza celulares rooteados, incluido algún supervisor con un celular modificado. | Es lo correcto por seguridad. Se puede relajar con `false`. |
| R3 | Celulares viejos o sin hardware compatible (< Android 7, o sin TEE): no pueden vincularse. | Mensaje claro (`ATTESTATION_SOFTWARE` / `KEY_UNAVAILABLE`). Casi todos los celulares desde 2017 lo soportan. |
| R4 | Si la lista de revocación de Google no se puede descargar, se usa la última en caché o se omite. | Se registra un aviso; las demás reglas siguen aplicando. |
| R5 | Las exportaciones a Excel no descargan dentro del WebView. | Pendiente, si los usuarios móviles las necesitan. |
| R6 | iOS no está implementado. | Agregar un módulo Secure Enclave + App Attest cuando exista la cuenta de Apple. |
| R7 | El refresh token vive en el `localStorage` del WebView. | No sirve sin la firma del celular (el refresh exige una firma nueva). |

---

## 8. Despliegue (orden recomendado)

1. **Punto 1 primero (urgente):** en producción `GET /api/radios/cercanas` **sigue respondiendo sin login** (verificado el 2026-10-09).
2. Backend con los puntos 2 y 3: migración `20261009120000_add_mobile_device_binding`, `npm install`, `prisma generate`, build. En el `.env`:
   - `CORS_ORIGINS` debe incluir `https://mit.munisjl.gob.pe` (la app carga esa web).
   - `DEVICE_ATTESTATION` sin definir (equivale a `required`). **Nunca `off` en producción.**
   - `ANDROID_SIGNING_CERT_SHA256` después del primer build de EAS.
3. Web (`MAP_610_NEW`): pantalla de admin, `nativeDevice.js` y los cambios de sesión.
4. Compilar y repartir el APK. Recién entonces activar "Solo app móvil" a los usuarios.
