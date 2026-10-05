import { AdminRepository } from '../repositories/admin.repository'
import { PasswordHasher } from './password-hasher'
import { SessionManager, type Session } from './session-manager'
import { validatePassword } from './password-policy'
import { RecoveryAttemptLimiter } from './recovery-attempt-limiter'
import { generateRecoveryCode, normalizeRecoveryCode } from '../../shared/utils/recovery-code'
import type {
  AuthOkDTO,
  AuthResultDTO,
  AuthStatusDTO,
  ChangePasswordDTO,
  LoginAdminDTO,
  SetupAdminDTO
} from '../../shared/dto/auth'
import { AppError } from '../../../electron/main/errorHandler'

// RFC §4.1 auth:* — seluruh guard & validasi di Service (Main = penegak keamanan,
// renderer hanya UX, RFC §1.4/§11.4).
export class AuthService {
  constructor(
    private adminRepository: AdminRepository,
    private passwordHasher: PasswordHasher,
    private sessionManager: SessionManager,
    private recoveryLimiter: RecoveryAttemptLimiter = new RecoveryAttemptLimiter()
  ) {}

  // RFC §4.1 auth:status — needsSetup = tabel Admin kosong; authenticated =
  // session aktif; username dari session (tampilan, bukan kredensial).
  // AUTH-7: session dipulihkan dari DB saat proses baru (restart) via load().
  async status(): Promise<AuthStatusDTO> {
    const count = await this.adminRepository.count()
    const session = await this.ensureLoadedSession()
    return {
      needsSetup: count === 0,
      authenticated: session !== null,
      username: session?.username
    }
  }

  // Session aktif = mirror in-memory, atau dipulihkan dari DB (AUTH-7). TTL absolute
  // ditegakkan di sini: session yang melewati expiresAt selama proses hidup ditutup.
  private async ensureLoadedSession(): Promise<Session | null> {
    const current = this.sessionManager.get()
    if (current) {
      if (current.expiresAt.getTime() <= Date.now()) {
        await this.sessionManager.close()
        return null
      }
      return current
    }
    return this.sessionManager.load()
  }

  // RFC §7 Initial Setup (K5) — hanya sekali, saat count() === 0.
  async setup(input: SetupAdminDTO): Promise<AuthResultDTO> {
    if ((await this.adminRepository.count()) !== 0) {
      throw new AppError(400, 'Conflict', 'Setup admin sudah pernah dilakukan')
    }
    // REV-1: username = trim-only, kapitalisasi dipertahankan saat penyimpanan.
    const username = input.username.trim()
    const policyError = validatePassword(input.password)
    if (policyError) {
      throw new AppError(400, 'Conflict', policyError)
    }
    const passwordHash = await this.passwordHasher.hash(input.password)
    const recoveryCode = generateRecoveryCode()
    const recoveryCodeHash = await this.passwordHasher.hash(normalizeRecoveryCode(recoveryCode))
    const admin = await this.adminRepository.create({
      username,
      passwordHash,
      passwordChangedAt: new Date(),
      recoveryCodeHash,
      recoveryCodeCreatedAt: new Date()
    })
    await this.sessionManager.open(admin)
    await this.adminRepository.updateLastLogin(admin.id)
    return { authenticated: true, username: admin.username, recoveryCode }
  }

  // RFC §8 Login — pesan 401 seragam (anti user-enumeration & timing, §11.2).
  // Opsi B: login TANPA username (password-only). Single-admin di-resolve via
  // findSingle() (RFC §1.2); field username pada input DIIMPANGGAP (dibiarkan
  // opsional di DTO untuk kompatibilitas IPC, namun tidak dipakai).
  async login(input: LoginAdminDTO): Promise<AuthResultDTO> {
    const admin = await this.adminRepository.findSingle()
    if (!admin) {
      throw new AppError(401, 'Unauthorized', 'Username atau password salah')
    }
    const ok = await this.passwordHasher.verify(admin.passwordHash, input.password)
    if (!ok) {
      throw new AppError(401, 'Unauthorized', 'Username atau password salah')
    }
    // Login sukses saat session ada → replace session lama (RFC §3.1).
    await this.sessionManager.open(admin)
    await this.adminRepository.updateLastLogin(admin.id)
    return { authenticated: true, username: admin.username }
  }

