/**
 * Prueba end-to-end de la vinculación de dispositivo (usuarios "solo app móvil").
 * Simula la app: genera llaves ECDSA P-256 (como el Keystore de Android), pide retos,
 * los firma y recorre login, refresh, expiración, SSE y reset del admin.
 *
 * Uso (con el backend corriendo, idealmente con MOBILE_ACCESS_TOKEN_TTL=20s):
 *   node scripts/test-device-binding.js http://localhost:3099/api
 *     → batería completa; el backend debe correr con DEVICE_ATTESTATION=off (un script
 *       no tiene hardware que genere Key Attestation)
 *   node scripts/test-device-binding.js http://localhost:3099/api --attestation
 *     → con el backend en DEVICE_ATTESTATION=required (producción): verifica que sin
 *       attestation, o con una falsificada, NO se puede vincular un dispositivo
 *
 * Crea un usuario temporal y una sesión temporal de superadmin en la BD de .env
 * y los borra al terminar. NO usar contra producción.
 */
require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = (process.argv[2] || 'http://localhost:3099/api').replace(/\/$/, '');
const ATTESTATION_MODE = process.argv.includes('--attestation');
const prisma = new PrismaClient();
const USERNAME = `test_movil_${Date.now()}`;
const PASSWORD = 'Prueba#2026';

let pass = 0, fail = 0;
const results = [];
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, data: json.data };
}

// "Celular": par de llaves P-256. format 'spki' (Android) o 'raw' (iOS X9.63)
function newDevice(format = 'spki') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let pub;
  if (format === 'raw') {
    const jwk = publicKey.export({ format: 'jwk' });
    pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64');
  } else {
    pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  }
  return {
    publicKey: pub,
    sign: (message) => crypto.sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'der' }).toString('base64'),
  };
}

async function challenge(purpose, username = USERNAME) {
  return (await api('POST', '/auth/device/challenge', { username, purpose })).data;
}

async function appLogin(device, { sendKey = true, name = 'Celular de prueba' } = {}) {
  const ch = await challenge('login');
  return api('POST', '/auth/login', {
    username: USERNAME,
    password: PASSWORD,
    device: {
      challenge_id: ch.challenge_id,
      signature: device.sign(ch.message),
      ...(sendKey && { public_key: device.publicKey }),
      device_name: name,
    },
  });
}

async function appRefresh(device, refresh_token) {
  const ch = await challenge('refresh');
  return api('POST', '/auth/refresh', { refresh_token, challenge_id: ch.challenge_id, signature: device.sign(ch.message) });
}

const mine = (token) => api('GET', '/custom-role/mine', null, token);

// Lee el SSE hasta recibir un evento distinto de ping (o timeout)
function sseFirstEvent(token, timeoutMs) {
  return new Promise((resolve) => {
    const url = new URL(`${BASE}/auth/session-events?token=${encodeURIComponent(token)}`);
    const started = Date.now();
    const req = http.get(url, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        const m = buf.match(/event: (?!ping)(\S+)\n(?:id: .*\n)?data: (.*)\n/);
        if (m) { req.destroy(); resolve({ event: m[1], data: m[2], afterMs: Date.now() - started }); }
      });
      res.on('end', () => resolve({ event: '(cerrado)', afterMs: Date.now() - started }));
    });
    req.on('error', () => {});
    setTimeout(() => { req.destroy(); resolve({ event: '(timeout)', afterMs: timeoutMs }); }, timeoutMs);
  });
}

