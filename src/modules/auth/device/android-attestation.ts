import { X509Certificate } from 'crypto';
import * as https from 'https';
import { AsnConvert } from '@peculiar/asn1-schema';
import { Certificate } from '@peculiar/asn1-x509';
import {
  AttestationApplicationId,
  NonStandardKeyDescription,
  SecurityLevel,
  id_ce_keyDescription,
} from '@peculiar/asn1-android';

/**
 * Verificación de Android Key Attestation.
 * La app genera la llave en el Keystore pasando el nonce del reto como "attestation
 * challenge". El hardware del celular emite una cadena de certificados que termina en
 * una raíz de Google y cuya hoja describe la llave: reto, nivel de seguridad (TEE /
 * StrongBox), app que la creó (paquete + firma del APK) y estado del arranque.
 * Con esto un script o un navegador no pueden hacerse pasar por la app.
 */

export class AttestationError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
  }
}

export type AttestationPolicy = {
  /** Nonce del reto: debe coincidir con el attestation challenge de la llave */
  expectedChallenge: string;
  /** Llave pública (SPKI DER base64) que la app dice tener */
  expectedPublicKey: string;
  /** Paquete de la app (ej. pe.gob.sjl.sivecam) */
  packageName: string;
  /** SHA-256 (hex) de los certificados de firma del APK permitidos. Vacío = no se verifica. */
  signatureDigests: string[];
  /** Llaves públicas raíz de confianza (SPKI DER) */
  trustedRoots: Buffer[];
  /** Rechazar celulares con bootloader desbloqueado o arranque no verificado */
  requireLockedBootloader: boolean;
  /** Números de serie revocados (hex en minúscula, sin ceros a la izquierda) */
  revokedSerials?: Set<string>;
};

export type AttestationResult = {
  securityLevel: 'TEE' | 'StrongBox';
  attestationVersion: number;
  deviceLocked: boolean | null;
  verifiedBootState: number | null;
};

const VERIFIED_BOOT_STATE_VERIFIED = 0;

const spki = (cert: X509Certificate) => cert.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
const normSerial = (hex: string) => hex.toLowerCase().replace(/^0+/, '');
const normDigest = (hex: string) => hex.toLowerCase().replace(/[^0-9a-f]/g, '');

export const rootsToSpki = (pems: string[]) => pems.map((pem) => spki(new X509Certificate(pem)));

function parseChain(chainB64: string[]): { certs: X509Certificate[]; ders: Buffer[] } {
  if (!Array.isArray(chainB64) || chainB64.length < 2 || chainB64.length > 10)
    throw new AttestationError('ATTESTATION_CHAIN', 'Cadena de attestation inválida');
  try {
    const ders = chainB64.map((c) => Buffer.from(c, 'base64'));
    return { certs: ders.map((d) => new X509Certificate(d)), ders };
  } catch {
    throw new AttestationError('ATTESTATION_CHAIN', 'Certificados de attestation ilegibles');
  }
}

function readKeyDescription(der: Buffer): NonStandardKeyDescription | null {
  const cert = AsnConvert.parse(der, Certificate);
  const ext = cert.tbsCertificate.extensions?.find((e) => e.extnID === id_ce_keyDescription);
  if (!ext) return null;
  return AsnConvert.parse(toBuf(ext.extnValue), NonStandardKeyDescription);
}

// Al parsear, la librería entrega los OCTET STRING como ArrayBuffer (aunque el tipo diga
// OctetString): se aceptan ambas formas
const toBuf = (v: unknown): Buffer => {
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  const inner = (v as { buffer?: ArrayBuffer } | null)?.buffer;
  return inner ? Buffer.from(inner) : Buffer.alloc(0);
};

