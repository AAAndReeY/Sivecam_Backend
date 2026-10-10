import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  MessageEvent,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, map, merge, of, take, takeUntil, timer } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceChallengeDto, DeviceProofDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtPayload } from './interfaces';
import { timezoneHelper } from '../../common/helpers';
import { AuditService } from '../audit/audit.service';
import {
  REFRESH_REUSED,
  REVOKE_MESSAGES,
  SESSION_REPLACED,
  SessionEventsService,
} from '../session-events';
import {
  ChallengePurpose,
  challengeMessage,
  normalizePublicKey,
  randomToken,
  sha256Hex,
  verifySignature,
} from './device/device-crypto';
import {
  AttestationError,
  AttestationResult,
  getRevokedSerials,
  rootsToSpki,
  verifyAndroidAttestation,
} from './device/android-attestation';
import { GOOGLE_ATTESTATION_ROOTS_PEM } from './device/google-attestation-roots';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;

// Códigos que la app/web reciben en el cuerpo del error para mostrar el mensaje adecuado
const deviceError = (Exception: new (body: any) => HttpException, status: number, code: string, message: string) =>
  new Exception({ statusCode: status, code, message });

const MOBILE_ONLY_MSG = 'Este usuario solo puede ingresar desde la app móvil autorizada';