// Cadena autofirmada (raíz propia): lo máximo que puede fabricar un atacante sin hardware
async function fakeAttestationChain(devicePublicKeySpkiB64) {
  require('reflect-metadata');
  const x509 = require('@peculiar/x509');
  x509.cryptoProvider.set(crypto.webcrypto);
  const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const rootKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ['sign', 'verify']);
  const devicePub = await crypto.webcrypto.subtle.importKey('spki', Buffer.from(devicePublicKeySpkiB64, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const root = await x509.X509CertificateGenerator.createSelfSigned({ serialNumber: '01', name: 'CN=Google Falso', keys: rootKeys, signingAlgorithm: alg, notBefore: new Date(Date.now() - 864e5), notAfter: new Date(Date.now() + 864e5) });
  const leaf = await x509.X509CertificateGenerator.create({ serialNumber: '02', subject: 'CN=Android Keystore Key', issuer: root.subject, publicKey: devicePub, signingKey: rootKeys.privateKey, signingAlgorithm: alg, notBefore: new Date(Date.now() - 864e5), notAfter: new Date(Date.now() + 864e5) });
  return [leaf, root].map((c) => Buffer.from(c.rawData).toString('base64'));
}

async function attestationChecks(user, adminToken) {
  console.log('— Modo attestation exigida (DEVICE_ATTESTATION=required)');
  await api('PATCH', `/user/${user.id}`, { mobile_only: true }, adminToken);
  const phone = newDevice('spki');

  const ch1 = await challenge('login');
  const noAtt = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: ch1.challenge_id, signature: phone.sign(ch1.message), public_key: phone.publicKey } });
  check('Vincular sin attestation (script / navegador) → 400 ATTESTATION_REQUIRED', noAtt.status === 400 && noAtt.body.code === 'ATTESTATION_REQUIRED', `${noAtt.status} ${noAtt.body.code}`);

  const ch2 = await challenge('login');
  const fake = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: ch2.challenge_id, signature: phone.sign(ch2.message), public_key: phone.publicKey, attestation: await fakeAttestationChain(phone.publicKey) } });
  check('Vincular con attestation falsificada (raíz propia) → 403 ATTESTATION_UNTRUSTED', fake.status === 403 && fake.body.code === 'ATTESTATION_UNTRUSTED', `${fake.status} ${fake.body.code}`);

  const ch3 = await challenge('login');
  const garbage = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: ch3.challenge_id, signature: phone.sign(ch3.message), public_key: phone.publicKey, attestation: ['AAAA', 'BBBB'] } });
  check('Attestation ilegible → 403 ATTESTATION_CHAIN', garbage.status === 403 && garbage.body.code === 'ATTESTATION_CHAIN', `${garbage.status} ${garbage.body.code}`);

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { device_public_key: true } });
  check('El usuario sigue sin dispositivo vinculado', dbUser.device_public_key === null);
  const web = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
  check('La web sigue rechazada → 403 MOBILE_ONLY', web.status === 403 && web.body.code === 'MOBILE_ONLY');
  console.log(`
Resultado: ${pass} OK, ${fail} fallidas`);
  process.exitCode = fail ? 1 : 0;
}

