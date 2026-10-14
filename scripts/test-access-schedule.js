/**
 * Prueba end-to-end del horario de acceso por usuario.
 * Recorre: validaciones del admin, login dentro/fuera de horario, cierre de sesión al
 * cambiar el horario, cierre en la siguiente petición, cierre automático por SSE (revisión
 * cada 30 s) y renovación de la app móvil fuera de horario.
 *
 * Uso (con el backend corriendo con DEVICE_ATTESTATION=off, solo en local):
 *   node scripts/test-access-schedule.js http://localhost:3099/api
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
const prisma = new PrismaClient();
const USERNAME = `test_horario_${Date.now()}`;
const PASSWORD = 'Prueba#2026';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  — ${detail}` : ''}`);
};
const ok2xx = (r) => r.status >= 200 && r.status < 300;

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, data: json.data };
}

// Hora actual de Lima ± minutos, en "HH:MM"
function limaHHMM(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60_000);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
const limaDay = () => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(new Date())
];

const IN_WINDOW = () => ({ access_start: limaHHMM(-60), access_end: limaHHMM(60), access_days: ALL_DAYS });
const OUT_WINDOW = () => ({ access_start: limaHHMM(60), access_end: limaHHMM(120), access_days: ALL_DAYS });

const webLogin = () => api('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
const mine = (token) => api('GET', '/custom-role/mine', null, token);

function sseFirstEvent(token, timeoutMs) {
  return new Promise((resolve) => {
    const url = new URL(`${BASE}/auth/session-events?token=${encodeURIComponent(token)}`);
    const started = Date.now();
    const req = http.get(url, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        const m = buf.match(/event: (?!ping)(\S+)\n(?:id: .*\n)?data: (.*)\n/);
        if (m) { req.destroy(); resolve({ event: m[1], data: JSON.parse(m[2]), afterMs: Date.now() - started }); }
      });
      res.on('end', () => resolve({ event: '(cerrado)', afterMs: Date.now() - started }));
    });
    req.on('error', () => {});
    setTimeout(() => { req.destroy(); resolve({ event: '(timeout)', afterMs: timeoutMs }); }, timeoutMs);
  });
}

function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    sign: (m) => crypto.sign('sha256', Buffer.from(m), { key: privateKey, dsaEncoding: 'der' }).toString('base64'),
  };
}
const challenge = async (purpose) => (await api('POST', '/auth/device/challenge', { username: USERNAME, purpose })).data;

async function main() {
  const role = await prisma.customRole.findFirst({ where: { deleted_at: null, NOT: { system_slug: 'SUPERADMIN' } }, select: { id: true } });
  const admin = await prisma.user.findFirst({ where: { deleted_at: null, custom_role: { system_slug: 'SUPERADMIN' } }, select: { id: true } });
  const user = await prisma.user.create({
    data: { username: USERNAME, password: bcrypt.hashSync(PASSWORD, 10), name: 'Prueba', lastname: 'Horario', custom_role_id: role.id, max_sessions: 3 },
  });
  const adminSession = await prisma.userSession.create({ data: { user_id: admin.id, user_agent: 'test-access-schedule' } });
  const adminToken = jwt.sign({ sub: admin.id, sid: adminSession.id }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const patch = (body) => api('PATCH', `/user/${user.id}`, body, adminToken);
  const setDb = (data) => prisma.user.update({ where: { id: user.id }, data });
  console.log(`Usuario temporal: ${USERNAME} · hora Lima ${limaHHMM()} · día ${limaDay()}\n`);

  try {
    // ---------- Validaciones del admin ----------
    check('Solo hora de inicio → 400', (await patch({ access_start: '07:00' })).status === 400);
    check('Inicio igual a fin → 400', (await patch({ access_start: '07:00', access_end: '07:00', access_days: [1] })).status === 400);
    check('Sin días → 400', (await patch({ access_start: '07:00', access_end: '14:00', access_days: [] })).status === 400);
    check('Formato inválido "7:00" → 400', (await patch({ access_start: '7:00', access_end: '14:00', access_days: [1] })).status === 400);
    check('Día 8 → 400', (await patch({ access_start: '07:00', access_end: '14:00', access_days: [8] })).status === 400);

    // ---------- Login fuera / dentro de horario ----------
    const out = OUT_WINDOW();
    const p1 = await patch(out);
    check('Guardar horario fuera de la hora actual → 200', ok2xx(p1), `${out.access_start}-${out.access_end}`);
    check('El usuario devuelve el horario', p1.data?.access_start === out.access_start && p1.data?.access_days?.length === 7);
    const l1 = await webLogin();
    check('Login fuera de horario → 403 OUT_OF_SCHEDULE', l1.status === 403 && l1.body.code === 'OUT_OF_SCHEDULE', l1.body.message);

    const crossesMidnight = limaHHMM(60) <= limaHHMM(-60);
    if (!crossesMidnight) {
      const notToday = ALL_DAYS.filter((d) => d !== limaDay());
      await patch({ ...IN_WINDOW(), access_days: notToday });
      const l2 = await webLogin();
      check('Hora correcta pero día no permitido → 403', l2.status === 403 && l2.body.code === 'OUT_OF_SCHEDULE');
    }

    await patch(IN_WINDOW());
    const l3 = await webLogin();
    check('Login dentro de horario → 2xx', ok2xx(l3), `status ${l3.status}`);
    const t3 = l3.data?.token;
    check('Petición con token dentro de horario → 200', (await mine(t3)).status === 200);

    // ---------- Admin cambia el horario con el usuario conectado ----------
    const sse1 = sseFirstEvent(t3, 10_000);
    await new Promise((r) => setTimeout(r, 500));
    await patch(OUT_WINDOW());
    const e1 = await sse1;
    check('Al guardar un horario que excluye la hora actual, SSE avisa OUT_OF_SCHEDULE', e1.event === 'session-ended' && e1.data?.code === 'OUT_OF_SCHEDULE', `${e1.event} en ${e1.afterMs} ms`);
    const m1 = await mine(t3);
    check('Ese token ya no sirve → 401 OUT_OF_SCHEDULE', m1.status === 401 && m1.body.code === 'OUT_OF_SCHEDULE');

    // ---------- Fin de horario sin SSE: se corta en la siguiente petición ----------
    await patch(IN_WINDOW());
    const t4 = (await webLogin()).data?.token;
    await setDb(OUT_WINDOW()); // simula que llegó la hora de fin
    const m2 = await mine(t4);
    check('Siguiente petición tras fin de horario → 401 OUT_OF_SCHEDULE', m2.status === 401 && m2.body.code === 'OUT_OF_SCHEDULE', m2.body.message);
    await setDb(IN_WINDOW());
    const m3 = await mine(t4);
    check('La sesión quedó cerrada aunque vuelva a estar en horario → 401', m3.status === 401);

    // ---------- Fin de horario con SSE: revisión automática ----------
    const t5 = (await webLogin()).data?.token;
    const sse2 = sseFirstEvent(t5, 40_000);
    await new Promise((r) => setTimeout(r, 500));
    await setDb(OUT_WINDOW());
    const e2 = await sse2;
    check('Revisión automática cierra la sesión conectada (≤ 30 s)', e2.event === 'session-ended' && e2.data?.code === 'OUT_OF_SCHEDULE', `${e2.event} en ${(e2.afterMs / 1000).toFixed(1)} s`);

    // ---------- App móvil ----------
    await setDb({ ...IN_WINDOW(), mobile_only: true, max_sessions: 1 });
    const dev = newDevice();
    const ch = await challenge('login');
    const ml = await api('POST', '/auth/login', {
      username: USERNAME, password: PASSWORD,
      device: { challenge_id: ch.challenge_id, signature: dev.sign(ch.message), public_key: dev.publicKey, device_name: 'Celular de prueba' },
    });
    check('App: login dentro de horario → 2xx', ok2xx(ml), `status ${ml.status} ${ml.body.code ?? ''}`);
    await setDb(OUT_WINDOW());
    const rch = await challenge('refresh');
    const rf = await api('POST', '/auth/refresh', { refresh_token: ml.data?.refresh_token, challenge_id: rch.challenge_id, signature: dev.sign(rch.message) });
    check('App: renovar token fuera de horario → 401 OUT_OF_SCHEDULE', rf.status === 401 && rf.body.code === 'OUT_OF_SCHEDULE');
    const ch2 = await challenge('login');
    const ml2 = await api('POST', '/auth/login', {
      username: USERNAME, password: PASSWORD,
      device: { challenge_id: ch2.challenge_id, signature: dev.sign(ch2.message), device_name: 'Celular de prueba' },
    });
    check('App: login fuera de horario → 403 OUT_OF_SCHEDULE', ml2.status === 403 && ml2.body.code === 'OUT_OF_SCHEDULE');
    await setDb({ mobile_only: false, device_public_key: null, device_info: null, device_bound_at: null });

    // ---------- Quitar el horario ----------
    const p9 = await patch({ access_start: null, access_end: null, access_days: [] });
    check('Quitar horario → 200 y queda sin restricción', ok2xx(p9) && p9.data?.access_start === null && p9.data?.access_days?.length === 0);
    check('Sin horario vuelve a entrar → 2xx', ok2xx(await webLogin()));
  } finally {
    await prisma.auditLog.deleteMany({ where: { entity_id: user.id } });
    await prisma.deviceChallenge.deleteMany({ where: { username: USERNAME } });
    await prisma.user.delete({ where: { id: user.id } });
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