@Injectable()
export class AuthService {
  private readonly mobileAccessTtl: string;
  private readonly mobileRefreshTtlDays: number;
  private readonly attestation: {
    required: boolean;
    packageName: string;
    signatureDigests: string[];
    requireLockedBootloader: boolean;
    trustedRoots: Buffer[];
  };

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private sessionChannel: SessionEventsService,
    private audit: AuditService,
    config: ConfigService,
  ) {
    this.mobileAccessTtl = config.get<string>('MOBILE_ACCESS_TOKEN_TTL') || '15m';
    this.mobileRefreshTtlDays = Number(config.get('MOBILE_REFRESH_TTL_DAYS')) || 30;
    this.attestation = {
      // 'off' solo para pruebas locales sin celular real
      required: (config.get<string>('DEVICE_ATTESTATION') || 'required') !== 'off',
      packageName: config.get<string>('ANDROID_PACKAGE_NAME') || 'pe.gob.sjl.sivecam',
      signatureDigests: (config.get<string>('ANDROID_SIGNING_CERT_SHA256') ?? '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
      requireLockedBootloader: config.get<string>('ATTESTATION_REQUIRE_LOCKED_BOOTLOADER') !== 'false',
      trustedRoots: rootsToSpki(GOOGLE_ATTESTATION_ROOTS_PEM),
    };
    const log = new Logger('DeviceAttestation');
    if (!this.attestation.required)
      log.warn('DEVICE_ATTESTATION=off: la vinculación de celulares no exige Key Attestation');
    else if (!this.attestation.signatureDigests.length)
      log.warn('ANDROID_SIGNING_CERT_SHA256 vacío: no se verifica la firma del APK en la attestation');
  }

  async login(dto: LoginDto, meta: { user_agent?: string; ip?: string } = {}) {
    const { username, password } = dto;
    const user = await this.prisma.user.findUnique({
      where: { username, deleted_at: null },
      select: {
        id: true,
        username: true,
        password: true,
        max_sessions: true,
        mobile_only: true,
        device_public_key: true,
        custom_role_id: true,
        custom_role: { select: { name: true, system_slug: true } },
      },
    });
    if (!user || !(await bcrypt.compare(password, user.password)))
      throw new UnauthorizedException('Credenciales inválidas');
    const { id } = user;

    // Usuarios "solo app móvil": además de la contraseña, deben firmar el reto con la
    // llave del celular vinculado (la web no tiene esa llave y queda rechazada)
    if (user.mobile_only) {
      if (!dto.device)
        throw deviceError(ForbiddenException, 403, 'MOBILE_ONLY', MOBILE_ONLY_MSG);
      await this.verifyDeviceForLogin(user, dto.device);
    }
    const isMobile = user.mobile_only;

    const refreshSecret = isMobile ? randomToken() : null;
    const refreshExpires = timezoneHelper();
    refreshExpires.setUTCDate(refreshExpires.getUTCDate() + this.mobileRefreshTtlDays);

    const session = await this.prisma.userSession.create({
      data: {
        user_id: id,
        user_agent: meta.user_agent?.slice(0, 255) ?? null,
        ip: meta.ip ?? null,
        created_at: timezoneHelper(),
        is_mobile: isMobile,
        refresh_token_hash: refreshSecret ? sha256Hex(refreshSecret) : null,
        refresh_expires_at: refreshSecret ? refreshExpires : null,
      },
    });
    const token = await this.getJwtToken({ sub: id, sid: session.id }, isMobile);
    await this.prisma.user.update({
      data: { token, updated_at: timezoneHelper() },
      where: { id },
    });
    // Un usuario solo móvil tiene una única sesión activa, sin importar max_sessions
    await this.sessionChannel.enforceSessionLimit(id, isMobile ? 1 : user.max_sessions, SESSION_REPLACED, session.id);
    await this.cleanupRevokedSessions(id);
    return {
      user:             username,
      rol:              user.custom_role?.system_slug ?? null,
      custom_role_id:   user.custom_role_id,
      custom_role_name: user.custom_role?.name ?? null,
      token,
      ...(refreshSecret && {
        refresh_token: `${session.id}.${refreshSecret}`,
        expires_in:    this.secondsToExpire(token),
      }),
    };
  }

  // Reto de un solo uso que la app debe firmar. No revela si el usuario existe.
  async createChallenge(dto: DeviceChallengeDto) {
    const now = timezoneHelper();
    await this.prisma.deviceChallenge.deleteMany({ where: { expires_at: { lt: now } } });
    const challenge = await this.prisma.deviceChallenge.create({
      data: {
        username: dto.username,
        purpose: dto.purpose,
        nonce: randomToken(),
        expires_at: new Date(now.getTime() + CHALLENGE_TTL_MS),
        created_at: now,
      },
    });
    return {
      challenge_id: challenge.id,
      nonce:        challenge.nonce,
      // Texto exacto a firmar (ECDSA P-256 / SHA-256), para que la app no lo arme a mano
      message:      challengeMessage(dto.purpose, dto.username, challenge.nonce),
      expires_in:   CHALLENGE_TTL_MS / 1000,
    };
  }

  // Renueva el access token de una sesión móvil: exige el refresh token y una firma nueva
  // del dispositivo, así un token robado no se puede renovar fuera del celular vinculado.
  async refresh(dto: RefreshTokenDto) {
    const ended = (code = 'SESSION_ENDED', message = 'Sesión finalizada, vuelva a ingresar') =>
      deviceError(UnauthorizedException, 401, code, message);

    const [sid, secret] = dto.refresh_token.split('.');
    if (!sid || !secret) throw ended();
    const session = await this.prisma.userSession.findUnique({
      where: { id: sid },
      select: {
        id: true,
        user_id: true,
        is_mobile: true,
        revoked_at: true,
        revoked_reason: true,
        refresh_token_hash: true,
        refresh_expires_at: true,
        user: { select: { username: true, deleted_at: true, mobile_only: true, device_public_key: true } },
      },
    });
    if (!session || !session.is_mobile || !session.refresh_token_hash) throw ended();
    if (session.revoked_at) {
      const reason = session.revoked_reason ?? 'SESSION_ENDED';
      throw ended(reason, REVOKE_MESSAGES[reason] ?? 'Sesión finalizada, vuelva a ingresar');
    }
    const secretHash = sha256Hex(secret);
    if (secretHash !== session.refresh_token_hash) {
      // Refresh token ya rotado: alguien está reusando uno viejo (posible robo)
      await this.sessionChannel.revokeSessions([session.id], REFRESH_REUSED);
      throw ended(REFRESH_REUSED, REVOKE_MESSAGES[REFRESH_REUSED]);
    }
    if (!session.refresh_expires_at || session.refresh_expires_at < timezoneHelper())
      throw ended('SESSION_EXPIRED', 'Tu sesión expiró, vuelve a ingresar');
    const { user } = session;
    if (user.deleted_at || !user.mobile_only || !user.device_public_key) throw ended();

    const nonce = await this.consumeChallenge(dto.challenge_id, user.username, 'refresh');
    if (!verifySignature(user.device_public_key, challengeMessage('refresh', user.username, nonce), dto.signature))
      throw deviceError(UnauthorizedException, 401, 'INVALID_SIGNATURE', 'La firma del dispositivo no es válida');

    // Rotación atómica: si otra petición ya rotó este refresh, esta no hace nada
    const newSecret = randomToken();
    const rotated = await this.prisma.userSession.updateMany({
      where: { id: session.id, refresh_token_hash: secretHash, revoked_at: null },
      data: { refresh_token_hash: sha256Hex(newSecret) },
    });
    if (rotated.count !== 1) throw ended();

    const token = await this.getJwtToken({ sub: session.user_id, sid: session.id }, true);
    await this.prisma.user.update({
      data: { token, updated_at: timezoneHelper() },
      where: { id: session.user_id },
    });
    return {
      token,
      refresh_token: `${session.id}.${newSecret}`,
      expires_in:    this.secondsToExpire(token),
    };
  }

  async logout(user: any) {
    const { session_id } = user;
    await this.prisma.userSession.deleteMany({ where: { id: session_id } });
    return { success: true };
  }

  // Canal SSE: el front lo mantiene abierto y recibe 'session-ended' en cuanto otro
  // inicio de sesión revoca esta sesión. EventSource no permite headers, el token va por query.
  // El canal se cierra cuando el token expira ('token-expired'): con un token renovado
  // (refresh) el cliente vuelve a conectarse; si no, la conexión no sobrevive al token.
  async sessionEvents(token: string): Promise<Observable<MessageEvent>> {
    const ended = (code: string, message: string) =>
      of<MessageEvent>({ type: 'session-ended', data: { code, message } });
    let payload: JwtPayload & { exp?: number };
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { exp?: number }>(token ?? '');
    } catch {
      return ended('SESSION_ENDED', 'Sesión finalizada, vuelva a ingresar');
    }
    const session = payload.sid
      ? await this.prisma.userSession.findUnique({
          where: { id: payload.sid },
          select: {
            user_id: true,
            revoked_at: true,
            revoked_reason: true,
            is_mobile: true,
            user: { select: { mobile_only: true } },
          },
        })
      : null;
    if (!session || session.user_id !== payload.sub)
      return ended('SESSION_ENDED', 'Sesión finalizada, vuelva a ingresar');
    if (session.revoked_at) {
      const reason = session.revoked_reason ?? 'SESSION_ENDED';
      return ended(reason, REVOKE_MESSAGES[reason] ?? 'Sesión finalizada, vuelva a ingresar');
    }
    if (session.user.mobile_only && !session.is_mobile)
      return ended('MOBILE_ONLY', MOBILE_ONLY_MSG);

    const stream = this.sessionChannel.subscribe(payload.sid, payload.sub);
    if (!payload.exp) return stream;
    const expired$ = timer(Math.max(0, payload.exp * 1000 - Date.now())).pipe(
      take(1),
      map((): MessageEvent => ({
        type: 'token-expired',
        data: { code: 'TOKEN_EXPIRED', message: 'El token expiró, reconecta con un token renovado' },
      })),
    );
    return merge(stream.pipe(takeUntil(expired$)), expired$);
  }

  private async verifyDeviceForLogin(
    user: { id: string; username: string; device_public_key: string | null },
    device: DeviceProofDto,
  ) {
    const nonce = await this.consumeChallenge(device.challenge_id, user.username, 'login');
    const message = challengeMessage('login', user.username, nonce);
    const invalidSignature = () =>
      deviceError(UnauthorizedException, 401, 'INVALID_SIGNATURE', 'La firma del dispositivo no es válida');
    const mismatch = () =>
      deviceError(
        ForbiddenException,
        403,
        'DEVICE_MISMATCH',
        'Esta cuenta está vinculada a otro dispositivo. Solicita al administrador que restablezca la vinculación.',
      );

    // Ya vinculado: solo vale la firma de la llave registrada
    if (user.device_public_key) {
      if (device.public_key && normalizePublicKey(device.public_key) !== user.device_public_key) throw mismatch();
      if (!verifySignature(user.device_public_key, message, device.signature)) throw mismatch();
      return;
    }

    // Primera vinculación: la app envía su llave pública y demuestra que tiene la privada
    if (!device.public_key)
      throw deviceError(BadRequestException, 400, 'DEVICE_KEY_REQUIRED', 'Falta la llave pública del dispositivo para vincularlo');
    const publicKey = normalizePublicKey(device.public_key);
    if (!publicKey)
      throw deviceError(BadRequestException, 400, 'INVALID_DEVICE_KEY', 'La llave pública del dispositivo no es válida (se espera ECDSA P-256)');
    if (!verifySignature(publicKey, message, device.signature)) throw invalidSignature();
    const attestation = await this.checkAttestation(device.attestation, nonce, publicKey);

    // Atómico: si dos celulares intentan vincularse a la vez, solo gana el primero
    const bound = await this.prisma.user.updateMany({
      where: { id: user.id, device_public_key: null },
      data: {
        device_public_key: publicKey,
        device_info: device.device_name?.slice(0, 150) ?? null,
        device_bound_at: timezoneHelper(),
        updated_at: timezoneHelper(),
      },
    });
    if (bound.count !== 1) {
      const current = await this.prisma.user.findUnique({ where: { id: user.id }, select: { device_public_key: true } });
      if (current?.device_public_key !== publicKey) throw mismatch();
      return;
    }
    await this.audit.log({
      action: 'DEVICE_BOUND',
      entity: 'User',
      entity_id: user.id,
      changes: {
        target_username: user.username,
        device_info: device.device_name ?? null,
        attestation: attestation ?? 'no verificada (DEVICE_ATTESTATION=off)',
      },
      performed_by: user.username,
    });
  }

  // Key Attestation: la llave nueva está en el hardware de un Android real, fue creada por
  // la app oficial para este reto y el celular no está modificado
  private async checkAttestation(chain: string[] | undefined, nonce: string, publicKey: string): Promise<AttestationResult | null> {
    if (!this.attestation.required) return null;
    if (!chain?.length)
      throw deviceError(BadRequestException, 400, 'ATTESTATION_REQUIRED', 'Falta la attestation del dispositivo: usa la app oficial actualizada');
    try {
      return verifyAndroidAttestation(chain, {
        expectedChallenge: nonce,
        expectedPublicKey: publicKey,
        packageName: this.attestation.packageName,
        signatureDigests: this.attestation.signatureDigests,
        trustedRoots: this.attestation.trustedRoots,
        requireLockedBootloader: this.attestation.requireLockedBootloader,
        revokedSerials: await getRevokedSerials(),
      });
    } catch (e) {
      if (e instanceof AttestationError) throw deviceError(ForbiddenException, 403, e.reason, e.message);
      throw e;
    }
  }

  // Marca el reto como usado (un solo intento, válido o no) y devuelve su nonce
  private async consumeChallenge(challenge_id: string, username: string, purpose: ChallengePurpose): Promise<string> {
    const invalid = () =>
      deviceError(UnauthorizedException, 401, 'INVALID_CHALLENGE', 'El reto expiró o ya fue usado, intenta de nuevo');
    const now = timezoneHelper();
    const challenge = await this.prisma.deviceChallenge.findUnique({ where: { id: challenge_id } });
    if (!challenge || challenge.username !== username || challenge.purpose !== purpose) throw invalid();
    const used = await this.prisma.deviceChallenge.updateMany({
      where: { id: challenge_id, used_at: null, expires_at: { gt: now } },
      data: { used_at: now },
    });
    if (used.count !== 1) throw invalid();
    return challenge.nonce;
  }

  // Sesiones revocadas hace más de 7 días ya no sirven para avisar
  private async cleanupRevokedSessions(user_id: string) {
    const limit = timezoneHelper();
    limit.setUTCDate(limit.getUTCDate() - 7);
    await this.prisma.userSession.deleteMany({
      where: { user_id, revoked_at: { lt: limit } },
    });
  }

  private secondsToExpire(token: string): number | undefined {
    const exp = (this.jwtService.decode(token) as { exp?: number } | null)?.exp;
    return exp ? exp - Math.floor(Date.now() / 1000) : undefined;
  }

  // Sesiones móviles usan un access token corto; se renueva con /auth/refresh
  private getJwtToken(payload: JwtPayload, mobile = false) {
    return mobile
      ? this.jwtService.signAsync(payload, { expiresIn: this.mobileAccessTtl as any })
      : this.jwtService.signAsync(payload);
  }
}