  // RFC §9 Logout — idempoten; tanpa session tetap { ok: true } (RFC §9).
  async logout(): Promise<AuthOkDTO> {
    await this.sessionManager.close()
    return { ok: true }
  }

  // RFC §10 Change Password — guard session aktif; session TETAP aktif (AUTH-6).
  // AUTH-7: session dipulihkan dari DB bila proses baru (restart) sebelum status() dipanggil.
  async changePassword(input: ChangePasswordDTO): Promise<AuthOkDTO> {
    const session = await this.ensureLoadedSession()
    if (!session) {
      throw new AppError(401, 'Unauthorized', 'Sesi tidak aktif')
    }
    const admin = await this.adminRepository.findById(session.adminId)
    if (!admin) {
      throw new AppError(401, 'Unauthorized', 'Sesi tidak aktif')
    }
    // REV-4: password lama hanya diverifikasi (Argon2id hash), tidak pernah
    // dapat ditampilkan kembali.
    const valid = await this.passwordHasher.verify(admin.passwordHash, input.currentPassword)
    if (!valid) {
      throw new AppError(400, 'Conflict', 'Password lama tidak sesuai')
    }
    const policyError = validatePassword(input.newPassword)
    if (policyError) {
      throw new AppError(400, 'Conflict', policyError)
    }
    const newHash = await this.passwordHasher.hash(input.newPassword)
    await this.adminRepository.updatePassword(admin.id, newHash, new Date())
    return { ok: true }
  }

  // Issue recovery code baru (menggantikan code lama). Butuh password saat ini.
  async issueRecoveryCode(currentPassword: string): Promise<{ recoveryCode: string }> {
    const session = await this.ensureLoadedSession()
    if (!session) {
      throw new AppError(401, 'Unauthorized', 'Sesi tidak aktif')
    }
    const admin = await this.adminRepository.findById(session.adminId)
    if (!admin) {
      throw new AppError(401, 'Unauthorized', 'Sesi tidak aktif')
    }
    const valid = await this.passwordHasher.verify(admin.passwordHash, currentPassword)
    if (!valid) {
      throw new AppError(400, 'Conflict', 'Password saat ini tidak sesuai')
    }
    const code = generateRecoveryCode()
    const hash = await this.passwordHasher.hash(normalizeRecoveryCode(code))
    await this.adminRepository.updateRecoveryCode(admin.id, hash, new Date())
    return { recoveryCode: code }
  }

  // Reset password memakai recovery code. Code asli TIDAK pernah disimpan/log.
  async resetPasswordWithRecoveryCode(input: { code: string; newPassword: string }): Promise<{ recoveryCode: string }> {
    if (this.recoveryLimiter.isLocked()) {
      throw new AppError(
        429,
        'Too Many Requests',
        `Terlalu banyak percobaan. Coba lagi dalam ${this.recoveryLimiter.remainingLockMinutes()} menit.`
      )
    }
    const normalized = normalizeRecoveryCode(input.code)
    const admin = await this.adminRepository.findSingle()
    if (!admin || !admin.recoveryCodeHash) {
      this.recoveryLimiter.recordFailure()
      throw new AppError(400, 'Bad Request', 'Kode pemulihan tidak valid.')
    }
    const ok = await this.passwordHasher.verify(admin.recoveryCodeHash, normalized)
    if (!ok) {
      this.recoveryLimiter.recordFailure()
      throw new AppError(400, 'Bad Request', 'Kode pemulihan tidak valid.')
    }
    const policyError = validatePassword(input.newPassword)
    if (policyError) {
      // Code valid, tapi password tidak sesuai kebijakan — JANGAN catat kegagalan limiter.
      throw new AppError(400, 'Conflict', policyError)
    }
    const newHash = await this.passwordHasher.hash(input.newPassword)
    await this.adminRepository.updatePassword(admin.id, newHash, new Date())
    await this.sessionManager.revokeAllSessions(admin.id)
    const newCode = generateRecoveryCode()
    const newHashCode = await this.passwordHasher.hash(normalizeRecoveryCode(newCode))
    await this.adminRepository.updateRecoveryCode(admin.id, newHashCode, new Date())
    this.recoveryLimiter.reset()
    return { recoveryCode: newCode }
  }
}
