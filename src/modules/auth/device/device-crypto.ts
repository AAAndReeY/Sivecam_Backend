import { createHash, createPublicKey, KeyObject, randomBytes, verify } from 'crypto';

/**
 * Criptografía de la vinculación de dispositivo.
 * La app genera un par ECDSA P-256 en el Keystore de Android (o Secure Enclave de iOS),
 * envía la llave pública al vincular y firma con SHA-256 el mensaje del reto.
 */

export const CHALLENGE_PURPOSES = ['login', 'refresh'] as const;
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number];

// Mensaje exacto que firma la app. Incluye el propósito y el usuario para que una
// firma de un reto no sirva para otro uso ni para otra cuenta.
export const challengeMessage = (purpose: ChallengePurpose, username: string, nonce: string) =>
  `sivecam-device|${purpose}|${username}|${nonce}`;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Acepta la llave pública en base64 como:
 *  - SPKI DER (Android: PublicKey.getEncoded())
 *  - Punto sin comprimir X9.63 de 65 bytes (iOS: SecKeyCopyExternalRepresentation)
 * Devuelve la llave normalizada a SPKI DER base64, o null si no es una llave P-256 válida.
 */
export function normalizePublicKey(input: string): string | null {
  try {
    const raw = Buffer.from(input, 'base64');
    let key: KeyObject;
    if (raw.length === 65 && raw[0] === 0x04) {
      key = createPublicKey({
        key: {
          kty: 'EC',
          crv: 'P-256',
          x: raw.subarray(1, 33).toString('base64url'),
          y: raw.subarray(33, 65).toString('base64url'),
        },
        format: 'jwk',
      });
    } else {
      key = createPublicKey({ key: raw, format: 'der', type: 'spki' });
    }
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return (key.export({ format: 'der', type: 'spki' }) as Buffer).toString('base64');
  } catch {
    return null;
  }
}

// Verifica una firma ECDSA (DER, base64) sobre `message` con la llave SPKI base64
export function verifySignature(publicKeySpki: string, message: string, signatureB64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpki, 'base64'), format: 'der', type: 'spki' });
    return verify('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'der' }, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
