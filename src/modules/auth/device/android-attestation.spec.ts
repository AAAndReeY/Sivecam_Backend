import 'reflect-metadata';
import { createHash, webcrypto } from 'crypto';
import * as x509 from '@peculiar/x509';
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import {
  AttestationApplicationId,
  AttestationPackageInfo,
  AuthorizationList,
  KeyDescription,
  RootOfTrust,
  SecurityLevel,
  VerifiedBootState,
  id_ce_keyDescription,
} from '@peculiar/asn1-android';
import { AttestationPolicy, rootsToSpki, verifyAndroidAttestation } from './android-attestation';
import { GOOGLE_ATTESTATION_ROOTS_PEM } from './google-attestation-roots';

/**
 * El hardware real firma la cadena con una raíz de Google, imposible de reproducir aquí.
 * Estas pruebas arman cadenas con una raíz de PRUEBA (inyectada en la política) para
 * verificar cada regla del verificador. La prueba con una cadena real se hace con el APK.
 */

x509.cryptoProvider.set(webcrypto as any);
const ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
const PACKAGE = 'pe.gob.sjl.sivecam';
const APK_CERT = Buffer.from('certificado-de-firma-del-apk');
const APK_DIGEST = createHash('sha256').update(APK_CERT).digest('hex');
const NONCE = 'nonce-del-reto-123';

type LeafOptions = {
  challenge?: string;
  securityLevel?: SecurityLevel;
  packageName?: string;
  signatureDigest?: Buffer;
  deviceLocked?: boolean;
  bootState?: VerifiedBootState;
  withAppId?: boolean;
  withExtension?: boolean;
};