export function verifyAndroidAttestation(chainB64: string[], policy: AttestationPolicy, now = new Date()): AttestationResult {
  const { certs, ders } = parseChain(chainB64);

  // 1. Cada certificado está firmado por el siguiente
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey))
      throw new AttestationError('ATTESTATION_CHAIN', 'La cadena de attestation no está correctamente firmada');
    // La hoja de algunos fabricantes trae fechas fuera de rango: solo se validan los intermedios
    if (i > 0 && (new Date(certs[i].validFrom) > now || new Date(certs[i].validTo) < now))
      throw new AttestationError('ATTESTATION_CHAIN', 'Un certificado intermedio de attestation está vencido');
  }

  // 2. Termina en una raíz de Google (se compara la llave pública: Google reemite raíces con la misma llave)
  const root = certs[certs.length - 1];
  if (!root.verify(root.publicKey) || !policy.trustedRoots.some((r) => Buffer.compare(r, spki(root)) === 0))
    throw new AttestationError('ATTESTATION_UNTRUSTED', 'La attestation no proviene de un Android con hardware seguro reconocido');

  // 3. Ningún certificado de la cadena está revocado por Google
  if (policy.revokedSerials?.size) {
    for (const c of certs) {
      if (policy.revokedSerials.has(normSerial(c.serialNumber)))
        throw new AttestationError('ATTESTATION_REVOKED', 'El hardware de seguridad de este celular fue revocado por Google');
    }
  }

  // 4. La hoja describe exactamente la llave que la app presentó
  const leaf = certs[0];
  if (Buffer.compare(spki(leaf), Buffer.from(policy.expectedPublicKey, 'base64')) !== 0)
    throw new AttestationError('ATTESTATION_KEY_MISMATCH', 'La attestation corresponde a otra llave');

  let desc: NonStandardKeyDescription | null;
  try {
    desc = readKeyDescription(ders[0]);
  } catch {
    throw new AttestationError('ATTESTATION_INVALID', 'No se pudo leer la descripción de la llave');
  }
  if (!desc) throw new AttestationError('ATTESTATION_INVALID', 'El certificado no contiene datos de attestation');

  // 5. Llave nueva generada para ESTE reto
  if (!toBuf(desc.attestationChallenge).equals(Buffer.from(policy.expectedChallenge, 'utf8')))
    throw new AttestationError('ATTESTATION_CHALLENGE', 'La attestation no corresponde a este reto');

  // 6. Llave en hardware (TEE o StrongBox), no emulada por software
  const level = Math.min(desc.attestationSecurityLevel, desc.keymasterSecurityLevel);
  if (level < SecurityLevel.trustedEnvironment)
    throw new AttestationError('ATTESTATION_SOFTWARE', 'La llave no está protegida por hardware (emulador o celular no compatible)');

  // 7. La creó NUESTRA app (paquete + firma del APK), dato que pone el sistema operativo
  const appIdRaw =
    desc.softwareEnforced.findProperty('attestationApplicationId') ??
    desc.teeEnforced.findProperty('attestationApplicationId');
  if (!appIdRaw) throw new AttestationError('ATTESTATION_APP', 'La attestation no identifica a la app');
  const appId = AsnConvert.parse(toBuf(appIdRaw), AttestationApplicationId);
  const packages = appId.packageInfos.map((p) => toBuf(p.packageName).toString('utf8'));
  if (!packages.includes(policy.packageName))
    throw new AttestationError('ATTESTATION_APP', 'La llave no fue creada por la app SIVECAM');
  const allowed = policy.signatureDigests.map(normDigest).filter(Boolean);
  if (allowed.length) {
    const digests = appId.signatureDigests.map((d) => toBuf(d).toString('hex'));
    if (!digests.some((d) => allowed.includes(d)))
      throw new AttestationError('ATTESTATION_APP', 'La app no está firmada con el certificado oficial');
  }

  // 8. Arranque verificado y bootloader bloqueado (celular no modificado)
  const rot = desc.teeEnforced.findProperty('rootOfTrust');
  const deviceLocked = rot ? rot.deviceLocked : null;
  const verifiedBootState = rot ? Number(rot.verifiedBootState) : null;
  if (policy.requireLockedBootloader && (deviceLocked !== true || verifiedBootState !== VERIFIED_BOOT_STATE_VERIFIED))
    throw new AttestationError('ATTESTATION_BOOTLOADER', 'El celular tiene el sistema modificado (bootloader desbloqueado o arranque no verificado)');

  return {
    securityLevel: level === SecurityLevel.strongBox ? 'StrongBox' : 'TEE',
    attestationVersion: Number(desc.attestationVersion),
    deviceLocked,
    verifiedBootState,
  };
}

// Lista de revocación de Google (se cachea 12 h; si no se puede descargar se usa la última)
const STATUS_URL = 'https://android.googleapis.com/attestation/status';
let revokedCache: { serials: Set<string>; fetchedAt: number } | null = null;

export async function getRevokedSerials(timeoutMs = 8000): Promise<Set<string> | undefined> {
  if (revokedCache && Date.now() - revokedCache.fetchedAt < 12 * 3600 * 1000) return revokedCache.serials;
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = https.get(STATUS_URL, { agent: false }, (res) => {
        if ((res.statusCode ?? 0) >= 300) return reject(new Error(`status ${res.statusCode}`));
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    });
    const entries = JSON.parse(body)?.entries ?? {};
    revokedCache = { serials: new Set(Object.keys(entries).map(normSerial)), fetchedAt: Date.now() };
  } catch (e) {
    console.warn('No se pudo descargar la lista de revocación de attestation:', (e as Error).message);
  }
  return revokedCache?.serials;
}