async function main() {
  // ---------- Preparación ----------
  const role = await prisma.customRole.findFirst({
    where: { deleted_at: null, NOT: { system_slug: 'SUPERADMIN' } },
    select: { id: true, name: true },
  });
  const admin = await prisma.user.findFirst({
    where: { deleted_at: null, custom_role: { system_slug: 'SUPERADMIN' } },
    select: { id: true, username: true },
  });
  const user = await prisma.user.create({
    data: {
      username: USERNAME, password: bcrypt.hashSync(PASSWORD, 10),
      name: 'Prueba', lastname: 'Movil', custom_role_id: role.id, max_sessions: 3,
    },
  });
  const adminSession = await prisma.userSession.create({ data: { user_id: admin.id, user_agent: 'test-device-binding' } });
  const adminToken = jwt.sign({ sub: admin.id, sid: adminSession.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  console.log(`Usuario temporal: ${USERNAME} (rol ${role.name}) · admin: ${admin.username}\n`);

  try {
    if (ATTESTATION_MODE) {
      await attestationChecks(user, adminToken);
      return;
    }

    // ---------- 1. Usuario normal (aún no es "solo móvil") ----------
    console.log('— 1. Usuario normal: la web funciona como siempre');
    const web1 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
    check('Login web de usuario normal → 2xx', (web1.status === 200 || web1.status === 201), `status ${web1.status}`);
    check('Usuario normal no recibe refresh_token', web1.data && !('refresh_token' in web1.data));
    const exp1 = jwt.decode(web1.data.token).exp - Math.floor(Date.now() / 1000);
    check('Token web mantiene la duración actual (JWT_EXPIRES_IN)', exp1 > 3600, `${Math.round(exp1 / 3600)} h`);
    check('Token web funciona', (await mine(web1.data.token)).status === 200);

    // ---------- 2. Admin activa "solo app móvil" ----------
    console.log('\n— 2. Admin activa "solo app móvil"');
    const upd = await api('PATCH', `/user/${user.id}`, { mobile_only: true }, adminToken);
    check('PATCH mobile_only=true → 2xx', upd.status === 200, `status ${upd.status}`);
    check('max_sessions se fuerza a 1', upd.data?.max_sessions === 1, `max_sessions=${upd.data?.max_sessions}`);
    const webAfter = await mine(web1.data.token);
    check('La sesión web abierta queda cerrada al instante', webAfter.status === 401, `status ${webAfter.status} ${webAfter.body.code ?? ''}`);
    check('…con el motivo MOBILE_ONLY_ENABLED', webAfter.body.code === 'MOBILE_ONLY_ENABLED');

    // ---------- 3. Web rechazada ----------
    console.log('\n— 3. Desde la web: rechazado aunque la contraseña sea correcta');
    const web2 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
    check('Login web → 403 MOBILE_ONLY', web2.status === 403 && web2.body.code === 'MOBILE_ONLY', `${web2.status} ${web2.body.code} "${web2.body.message}"`);
    const bad = await api('POST', '/auth/login', { username: USERNAME, password: 'Incorrecta#1' });
    check('Contraseña incorrecta → 401 genérico (no revela que es "solo móvil")', bad.status === 401 && !bad.body.code, `${bad.status} "${bad.body.message}"`);
    const ghost = await api('POST', '/auth/device/challenge', { username: 'no_existe_xyz', purpose: 'login' });
    check('Pedir reto para un usuario inexistente responde igual (no revela usuarios)', ghost.status === 200);

    // ---------- 4. Primera vinculación ----------
    console.log('\n— 4. Primer login desde la app (celular A): vincula');
    const phoneA = newDevice('spki');
    const a1 = await appLogin(phoneA, { name: 'Samsung A54 (prueba)' });
    check('Login app celular A → 2xx', (a1.status === 200 || a1.status === 201), `status ${a1.status} ${a1.body.code ?? ''}`);
    check('Recibe refresh_token y expires_in', !!a1.data?.refresh_token && a1.data?.expires_in > 0, `expires_in=${a1.data?.expires_in}s`);
    check('Access token móvil es corto (según MOBILE_ACCESS_TOKEN_TTL)', a1.data?.expires_in <= 15 * 60);
    check('Token móvil funciona', (await mine(a1.data.token)).status === 200);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { device_public_key: true, device_info: true, device_bound_at: true } });
    check('BD guarda llave pública, equipo y fecha', !!dbUser.device_public_key && dbUser.device_info === 'Samsung A54 (prueba)' && !!dbUser.device_bound_at);
    const auditBound = await prisma.auditLog.findFirst({ where: { entity_id: user.id, action: 'DEVICE_BOUND' } });
    check('Auditoría registra DEVICE_BOUND', !!auditBound);

    // ---------- 5. Mismo celular: cierra sesión y vuelve a entrar ----------
    console.log('\n— 5. Mismo celular: logout y nuevo login');
    const lo = await api('POST', '/auth/logout', null, a1.data.token);
    check('Logout → 201/200', lo.status === 201 || lo.status === 200, `status ${lo.status}`);
    const a2 = await appLogin(phoneA, { sendKey: false });
    check('Nuevo login en el mismo celular (sin reenviar llave) → 2xx', (a2.status === 200 || a2.status === 201), `status ${a2.status} ${a2.body.code ?? ''}`);
    const a3 = await appLogin(phoneA);
    check('Login otra vez en el mismo celular (reenviando la misma llave) → 2xx', (a3.status === 200 || a3.status === 201));
    const a2after = await mine(a2.data.token);
    check('La sesión anterior se cierra (1 sesión a la vez)', a2after.status === 401 && a2after.body.code === 'SESSION_REPLACED', `${a2after.status} ${a2after.body.code}`);

    // ---------- 6. Otro celular ----------
    console.log('\n— 6. Otro celular (B): rechazado');
    const phoneB = newDevice('spki');
    const b1 = await appLogin(phoneB);
    check('Celular B con su llave → 403 DEVICE_MISMATCH', b1.status === 403 && b1.body.code === 'DEVICE_MISMATCH', `${b1.status} ${b1.body.code}`);
    const b2 = await appLogin(phoneB, { sendKey: false });
    check('Celular B sin enviar llave → 403 DEVICE_MISMATCH', b2.status === 403 && b2.body.code === 'DEVICE_MISMATCH', `${b2.status} ${b2.body.code}`);
    check('La sesión del celular A sigue activa', (await mine(a3.data.token)).status === 200);

    // ---------- 7. Retos ----------
    console.log('\n— 7. Retos de un solo uso');
    const ch = await challenge('login');
    const sig = phoneA.sign(ch.message);
    const body = { username: USERNAME, password: PASSWORD, device: { challenge_id: ch.challenge_id, signature: sig } };
    const r1 = await api('POST', '/auth/login', body);
    const r2 = await api('POST', '/auth/login', body);
    check('Primer uso del reto → 2xx', (r1.status === 200 || r1.status === 201));
    check('Reusar el mismo reto y firma → 401 INVALID_CHALLENGE', r2.status === 401 && r2.body.code === 'INVALID_CHALLENGE', `${r2.status} ${r2.body.code}`);
    const chRefresh = await challenge('refresh');
    const r3 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chRefresh.challenge_id, signature: phoneA.sign(chRefresh.message) } });
    check('Reto de "refresh" no sirve para login → 401 INVALID_CHALLENGE', r3.status === 401 && r3.body.code === 'INVALID_CHALLENGE');
    const chOther = await challenge('login', admin.username);
    const r4 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chOther.challenge_id, signature: phoneA.sign(chOther.message) } });
    check('Reto pedido para otro usuario → 401 INVALID_CHALLENGE', r4.status === 401 && r4.body.code === 'INVALID_CHALLENGE');
    const chExp = await challenge('login');
    await prisma.deviceChallenge.update({ where: { id: chExp.challenge_id }, data: { expires_at: new Date(Date.now() - 24 * 3600e3) } });
    const r5 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chExp.challenge_id, signature: phoneA.sign(chExp.message) } });
    check('Reto expirado → 401 INVALID_CHALLENGE', r5.status === 401 && r5.body.code === 'INVALID_CHALLENGE');

    // ---------- 8. Refresh ----------
    console.log('\n— 8. Refresh (renovar token)');
    let session = r1.data; // sesión vigente del celular A
    const f1 = await appRefresh(phoneA, session.refresh_token);
    check('Refresh con firma del celular A → 2xx', f1.status === 200, `status ${f1.status} ${f1.body.code ?? ''}`);
    check('Entrega token y refresh_token nuevos (rotación)', f1.data?.token && f1.data?.refresh_token !== session.refresh_token);
    check('Token renovado funciona', (await mine(f1.data.token)).status === 200);
    const f2 = await appRefresh(phoneB, f1.data.refresh_token);
    check('Refresh firmado por el celular B → 401 INVALID_SIGNATURE', f2.status === 401 && f2.body.code === 'INVALID_SIGNATURE', `${f2.status} ${f2.body.code}`);
    const f3 = await api('POST', '/auth/refresh', { refresh_token: f1.data.refresh_token });
    check('Refresh sin firma (token robado, sin llave) → 400', f3.status === 400, `status ${f3.status}`);
    const f4 = await appRefresh(phoneA, session.refresh_token);
    check('Reusar un refresh_token ya rotado → 401 REFRESH_REUSED', f4.status === 401 && f4.body.code === 'REFRESH_REUSED', `${f4.status} ${f4.body.code}`);
    const f5 = await mine(f1.data.token);
    check('…y por seguridad se cierra la sesión entera', f5.status === 401, `${f5.status} ${f5.body.code}`);

    // ---------- 9. Expiración del access token ----------
    console.log('\n— 9. Expiración del access token y SSE');
    session = (await appLogin(phoneA, { sendKey: false })).data;
    const ttl = session.expires_in;
    if (ttl > 60) {
      check('Expiración (omitido: levantar el backend con MOBILE_ACCESS_TOKEN_TTL=20s)', true, `ttl=${ttl}s`);
    } else {
      const ssePromise = sseFirstEvent(session.token, (ttl + 10) * 1000);
      await sleep((ttl + 2) * 1000);
      const expired = await mine(session.token);
      check(`Token vencido tras ${ttl}s → 401`, expired.status === 401, `status ${expired.status}`);
      const sse = await ssePromise;
      check('SSE avisa "token-expired" y se cierra al vencer el token', sse.event === 'token-expired', `${sse.event} a los ${Math.round(sse.afterMs / 1000)}s`);
      const f6 = await appRefresh(phoneA, session.refresh_token);
      check('Con token vencido, el refresh firmado sigue funcionando → 2xx', f6.status === 200, `status ${f6.status} ${f6.body.code ?? ''}`);
      session = f6.data;
    }
    const sseWebToken = await sseFirstEvent(web1.data.token, 3000);
    check('SSE con la vieja sesión web → session-ended', sseWebToken.event === 'session-ended', sseWebToken.data);

    // ---------- 10. Reset del admin ----------
    console.log('\n— 10. Admin restablece la vinculación (cambio de celular)');
    const sseLive = sseFirstEvent(session.token, 8000);
    await sleep(500);
    const rs = await api('POST', `/user/${user.id}/reset-device`, null, adminToken);
    check('POST reset-device → 201/200', rs.status === 201 || rs.status === 200, `status ${rs.status}`);
    check('Respuesta muestra el usuario sin dispositivo', rs.data && rs.data.device_bound_at === null && rs.data.mobile_only === true);
    const sseEv = await sseLive;
    check('El celular A recibe "session-ended" al instante por SSE', sseEv.event === 'session-ended' && sseEv.data.includes('DEVICE_RESET'), sseEv.data);
    const afterReset = await mine(session.token);
    check('Token del celular A ya no sirve', afterReset.status === 401 && afterReset.body.code === 'DEVICE_RESET', `${afterReset.status} ${afterReset.body.code}`);
    const refAfterReset = await appRefresh(phoneA, session.refresh_token);
    check('Refresh del celular A ya no sirve', refAfterReset.status === 401, `${refAfterReset.status} ${refAfterReset.body.code}`);
    const auditReset = await prisma.auditLog.findFirst({ where: { entity_id: user.id, action: 'DEVICE_RESET' } });
    check('Auditoría registra DEVICE_RESET con quién lo hizo', auditReset?.performed_by === admin.username);

    // ---------- 11. Nuevo celular (formato iOS) ----------
    console.log('\n— 11. Nuevo celular se vincula (llave en formato iOS / X9.63)');
    const phoneC = newDevice('raw');
    const c1 = await appLogin(phoneC, { name: 'iPhone (prueba)' });
    check('Celular C (llave raw X9.63) se vincula → 2xx', (c1.status === 200 || c1.status === 201), `status ${c1.status} ${c1.body.code ?? ''}`);
    const a4 = await appLogin(phoneA, { sendKey: false });
    check('El celular A viejo ahora es rechazado → 403 DEVICE_MISMATCH', a4.status === 403 && a4.body.code === 'DEVICE_MISMATCH');

    // ---------- 12. Llaves inválidas ----------
    console.log('\n— 12. Validaciones de llave');
    await api('POST', `/user/${user.id}/reset-device`, null, adminToken);
    const { publicKey: rsaPub } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const chR = await challenge('login');
    const rsa = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chR.challenge_id, signature: 'AAAA', public_key: rsaPub.export({ format: 'der', type: 'spki' }).toString('base64') } });
    check('Llave RSA (no P-256) → 400 INVALID_DEVICE_KEY', rsa.status === 400 && rsa.body.code === 'INVALID_DEVICE_KEY', `${rsa.status} ${rsa.body.code}`);
    const chK = await challenge('login');
    const nokey = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chK.challenge_id, signature: phoneA.sign(chK.message) } });
    check('Primera vinculación sin llave pública → 400 DEVICE_KEY_REQUIRED', nokey.status === 400 && nokey.body.code === 'DEVICE_KEY_REQUIRED', `${nokey.status} ${nokey.body.code}`);
    const chS = await challenge('login');
    const badSig = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD, device: { challenge_id: chS.challenge_id, signature: phoneB.sign('otro mensaje'), public_key: phoneA.publicKey } });
    check('Llave de A con firma que no corresponde → 401 INVALID_SIGNATURE (no vincula)', badSig.status === 401 && badSig.body.code === 'INVALID_SIGNATURE');
    const stillUnbound = await prisma.user.findUnique({ where: { id: user.id }, select: { device_public_key: true } });
    check('Tras intentos inválidos el usuario sigue sin vincular', stillUnbound.device_public_key === null);

    // ---------- 13. Desactivar "solo móvil" ----------
    console.log('\n— 13. Admin desactiva "solo app móvil"');
    await api('PATCH', `/user/${user.id}`, { mobile_only: false }, adminToken);
    const web3 = await api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
    check('Vuelve a poder entrar por la web → 2xx', (web3.status === 200 || web3.status === 201), `status ${web3.status}`);
  } finally {
    // ---------- Limpieza ----------
    await prisma.auditLog.deleteMany({ where: { entity_id: user.id } });
    await prisma.deviceChallenge.deleteMany({ where: { username: { in: [USERNAME, 'no_existe_xyz'] } } });
    await prisma.user.delete({ where: { id: user.id } }); // borra sus sesiones en cascada
    await prisma.userSession.deleteMany({ where: { id: adminSession.id } });
    await prisma.$disconnect();
  }

  console.log(`\nResultado: ${pass} OK, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