const gen = () => webcrypto.subtle.generateKey(ALG, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64');
const spkiB64 = async (key: CryptoKey) => b64(await webcrypto.subtle.exportKey('spki', key));
const years = (n: number) => new Date(Date.now() + n * 365 * 24 * 3600 * 1000);

function keyDescription(o: LeafOptions) {
  const appId = new AttestationApplicationId({
    packageInfos: [new AttestationPackageInfo({ packageName: new OctetString(Buffer.from(o.packageName ?? PACKAGE)), version: 1 })],
    signatureDigests: [new OctetString(o.signatureDigest ?? createHash('sha256').update(APK_CERT).digest())],
  });
  const level = o.securityLevel ?? SecurityLevel.trustedEnvironment;
  return new KeyDescription({
    attestationVersion: 4,
    attestationSecurityLevel: level,
    keymasterVersion: 4,
    keymasterSecurityLevel: level,
    attestationChallenge: new OctetString(Buffer.from(o.challenge ?? NONCE)),
    uniqueId: new OctetString(0),
    softwareEnforced: new AuthorizationList(
      o.withAppId === false ? {} : { attestationApplicationId: new OctetString(AsnConvert.serialize(appId)) },
    ),
    teeEnforced: new AuthorizationList({
      rootOfTrust: new RootOfTrust({
        verifiedBootKey: new OctetString(32),
        deviceLocked: o.deviceLocked ?? true,
        verifiedBootState: o.bootState ?? VerifiedBootState.verified,
        verifiedBootHash: new OctetString(32),
      }),
    }),
  });
}

async function buildChain(o: LeafOptions = {}) {
  const [rootKeys, interKeys, deviceKeys] = await Promise.all([gen(), gen(), gen()]);
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Raiz de prueba',
    notBefore: years(-1),
    notAfter: years(10),
    signingAlgorithm: ALG,
    keys: rootKeys,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const inter = await x509.X509CertificateGenerator.create({
    serialNumber: '02',
    subject: 'CN=Intermedio de prueba',
    issuer: root.subject,
    notBefore: years(-1),
    notAfter: years(5),
    signingAlgorithm: ALG,
    publicKey: interKeys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '0a0b',
    subject: 'CN=Android Keystore Key',
    issuer: inter.subject,
    notBefore: years(-1),
    notAfter: years(1),
    signingAlgorithm: ALG,
    publicKey: deviceKeys.publicKey,
    signingKey: interKeys.privateKey,
    extensions:
      o.withExtension === false
        ? []
        : [new x509.Extension(id_ce_keyDescription, false, AsnConvert.serialize(keyDescription(o)))],
  });
  return {
    chain: [leaf, inter, root].map((c) => b64(c.rawData)),
    rootSpki: Buffer.from(root.publicKey.rawData),
    devicePublicKey: await spkiB64(deviceKeys.publicKey),
  };
}

const policyFor = (built: Awaited<ReturnType<typeof buildChain>>, over: Partial<AttestationPolicy> = {}): AttestationPolicy => ({
  expectedChallenge: NONCE,
  expectedPublicKey: built.devicePublicKey,
  packageName: PACKAGE,
  signatureDigests: [APK_DIGEST],
  trustedRoots: [built.rootSpki],
  requireLockedBootloader: true,
  ...over,
});

const reasonOf = (fn: () => unknown) => {
  try {
    fn();
    return 'OK';
  } catch (e: any) {
    return e.reason ?? e.message;
  }
};

describe('verifyAndroidAttestation', () => {
  it('acepta una cadena válida (TEE)', async () => {
    const built = await buildChain();
    const result = verifyAndroidAttestation(built.chain, policyFor(built));
    expect(result).toMatchObject({ securityLevel: 'TEE', deviceLocked: true, verifiedBootState: 0 });
  });

  it('acepta StrongBox e informa el nivel', async () => {
    const built = await buildChain({ securityLevel: SecurityLevel.strongBox });
    expect(verifyAndroidAttestation(built.chain, policyFor(built)).securityLevel).toBe('StrongBox');
  });

  it('acepta el digest de firma con dos puntos y en mayúsculas (formato de eas credentials)', async () => {
    const built = await buildChain();
    const pretty = APK_DIGEST.toUpperCase().match(/.{2}/g)!.join(':');
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built, { signatureDigests: [pretty] })))).toBe('OK');
  });

  it('rechaza una raíz que no es de Google (script / emulador)', async () => {
    const built = await buildChain();
    const policy = policyFor(built, { trustedRoots: rootsToSpki(GOOGLE_ATTESTATION_ROOTS_PEM) });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policy))).toBe('ATTESTATION_UNTRUSTED');
  });

  it('rechaza una cadena con un eslabón de otra cadena', async () => {
    const a = await buildChain();
    const b = await buildChain();
    const mixed = [a.chain[0], b.chain[1], b.chain[2]];
    expect(reasonOf(() => verifyAndroidAttestation(mixed, policyFor(a, { trustedRoots: [b.rootSpki] })))).toBe('ATTESTATION_CHAIN');
  });

  it('rechaza una cadena demasiado corta', async () => {
    const built = await buildChain();
    expect(reasonOf(() => verifyAndroidAttestation([built.chain[0]], policyFor(built)))).toBe('ATTESTATION_CHAIN');
  });

  it('rechaza si la attestation es de otra llave', async () => {
    const built = await buildChain();
    const other = await buildChain();
    const policy = policyFor(built, { expectedPublicKey: other.devicePublicKey });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policy))).toBe('ATTESTATION_KEY_MISMATCH');
  });

  it('rechaza una llave generada para otro reto (replay)', async () => {
    const built = await buildChain({ challenge: 'reto-viejo' });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_CHALLENGE');
  });

  it('rechaza llaves por software', async () => {
    const built = await buildChain({ securityLevel: SecurityLevel.software });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_SOFTWARE');
  });

  it('rechaza otra app (paquete distinto)', async () => {
    const built = await buildChain({ packageName: 'com.otra.app' });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_APP');
  });

  it('rechaza nuestra app re-firmada con otro certificado', async () => {
    const built = await buildChain({ signatureDigest: createHash('sha256').update('otro-certificado').digest() });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_APP');
  });

  it('sin digests configurados solo verifica el paquete', async () => {
    const built = await buildChain({ signatureDigest: createHash('sha256').update('otro-certificado').digest() });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built, { signatureDigests: [] })))).toBe('OK');
  });

  it('rechaza si no identifica a la app', async () => {
    const built = await buildChain({ withAppId: false });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_APP');
  });

  it('rechaza un certificado sin extensión de attestation', async () => {
    const built = await buildChain({ withExtension: false });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_INVALID');
  });

  it('rechaza bootloader desbloqueado', async () => {
    const built = await buildChain({ deviceLocked: false, bootState: VerifiedBootState.unverified });
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policyFor(built)))).toBe('ATTESTATION_BOOTLOADER');
  });

  it('permite bootloader desbloqueado si la política lo relaja', async () => {
    const built = await buildChain({ deviceLocked: false, bootState: VerifiedBootState.unverified });
    const result = verifyAndroidAttestation(built.chain, policyFor(built, { requireLockedBootloader: false }));
    expect(result.deviceLocked).toBe(false);
  });

  it('rechaza certificados revocados por Google', async () => {
    const built = await buildChain();
    const policy = policyFor(built, { revokedSerials: new Set(['a0b']) }); // serial 0a0b normalizado
    expect(reasonOf(() => verifyAndroidAttestation(built.chain, policy))).toBe('ATTESTATION_REVOKED');
  });

  it('carga las 2 raíces oficiales de Google', () => {
    expect(rootsToSpki(GOOGLE_ATTESTATION_ROOTS_PEM)).toHaveLength(2);
  });
});
