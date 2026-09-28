/**
 * Creates the demo accounts for a deployed POC.
 *
 * Registration is closed on any public deployment (REGISTRATION_ENABLED=false),
 * so this is the only way accounts get made there. Run it once after the
 * migrations, then hand the credentials to whoever is being shown the demo.
 *
 *   npm run seed:demo
 *
 * Safe to re-run: an account that already exists has its password reset to the
 * value below rather than being duplicated.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source';

type DemoUser = { email: string; password: string; fullName: string; state: string };

/** Overridable so the published credentials are not the ones in the repo. */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'ExpatsDemo2026!';

const USERS: DemoUser[] = [
  { email: 'demo@expats.mx', password: DEMO_PASSWORD, fullName: 'Demo User', state: 'Jalisco' },
  { email: 'demo.yucatan@expats.mx', password: DEMO_PASSWORD, fullName: 'Demo User (Yucatán)', state: 'Yucatán' },
];

async function main() {
  const ds: DataSource = await dataSource.initialize();

  try {
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const email = u.email.toLowerCase();

      const existing = await ds.query('SELECT id FROM users WHERE email = $1', [email]);

      if (existing.length) {
        await ds.query('UPDATE users SET firebase_uid = $1, state = $2 WHERE email = $3', [
          hash,
          u.state,
          email,
        ]);
        console.log(`updated  ${email}`);
      } else {
        await ds.query(
          `INSERT INTO users (email, full_name, state, auth_provider, firebase_uid, is_verified)
           VALUES ($1, $2, $3, 'password', $4, true)`,
          [email, u.fullName, u.state, hash],
        );
        console.log(`created  ${email}`);
      }
    }

    console.log(`\nPassword for every account above: ${DEMO_PASSWORD}`);
    console.log('Set DEMO_PASSWORD in the environment to use a different one.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
