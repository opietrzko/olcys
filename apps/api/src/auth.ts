/**
 * Logowanie analityków i role (RBAC). Domyślnie wyłączone – włącza się, gdy istnieje plik użytkowników
 * (OLCYS_USERS_FILE, domyślnie data/users.json, tworzony przez `npm run user:add`). W docelowym wdrożeniu KAS
 * w to miejsce wchodzi SSO (np. OIDC / Kerberos) – role i dziennik audytu pozostają bez zmian.
 *
 * Role:
 *   analityk – tworzy i uruchamia analizy, przegląda wyniki, pobiera raporty i pakiety dowodowe,
 *   przeglad – tylko odczyt (np. kontrola, prokuratura): wyniki, raporty, pakiety, bez uruchamiania analiz,
 *   admin    – jak analityk + dziennik audytu.
 *
 * Hasła: scrypt (N=16384, r=8, p=1) z losową solą. Sesja: podpisany HMAC-SHA256 token w ciasteczku HttpOnly, SameSite=Strict.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export type Role = 'analityk' | 'przeglad' | 'admin';
export const ROLES: Role[] = ['analityk', 'przeglad', 'admin'];

export interface UserRecord {
  login: string;
  role: Role;
  /** scrypt$<sól base64>$<skrót base64> */
  password: string;
  name?: string;
}

export function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 32).toString('base64')}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function loadUsers(file: string): UserRecord[] {
  if (!existsSync(file)) return [];
  const d = JSON.parse(readFileSync(file, 'utf8')) as { users?: UserRecord[] };
  return (d.users ?? []).filter((u) => u.login && ROLES.includes(u.role) && u.password);
}

export interface Session {
  login: string;
  role: Role;
  name?: string;
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64url');

export class Auth {
  private secret: Buffer;
  constructor(
    private usersFile: string,
    secret = process.env.OLCYS_SESSION_SECRET,
    private ttlMs = Number(process.env.OLCYS_SESSION_HOURS ?? 10) * 3600e3,
  ) {
    // bez stałego sekretu sesje wygasają przy restarcie API (bezpieczny domyślny wybór)
    this.secret = secret ? Buffer.from(secret) : randomBytes(32);
  }
  /** Plik czytany przy każdym logowaniu – dodanie użytkownika nie wymaga restartu. */
  get enabled(): boolean {
    return loadUsers(this.usersFile).length > 0;
  }
  login(login: string, password: string): Session | null {
    const u = loadUsers(this.usersFile).find((x) => x.login.toLowerCase() === login.trim().toLowerCase());
    // porównanie z hasłem-atrapą także dla nieznanego loginu – stały czas odpowiedzi
    const ok = checkPassword(password, u?.password ?? hashPassword('x', Buffer.alloc(16)));
    return u && ok ? { login: u.login, role: u.role, name: u.name, exp: Date.now() + this.ttlMs } : null;
  }
  issue(s: Session): string {
    const body = b64url(Buffer.from(JSON.stringify(s)));
    return `${body}.${b64url(createHmac('sha256', this.secret).update(body).digest())}`;
  }
  verify(token: string | undefined): Session | null {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    try {
      const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
      if (s.exp < Date.now()) return null;
      // rola z pliku (zmiana uprawnień / usunięcie konta działa od razu)
      const u = loadUsers(this.usersFile).find((x) => x.login === s.login);
      return u ? { ...s, role: u.role, name: u.name } : null;
    } catch {
      return null;
    }
  }
}

export const COOKIE = 'olcys_session';

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** Uprawnienia: metoda + ścieżka → wymagane role (null = każdy zalogowany). */
export function requiredRoles(method: string, path: string): Role[] | null {
  if (path.startsWith('/api/audit')) return ['admin'];
  if (method !== 'GET' && method !== 'HEAD') return ['analityk', 'admin'];
  return null;
}
