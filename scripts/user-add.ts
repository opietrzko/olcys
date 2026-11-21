/**
 * Dodanie / zmiana konta analityka (włącza logowanie w API). Hasło podawane w terminalu (bez echa) albo w OLCYS_PASSWORD.
 *   npm run user:add -- <login> <analityk|przeglad|admin> ["Imię Nazwisko"]
 * Usunięcie wszystkich kont (data/users.json) wyłącza logowanie.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '@olcys/engine';
import { hashPassword, ROLES, type Role, type UserRecord } from '../apps/api/src/auth';

const [login, role, name] = process.argv.slice(2);
if (!login || !ROLES.includes(role as Role)) {
  console.error(`Użycie: npm run user:add -- <login> <${ROLES.join('|')}> ["Imię Nazwisko"]`);
  process.exit(2);
}

async function askPassword(): Promise<string> {
  if (process.env.OLCYS_PASSWORD) return process.env.OLCYS_PASSWORD;
  process.stdout.write('Hasło (min. 10 znaków): ');
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  let pw = '';
  return new Promise((resolve) => {
    stdin.on('data', (d) => {
      for (const ch of d.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(pw);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f') pw = pw.slice(0, -1);
        else pw += ch;
      }
    });
  });
}

const password = await askPassword();
if (password.length < 10) {
  console.error('Hasło musi mieć co najmniej 10 znaków');
  process.exit(2);
}
const file = process.env.OLCYS_USERS_FILE ?? join(REPO_ROOT, 'data', 'users.json');
const data = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { users: UserRecord[] }) : { users: [] };
data.users = [...data.users.filter((u) => u.login.toLowerCase() !== login.toLowerCase()), { login, role: role as Role, name, password: hashPassword(password) }];
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
console.log(`Zapisano konto „${login}” (${role}) w ${file} – logowanie w API jest włączone (liczba kont: ${data.users.length}).`);
