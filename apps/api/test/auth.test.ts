import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Auth, checkPassword, hashPassword, readCookie, requiredRoles } from '../src/auth';

const dir = mkdtempSync(join(tmpdir(), 'olcys-auth-'));
const file = join(dir, 'users.json');

describe('Logowanie i role', () => {
  it('bez pliku użytkowników logowanie jest wyłączone', () => {
    expect(new Auth(join(dir, 'brak.json')).enabled).toBe(false);
  });

  it('hasło scrypt: poprawne przechodzi, błędne nie', () => {
    const h = hashPassword('testowe-haslo-123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(checkPassword('testowe-haslo-123', h)).toBe(true);
    expect(checkPassword('inne-haslo-1234', h)).toBe(false);
  });

  it('sesja: wydanie, weryfikacja, podrobienie i wygaśnięcie', () => {
    writeFileSync(file, JSON.stringify({ users: [{ login: 'analityk1', role: 'analityk', password: hashPassword('testowe-haslo-123') }] }));
    const auth = new Auth(file, 'sekret-testowy');
    expect(auth.enabled).toBe(true);
    expect(auth.login('analityk1', 'zle-haslo')).toBeNull();
    expect(auth.login('nieznany', 'testowe-haslo-123')).toBeNull();
    const s = auth.login('ANALITYK1', 'testowe-haslo-123')!;
    expect(s).toMatchObject({ login: 'analityk1', role: 'analityk' });
    const token = auth.issue(s);
    expect(auth.verify(token)?.login).toBe('analityk1');
    // podmiana roli w tokenie bez sekretu
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), role: 'admin' })).toString('base64url');
    expect(auth.verify(`${forged}.${sig}`)).toBeNull();
    expect(new Auth(file, 'inny-sekret').verify(token)).toBeNull();
    expect(auth.verify(auth.issue({ ...s, exp: Date.now() - 1 }))).toBeNull();
  });

  it('usunięcie konta unieważnia sesję', () => {
    writeFileSync(file, JSON.stringify({ users: [{ login: 'tmp', role: 'admin', password: hashPassword('testowe-haslo-123') }, { login: 'x', role: 'przeglad', password: hashPassword('testowe-haslo-123') }] }));
    const auth = new Auth(file, 's');
    const token = auth.issue(auth.login('tmp', 'testowe-haslo-123')!);
    writeFileSync(file, JSON.stringify({ users: [{ login: 'x', role: 'przeglad', password: hashPassword('testowe-haslo-123') }] }));
    expect(auth.verify(token)).toBeNull();
  });

  it('uprawnienia ról', () => {
    expect(requiredRoles('GET', '/api/runs/x')).toBeNull();
    expect(requiredRoles('POST', '/api/analyses')).toEqual(['analityk', 'admin']);
    expect(requiredRoles('GET', '/api/audit')).toEqual(['admin']);
  });

  it('odczyt ciasteczka', () => {
    expect(readCookie('a=1; olcys_session=abc.def; b=2', 'olcys_session')).toBe('abc.def');
    expect(readCookie(undefined, 'olcys_session')).toBeUndefined();
  });
});
