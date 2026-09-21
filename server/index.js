const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'lokalni-dev-secret-promijeni-u-produkciji';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_COOKIE = 'erv_token';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

if (IS_PRODUCTION) {
  // Render stavlja aplikaciju iza svog reverse proxyja - potrebno da
  // express ispravno prepozna HTTPS i postavi "secure" kolačić.
  app.set('trust proxy', 1);
}

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'app.db');
const adminPasswordPath = path.join(dataDir, 'ADMIN_PASSWORD.txt');
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
// WAL nacin rada koristi mmap/shared-memory datoteke koje na nekim
// kontejnerskim/mreznim datotecnim sustavima (npr. Railway) uzrokuju
// segfault, pa koristimo standardni (kompatibilniji) "delete" nacin rada.
db.exec('PRAGMA journal_mode = DELETE');
db.exec('PRAGMA foreign_keys = ON');

// node:sqlite (za razliku od better-sqlite3) nema ugradjenu .transaction()
// metodu, pa koristimo jednostavan BEGIN/COMMIT/ROLLBACK wrapper.
function runInTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    dolazak TEXT,
    odlazak TEXT,
    pauza_odlazak TEXT,
    pauza_povratak TEXT,
    tip TEXT NOT NULL CHECK (tip IN ('radni', 'godisnji', 'home_office', 'sluzbeni_put', 'drzavni_praznik')),
    napomena TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS holidays (
    date TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
`);

// Migracija: starije baze imaju stariji CHECK constraint na time_entries.tip
// koji ne dopušta 'sluzbeni_put' i 'drzavni_praznik'. Ako je tako, ponovno
// izgradi tablicu s novim constraintom i prenesi postojeće podatke.
const timeEntriesTableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'time_entries'`).get();
if (timeEntriesTableSql && !timeEntriesTableSql.sql.includes('sluzbeni_put')) {
  db.exec(`
    CREATE TABLE time_entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      dolazak TEXT,
      odlazak TEXT,
      pauza_odlazak TEXT,
      pauza_povratak TEXT,
      tip TEXT NOT NULL CHECK (tip IN ('radni', 'godisnji', 'home_office', 'sluzbeni_put', 'drzavni_praznik')),
      napomena TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO time_entries_new SELECT * FROM time_entries;
    DROP TABLE time_entries;
    ALTER TABLE time_entries_new RENAME TO time_entries;
  `);
}

const seedHolidays = [
  ['2025-01-01', 'Nova godina'],
  ['2025-01-06', 'Bogojavljenje'],
  ['2025-04-20', 'Uskrs'],
  ['2025-04-21', 'Uskrsni ponedjeljak'],
  ['2025-05-01', 'Praznik rada'],
  ['2025-05-30', 'Dan državnosti'],
  ['2025-06-19', 'Tijelovo'],
  ['2025-06-22', 'Dan antifašističke borbe'],
  ['2025-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'],
  ['2025-08-15', 'Velika Gospa'],
  ['2025-11-01', 'Svi sveti'],
  ['2025-11-18', 'Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje'],
  ['2025-12-25', 'Božić'],
  ['2025-12-26', 'Sveti Stjepan'],
  ['2026-01-01', 'Nova godina'],
  ['2026-01-06', 'Bogojavljenje'],
  ['2026-04-05', 'Uskrs'],
  ['2026-04-06', 'Uskrsni ponedjeljak'],
  ['2026-05-01', 'Praznik rada'],
  ['2026-05-30', 'Dan državnosti'],
  ['2026-06-04', 'Tijelovo'],
  ['2026-06-22', 'Dan antifašističke borbe'],
  ['2026-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'],
  ['2026-08-15', 'Velika Gospa'],
  ['2026-11-01', 'Svi sveti'],
  ['2026-11-18', 'Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje'],
  ['2026-12-25', 'Božić'],
  ['2026-12-26', 'Sveti Stjepan'],
  ['2027-01-01', 'Nova godina'],
  ['2027-01-06', 'Bogojavljenje'],
  ['2027-03-28', 'Uskrs'],
  ['2027-03-29', 'Uskrsni ponedjeljak'],
  ['2027-05-01', 'Praznik rada'],
  ['2027-05-27', 'Tijelovo'],
  ['2027-05-30', 'Dan državnosti'],
  ['2027-06-22', 'Dan antifašističke borbe'],
  ['2027-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'],
  ['2027-08-15', 'Velika Gospa'],
  ['2027-11-01', 'Svi sveti'],
  ['2027-11-18', 'Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje'],
  ['2027-12-25', 'Božić'],
  ['2027-12-26', 'Sveti Stjepan'],
  ['2028-01-01', 'Nova godina'],
  ['2028-01-06', 'Bogojavljenje'],
  ['2028-04-16', 'Uskrs'],
  ['2028-04-17', 'Uskrsni ponedjeljak'],
  ['2028-05-01', 'Praznik rada'],
  ['2028-05-30', 'Dan državnosti'],
  ['2028-06-15', 'Tijelovo'],
  ['2028-06-22', 'Dan antifašističke borbe'],
  ['2028-08-05', 'Dan pobjede i domovinske zahvalnosti i Dan hrvatskih branitelja'],
  ['2028-08-15', 'Velika Gospa'],
  ['2028-11-01', 'Svi sveti'],
  ['2028-11-18', 'Dan sjećanja na žrtve Domovinskog rata i Dan sjećanja na žrtvu Vukovara i Škabrnje'],
  ['2028-12-25', 'Božić'],
  ['2028-12-26', 'Sveti Stjepan']
];

const insertHoliday = db.prepare(`
  INSERT INTO holidays (date, name)
  VALUES (?, ?)
  ON CONFLICT(date) DO UPDATE SET name = excluded.name
`);

runInTransaction(() => {
  for (const holiday of seedHolidays) {
    insertHoliday.run(holiday[0], holiday[1]);
  }
});

function generateStrongPassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function seedAdminUser() {
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
  if (existingAdmin) {
    return;
  }

  const password = generateStrongPassword(18);
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (username, full_name, password_hash, role, status)
    VALUES (?, ?, ?, 'admin', 'approved')
  `).run('admin', 'Administrator', passwordHash);

  const content = [
    'Administratorski račun je kreiran pri prvom pokretanju.',
    'Korisničko ime: admin',
    `Lozinka: ${password}`,
    '',
    'Promijenite ili sigurno pohranite ovu lozinku.'
  ].join('\n');

  fs.writeFileSync(adminPasswordPath, content, 'utf8');
  console.log('===============================================');
  console.log('Kreiran je administratorski korisnik.');
  console.log('Korisničko ime: admin');
  console.log(`Lozinka: ${password}`);
  console.log(`Lozinka je spremljena i u: ${adminPasswordPath}`);
  console.log('===============================================');
}

seedAdminUser();

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [year, month, day] = date.split('-').map(Number);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day;
}

function isValidTime(value) {
  if (!value) {
    return false;
  }
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function calculateWorkedMinutes(entry) {
  if (!entry || !['radni', 'home_office', 'sluzbeni_put', 'drzavni_praznik'].includes(entry.tip)) {
    return 0;
  }
  if (!entry.dolazak || !entry.odlazak) {
    return 0;
  }
  const start = timeToMinutes(entry.dolazak);
  const end = timeToMinutes(entry.odlazak);
  let breakMinutes = 0;
  if (entry.pauza_odlazak && entry.pauza_povratak) {
    breakMinutes = Math.max(0, timeToMinutes(entry.pauza_povratak) - timeToMinutes(entry.pauza_odlazak));
  }
  const extraBreak = Math.max(0, breakMinutes - 30);
  return Math.max(0, end - start - extraBreak);
}

function formatEntryResponse(entry) {
  return {
    ...entry,
    worked_minutes: calculateWorkedMinutes(entry)
  };
}

function isWeekdayDate(isoDate) {
  const day = new Date(isoDate + 'T00:00:00').getDay();
  return day >= 1 && day <= 5;
}

function buildAutoHolidayEntry(userId, holiday) {
  const entry = {
    id: null,
    user_id: userId,
    date: holiday.date,
    dolazak: '08:00',
    odlazak: '16:00',
    pauza_odlazak: null,
    pauza_povratak: null,
    tip: 'drzavni_praznik',
    napomena: holiday.name,
    created_at: null,
    updated_at: null,
    auto: true
  };
  return formatEntryResponse(entry);
}

function buildMonthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Neispravan format mjeseca. Očekuje se YYYY-MM.');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`
  };
}

function getUserSafe(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    created_at: user.created_at
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: TOKEN_MAX_AGE
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION
  });
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const token = req.cookies[AUTH_COOKIE];
  if (!token) {
    return res.status(401).json({ message: 'Niste prijavljeni.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.id);
    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Korisnik više ne postoji.' });
    }
    if (user.status !== 'approved') {
      clearAuthCookie(res);
      return res.status(403).json({ message: 'Korisnički račun nije aktivan.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Sesija je istekla ili nije valjana.' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Samo administrator ima pristup ovom dijelu.' });
  }
  return next();
}

function resolveTargetUserId(req, userIdValue) {
  if (!userIdValue) {
    return req.user.id;
  }
  const userId = Number(userIdValue);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Neispravan korisnik.');
    error.status = 400;
    throw error;
  }
  if (req.user.role !== 'admin' && userId !== req.user.id) {
    const error = new Error('Nemate pristup podacima drugog korisnika.');
    error.status = 403;
    throw error;
  }
  const targetUser = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!targetUser) {
    const error = new Error('Traženi korisnik ne postoji.');
    error.status = 404;
    throw error;
  }
  return userId;
}

function normalizeEntryPayload(body) {
  const allowedTypes = ['radni', 'godisnji', 'home_office', 'sluzbeni_put'];
  const tip = body.tip;
  if (!allowedTypes.includes(tip)) {
    const error = new Error('Neispravan tip dana.');
    error.status = 400;
    throw error;
  }

  const napomena = typeof body.napomena === 'string' ? body.napomena.trim() : null;

  if (tip === 'godisnji') {
    return {
      tip,
      dolazak: null,
      odlazak: null,
      pauza_odlazak: null,
      pauza_povratak: null,
      napomena: napomena || null
    };
  }

  if (tip === 'home_office' || tip === 'sluzbeni_put') {
    return {
      tip,
      dolazak: '08:00',
      odlazak: '16:00',
      pauza_odlazak: null,
      pauza_povratak: null,
      napomena: napomena || null
    };
  }

  const dolazak = body.dolazak || null;
  const odlazak = body.odlazak || null;
  const pauzaOdlazak = body.pauza_odlazak || null;
  const pauzaPovratak = body.pauza_povratak || null;

  if (!isValidTime(dolazak) || !isValidTime(odlazak)) {
    const error = new Error('Dolazak i odlazak moraju biti u formatu HH:MM.');
    error.status = 400;
    throw error;
  }

  const start = timeToMinutes(dolazak);
  const end = timeToMinutes(odlazak);
  if (end <= start) {
    const error = new Error('Vrijeme odlaska mora biti nakon dolaska.');
    error.status = 400;
    throw error;
  }

  if ((pauzaOdlazak && !pauzaPovratak) || (!pauzaOdlazak && pauzaPovratak)) {
    const error = new Error('Za pauzu je potrebno unijeti oba vremena ili ostaviti oba prazna.');
    error.status = 400;
    throw error;
  }

  if (pauzaOdlazak && pauzaPovratak) {
    if (!isValidTime(pauzaOdlazak) || !isValidTime(pauzaPovratak)) {
      const error = new Error('Pauza mora biti u formatu HH:MM.');
      error.status = 400;
      throw error;
    }

    const pauseStart = timeToMinutes(pauzaOdlazak);
    const pauseEnd = timeToMinutes(pauzaPovratak);

    if (pauseEnd <= pauseStart) {
      const error = new Error('Povratak s pauze mora biti nakon odlaska na pauzu.');
      error.status = 400;
      throw error;
    }

    if (pauseStart < start || pauseEnd > end) {
      const error = new Error('Pauza mora biti unutar radnog vremena.');
      error.status = 400;
      throw error;
    }
  }

  return {
    tip,
    dolazak,
    odlazak,
    pauza_odlazak: pauzaOdlazak,
    pauza_povratak: pauzaPovratak,
    napomena: napomena || null
  };
}

app.use(cors((req, callback) => {
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  if (process.env.ALLOWED_ORIGIN) {
    allowedOrigins.push(process.env.ALLOWED_ORIGIN);
  }

  const origin = req.header('Origin');
  let isSameOrigin = false;
  if (origin) {
    try {
      // Frontend i backend se u produkciji serviraju s iste domene (npr. Railway),
      // pa automatski dopustamo zahtjeve ciji "Origin" odgovara domeni na koju je
      // sam zahtjev poslan - bez potrebe za rucnim postavljanjem ALLOWED_ORIGIN.
      isSameOrigin = new URL(origin).host === req.get('host');
    } catch (error) {
      isSameOrigin = false;
    }
  }

  const allowed = !origin || isSameOrigin || allowedOrigins.includes(origin);
  callback(null, { origin: allowed, credentials: true });
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Neispravno korisničko ime ili lozinka.' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({ message: 'Račun još nije odobren od strane administratora.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ message: 'Račun je odbijen ili deaktiviran. Obratite se administratoru.' });
  }

  const token = createToken(user);
  setAuthCookie(res, token);
  return res.json({ user: getUserSafe(user) });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Odjava uspješna.' });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: getUserSafe(req.user) });
});

app.patch('/api/auth/me', authRequired, (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  if (!fullName || fullName.length < 3) {
    return res.status(400).json({ message: 'Ime i prezime moraju imati barem 3 znaka.' });
  }

  db.prepare(`UPDATE users SET full_name = ? WHERE id = ?`).run(fullName, req.user.id);
  const updatedUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  return res.json({ message: 'Podaci su spremljeni.', user: getUserSafe(updatedUser) });
});

app.post('/api/auth/change-password', authRequired, (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) {
    return res.status(400).json({ message: 'Trenutna lozinka nije ispravna.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Nova lozinka mora imati barem 6 znakova.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Nova lozinka i potvrda lozinke se ne podudaraju.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, req.user.id);
  return res.json({ message: 'Lozinka je uspješno promijenjena.' });
});

app.get('/api/users', authRequired, adminRequired, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, status, created_at
    FROM users
    ORDER BY role DESC, created_at ASC
  `).all();
  res.json({ users });
});

app.patch('/api/users/:id/status', authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.id);
  const { status } = req.body;
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Neispravan korisnik.' });
  }
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Neispravan status.' });
  }
  if (req.user.id === userId && status !== 'approved') {
    return res.status(400).json({ message: 'Ne možete deaktivirati vlastiti administratorski račun.' });
  }

  const user = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(userId);
  if (!user) {
    return res.status(404).json({ message: 'Korisnik nije pronađen.' });
  }

  db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, userId);
  return res.json({ message: `Status korisnika ${user.username} je ažuriran na ${status}.` });
});

app.post('/api/users/:id/reset-password', authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Neispravan korisnik.' });
  }
  const user = db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(userId);
  if (!user) {
    return res.status(404).json({ message: 'Korisnik nije pronađen.' });
  }

  const tempPassword = generateStrongPassword(12);
  const passwordHash = bcrypt.hashSync(tempPassword, 10);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);

  return res.json({
    message: `Lozinka za korisnika ${user.username} je resetirana.`,
    tempPassword
  });
});

app.delete('/api/users/:id', authRequired, adminRequired, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Neispravan korisnik.' });
  }
  if (req.user.id === userId) {
    return res.status(400).json({ message: 'Ne možete izbrisati vlastiti račun.' });
  }

  const user = db.prepare(`SELECT id, username, role FROM users WHERE id = ?`).get(userId);
  if (!user) {
    return res.status(404).json({ message: 'Korisnik nije pronađen.' });
  }

  if (user.role === 'admin') {
    const adminCount = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`).get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ message: 'Nije moguće izbrisati jedinog administratora.' });
    }
  }

  runInTransaction(() => {
    db.prepare(`DELETE FROM time_entries WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  });

  return res.json({ message: `Korisnik ${user.username} je izbrisan.` });
});

app.get('/api/holidays', authRequired, (req, res) => {
  const holidays = db.prepare(`SELECT date, name FROM holidays ORDER BY date ASC`).all();
  res.json({ holidays });
});

app.post('/api/holidays', authRequired, adminRequired, (req, res) => {
  const date = typeof req.body.date === 'string' ? req.body.date.trim() : '';
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (!isValidDate(date)) {
    return res.status(400).json({ message: 'Neispravan datum praznika.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Naziv praznika je obavezan.' });
  }

  insertHoliday.run(date, name);
  return res.json({ message: 'Praznik je spremljen.' });
});

app.delete('/api/holidays/:date', authRequired, adminRequired, (req, res) => {
  const date = req.params.date;
  if (!isValidDate(date)) {
    return res.status(400).json({ message: 'Neispravan datum praznika.' });
  }
  db.prepare(`DELETE FROM holidays WHERE date = ?`).run(date);
  return res.json({ message: 'Praznik je uklonjen.' });
});

function getMonthData(targetUserId, month) {
  const { start, end } = buildMonthRange(month);

  const entries = db.prepare(`
    SELECT id, user_id, date, dolazak, odlazak, pauza_odlazak, pauza_povratak, tip, napomena, created_at, updated_at
    FROM time_entries
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(targetUserId, start, end).map(formatEntryResponse);

  const holidays = db.prepare(`
    SELECT date, name
    FROM holidays
    WHERE date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(start, end);

  // Državni praznici koji padaju na radni dan (pon-pet) automatski se broje
  // kao 8 radnih sati (08:00-16:00), osim ako korisnik već ima vlastiti unos za taj dan.
  const existingDates = new Set(entries.map((entry) => entry.date));
  for (const holiday of holidays) {
    if (isWeekdayDate(holiday.date) && !existingDates.has(holiday.date)) {
      entries.push(buildAutoHolidayEntry(targetUserId, holiday));
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return { start, end, entries, holidays };
}

const EXPORT_BADGES = {
  godisnji: { label: 'GO', fill: 'FFC6EFCE', font: 'FF256029' },
  home_office: { label: 'HO', fill: 'FFFAD4CE', font: 'FF9C4221' },
  drzavni_praznik: { label: 'PR', fill: 'FFD9E2F3', font: 'FF1F4E78' },
  sluzbeni_put: { label: 'SP', fill: 'FFFCE4D6', font: 'FF974706' }
};

function formatMinutesHM(minutes) {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

function exportWorkedMinutes(entry) {
  if (entry && entry.tip === 'godisnji') {
    return 480;
  }
  return calculateWorkedMinutes(entry);
}

function exportDisplayTimes(entry) {
  if (!entry) {
    return { dolazak: '', odlazak: '' };
  }
  if (entry.tip === 'godisnji' && (!entry.dolazak || !entry.odlazak)) {
    return { dolazak: '08:00', odlazak: '16:00' };
  }
  return { dolazak: entry.dolazak || '', odlazak: entry.odlazak || '' };
}

function buildExportModel(user, month, entries, holidays) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const entryMap = new Map(entries.map((entry) => [entry.date, entry]));
  const holidayMap = new Set(holidays.map((holiday) => holiday.date));

  const rows = [];
  let fundDays = 0;
  const counts = { godisnji: 0, home_office: 0, drzavni_praznik: 0, sluzbeni_put: 0 };

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, monthNumber - 1, day);
    const isoDate = `${month}-${String(day).padStart(2, '0')}`;
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    const entry = entryMap.get(isoDate);
    const { dolazak, odlazak } = exportDisplayTimes(entry);
    const pauzaMinutes = entry && entry.pauza_odlazak && entry.pauza_povratak
      ? Math.max(0, timeToMinutes(entry.pauza_povratak) - timeToMinutes(entry.pauza_odlazak))
      : 0;
    const workedMinutes = exportWorkedMinutes(entry);
    const badge = entry && EXPORT_BADGES[entry.tip] ? EXPORT_BADGES[entry.tip] : null;
    if (entry && counts[entry.tip] !== undefined) {
      counts[entry.tip] += 1;
    }
    if (!holidayMap.has(isoDate)) {
      fundDays += 1;
    }
    rows.push({
      isoDate,
      displayDate: `${String(day).padStart(2, '0')}.${String(monthNumber).padStart(2, '0')}.${year}.`,
      weekIndex: getIsoWeekKey(date),
      dolazak,
      odlazak,
      pauzaMinutes,
      workedMinutes,
      badge
    });
  }

  const weeks = [];
  let currentWeekKey = null;
  let currentWeek = null;
  for (const row of rows) {
    if (row.weekIndex !== currentWeekKey) {
      currentWeekKey = row.weekIndex;
      currentWeek = { days: [], totalMinutes: 0 };
      weeks.push(currentWeek);
    }
    currentWeek.days.push(row);
    currentWeek.totalMinutes += row.workedMinutes;
  }

  const totalMinutes = rows.reduce((sum, row) => sum + row.workedMinutes, 0);
  const fundMinutes = fundDays * 480;

  const monthDate = new Date(year, monthNumber - 1, 1);
  const monthNameLabel = monthDate.toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });

  return {
    user,
    month,
    monthLabel: `${String(monthNumber).padStart(2, '0')}/${String(year).slice(-2)}`,
    monthNameLabel,
    weeks,
    totalMinutes,
    fundMinutes,
    diffMinutes: totalMinutes - fundMinutes,
    counts
  };
}

function getIsoWeekKey(date) {
  const temp = new Date(date);
  const day = (temp.getDay() + 6) % 7; // Monday = 0
  temp.setDate(temp.getDate() - day);
  return temp.toISOString().slice(0, 10);
}

async function buildExcelExport(model) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Evidencija radnog vremena';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Evidencija', {
    views: [{ showGridLines: false }]
  });

  sheet.columns = [
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 11 },
    { width: 10 }
  ];

  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Evidencija radnog vremena – ${model.user.full_name} – ${model.monthNameLabel}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF16202A' } };
  titleCell.alignment = { horizontal: 'left' };
  sheet.addRow([]);

  const headerRow = sheet.addRow(['Datum', 'Dolazak', 'Pauza', 'Odlazak', 'Ukupno radnih sati', '']);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF16202A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3FA' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD7E1EF' } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  for (const week of model.weeks) {
    for (const day of week.days) {
      const row = sheet.addRow([
        day.displayDate,
        day.dolazak || '',
        day.pauzaMinutes ? formatMinutesHM(day.pauzaMinutes) : '0:00',
        day.odlazak || '',
        day.dolazak && day.odlazak ? formatMinutesHM(day.workedMinutes) : '',
        day.badge ? day.badge.label : ''
      ]);
      row.getCell(1).alignment = { horizontal: 'left' };
      for (let col = 2; col <= 5; col += 1) {
        row.getCell(col).alignment = { horizontal: 'center' };
      }
      if (day.badge) {
        const badgeCell = row.getCell(6);
        badgeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: day.badge.fill } };
        badgeCell.font = { bold: true, color: { argb: day.badge.font } };
        badgeCell.alignment = { horizontal: 'center' };
      }
    }
    const totalRow = sheet.addRow(['', '', '', '', formatMinutesHM(week.totalMinutes), '']);
    const totalCell = totalRow.getCell(5);
    totalCell.font = { bold: true, color: { argb: 'FFB42318' } };
    totalCell.alignment = { horizontal: 'center' };
    sheet.addRow([]);
  }

  sheet.addRow([]);
  const summaryStartRow = sheet.rowCount + 1;

  const totalLabelRow = sheet.addRow(['', '', '', `Ukupno ${model.monthLabel}`, formatMinutesHM(model.totalMinutes), '']);
  totalLabelRow.getCell(4).font = { bold: true };
  totalLabelRow.getCell(4).alignment = { horizontal: 'right' };
  totalLabelRow.getCell(5).font = { bold: true, color: { argb: 'FFB42318' } };
  totalLabelRow.getCell(5).alignment = { horizontal: 'center' };

  const fundRow = sheet.addRow(['', '', '', 'Fond sati', formatMinutesHM(model.fundMinutes), '']);
  fundRow.getCell(4).font = { bold: true };
  fundRow.getCell(4).alignment = { horizontal: 'right' };
  fundRow.getCell(5).font = { bold: true };
  fundRow.getCell(5).alignment = { horizontal: 'center' };

  const diffRow = sheet.addRow(['', '', '', 'Razlika', formatMinutesHM(model.diffMinutes), '']);
  diffRow.getCell(4).font = { bold: true };
  diffRow.getCell(4).alignment = { horizontal: 'right' };
  diffRow.getCell(5).font = { bold: true, color: { argb: model.diffMinutes < 0 ? 'FFB42318' : 'FF067647' } };
  diffRow.getCell(5).alignment = { horizontal: 'center' };

  const legendEntries = [
    ['godisnji', 'GO – Godišnji odmor'],
    ['home_office', 'HO – Home office'],
    ['drzavni_praznik', 'PR – Državni praznik'],
    ['sluzbeni_put', 'SP – Službeni put']
  ];
  legendEntries.forEach(([key, label], index) => {
    const rowNumber = summaryStartRow + index;
    const badge = EXPORT_BADGES[key];
    const swatchCell = sheet.getRow(rowNumber).getCell(6);
    swatchCell.value = model.counts[key];
    swatchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: badge.fill } };
    swatchCell.font = { bold: true, color: { argb: badge.font } };
    swatchCell.alignment = { horizontal: 'center' };
    sheet.getCell(`H${rowNumber}`).value = label;
    sheet.getCell(`H${rowNumber}`).font = { color: { argb: 'FF607086' }, size: 10 };
  });
  sheet.getColumn(8).width = 26;

  return workbook;
}

const PDF_FONT_REGULAR = path.join(__dirname, 'assets', 'fonts', 'PTSans-Regular.ttf');
const PDF_FONT_BOLD = path.join(__dirname, 'assets', 'fonts', 'PTSans-Bold.ttf');

function buildPdfExport(model, res) {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  doc.registerFont('Body', PDF_FONT_REGULAR);
  doc.registerFont('Body-Bold', PDF_FONT_BOLD);
  doc.pipe(res);

  doc.font('Body-Bold').fontSize(16).fillColor('#16202A').text('Evidencija radnog vremena', { align: 'left' });
  doc.font('Body-Bold').fontSize(12).fillColor('#16202A').text(model.user.full_name);
  doc.font('Body').fontSize(11).fillColor('#607086').text(`Izvještaj za: ${model.monthNameLabel}`);
  doc.moveDown(0.8);

  const columns = [
    { label: 'Datum', width: 80 },
    { label: 'Dolazak', width: 65 },
    { label: 'Pauza', width: 55 },
    { label: 'Odlazak', width: 65 },
    { label: 'Ukupno', width: 65 },
    { label: 'Oznaka', width: 60 }
  ];
  const tableLeft = doc.page.margins.left;
  const rowHeight = 20;

  function drawHeader(y) {
    let x = tableLeft;
    doc.font('Body-Bold').fontSize(9).fillColor('#16202A');
    doc.rect(tableLeft, y, columns.reduce((sum, col) => sum + col.width, 0), rowHeight).fill('#EFF3FA');
    doc.fillColor('#16202A');
    columns.forEach((col) => {
      doc.text(col.label, x + 4, y + 6, { width: col.width - 8 });
      x += col.width;
    });
    return y + rowHeight;
  }

  let y = drawHeader(doc.y);
  const badgeColors = {
    GO: { fill: '#C6EFCE', font: '#256029' },
    HO: { fill: '#FAD4CE', font: '#9C4221' },
    PR: { fill: '#D9E2F3', font: '#1F4E78' },
    SP: { fill: '#FCE4D6', font: '#974706' }
  };

  function ensureSpace(neededHeight) {
    if (y + neededHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
  }

  for (const week of model.weeks) {
    for (const day of week.days) {
      ensureSpace(rowHeight);
      let x = tableLeft;
      doc.font('Body').fontSize(9).fillColor('#16202A');
      const values = [
        day.displayDate,
        day.dolazak || '',
        day.pauzaMinutes ? formatMinutesHM(day.pauzaMinutes) : '0:00',
        day.odlazak || '',
        day.dolazak && day.odlazak ? formatMinutesHM(day.workedMinutes) : ''
      ];
      values.forEach((value, index) => {
        doc.text(value, x + 4, y + 5, { width: columns[index].width - 8 });
        x += columns[index].width;
      });
      if (day.badge) {
        const colors = badgeColors[day.badge.label];
        doc.rect(x + 4, y + 3, columns[5].width - 20, 14).fill(colors.fill);
        doc.fillColor(colors.font).font('Body-Bold').fontSize(8).text(day.badge.label, x + 4, y + 6, { width: columns[5].width - 20, align: 'center' });
      }
      y += rowHeight;
    }
    ensureSpace(rowHeight);
    doc.font('Body-Bold').fontSize(9).fillColor('#B42318');
    doc.text(formatMinutesHM(week.totalMinutes), tableLeft + columns[0].width + columns[1].width + columns[2].width + columns[3].width + 4, y + 5, { width: columns[4].width - 8 });
    y += rowHeight + 6;
  }

  ensureSpace(rowHeight * 4);
  y += 6;
  const labelX = tableLeft + columns[0].width + columns[1].width + columns[2].width;
  const valueX = labelX + columns[3].width;
  const totalLabelX = tableLeft + columns[0].width;
  const totalLabelWidth = columns[1].width + columns[2].width + columns[3].width - 4;

  doc.font('Body-Bold').fontSize(10).fillColor('#16202A');
  doc.text(`Ukupno ${model.monthLabel}`, totalLabelX, y, { width: totalLabelWidth, align: 'right' });
  doc.fillColor('#B42318').text(formatMinutesHM(model.totalMinutes), valueX, y, { width: columns[4].width });
  y += 18;

  doc.fillColor('#16202A').text('Fond sati', labelX, y, { width: columns[3].width - 4, align: 'right' });
  doc.text(formatMinutesHM(model.fundMinutes), valueX, y, { width: columns[4].width });
  y += 18;

  doc.fillColor('#16202A').text('Razlika', labelX, y, { width: columns[3].width - 4, align: 'right' });
  doc.fillColor(model.diffMinutes < 0 ? '#B42318' : '#067647').text(formatMinutesHM(model.diffMinutes), valueX, y, { width: columns[4].width });
  y += 30;

  doc.font('Body').fontSize(9).fillColor('#607086');
  doc.text(`GO – Godišnji odmor: ${model.counts.godisnji} dana   ·   HO – Home office: ${model.counts.home_office} dana   ·   PR – Državni praznik: ${model.counts.drzavni_praznik} dana   ·   SP – Službeni put: ${model.counts.sluzbeni_put} dana`, tableLeft, y, { width: columns.reduce((sum, col) => sum + col.width, 0) });

  doc.end();
}

app.get('/api/export', authRequired, async (req, res, next) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const format = req.query.format === 'pdf' ? 'pdf' : (req.query.format === 'excel' ? 'excel' : null);
    if (!format) {
      return res.status(400).json({ message: 'Format mora biti excel ili pdf.' });
    }
    const targetUserId = resolveTargetUserId(req, req.query.userId);
    const { entries, holidays } = getMonthData(targetUserId, month);
    const targetUser = db.prepare(`SELECT id, username, full_name FROM users WHERE id = ?`).get(targetUserId);
    const model = buildExportModel(targetUser, month, entries, holidays);
    const fileSafeName = targetUser.full_name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');

    if (format === 'excel') {
      const workbook = await buildExcelExport(model);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Evidencija-${fileSafeName}-${month}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Evidencija-${fileSafeName}-${month}.pdf"`);
    return buildPdfExport(model, res);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/time-entries', authRequired, (req, res, next) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const targetUserId = resolveTargetUserId(req, req.query.userId);
    const { entries, holidays } = getMonthData(targetUserId, month);

    const selectedUser = db.prepare(`
      SELECT id, username, full_name, role, status
      FROM users
      WHERE id = ?
    `).get(targetUserId);

    return res.json({ month, selectedUser, entries, holidays });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/time-entries/:date', authRequired, (req, res, next) => {
  try {
    const date = req.params.date;
    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'Neispravan datum unosa.' });
    }

    const targetUserId = resolveTargetUserId(req, req.body.userId);
    const entry = normalizeEntryPayload(req.body);

    db.prepare(`
      INSERT INTO time_entries (
        user_id, date, dolazak, odlazak, pauza_odlazak, pauza_povratak, tip, napomena, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id, date) DO UPDATE SET
        dolazak = excluded.dolazak,
        odlazak = excluded.odlazak,
        pauza_odlazak = excluded.pauza_odlazak,
        pauza_povratak = excluded.pauza_povratak,
        tip = excluded.tip,
        napomena = excluded.napomena,
        updated_at = datetime('now')
    `).run(
      targetUserId,
      date,
      entry.dolazak,
      entry.odlazak,
      entry.pauza_odlazak,
      entry.pauza_povratak,
      entry.tip,
      entry.napomena
    );

    const savedEntry = db.prepare(`
      SELECT id, user_id, date, dolazak, odlazak, pauza_odlazak, pauza_povratak, tip, napomena, created_at, updated_at
      FROM time_entries
      WHERE user_id = ? AND date = ?
    `).get(targetUserId, date);

    return res.json({
      message: 'Unos je spremljen.',
      entry: formatEntryResponse(savedEntry)
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/time-entries/godisnji-range', authRequired, (req, res) => {
  const fromDate = typeof req.body.fromDate === 'string' ? req.body.fromDate : '';
  const toDate = typeof req.body.toDate === 'string' ? req.body.toDate : '';
  const napomena = typeof req.body.napomena === 'string' ? req.body.napomena.trim() : null;
  const targetUserId = resolveTargetUserId(req, req.body.userId);

  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    return res.status(400).json({ message: 'Neispravan raspon datuma.' });
  }
  if (toDate < fromDate) {
    return res.status(400).json({ message: 'Datum do mora biti jednak ili nakon datuma od.' });
  }

  const holidayDates = new Set(db.prepare(`SELECT date FROM holidays WHERE date BETWEEN ? AND ?`).all(fromDate, toDate).map((row) => row.date));
  const upsertVacation = db.prepare(`
    INSERT INTO time_entries (
      user_id, date, dolazak, odlazak, pauza_odlazak, pauza_povratak, tip, napomena, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, 'godisnji', ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET
      dolazak = NULL,
      odlazak = NULL,
      pauza_odlazak = NULL,
      pauza_povratak = NULL,
      tip = 'godisnji',
      napomena = excluded.napomena,
      updated_at = datetime('now')
  `);

  const createdDates = [];
  runInTransaction(() => {
    const current = new Date(fromDate + 'T00:00:00');
    const end = new Date(toDate + 'T00:00:00');
    while (current <= end) {
      const isoDate = [current.getFullYear(), String(current.getMonth() + 1).padStart(2, '0'), String(current.getDate()).padStart(2, '0')].join('-');
      const day = current.getDay();
      const isWeekendDay = day === 0 || day === 6;
      const isHoliday = holidayDates.has(isoDate);
      if (!isWeekendDay && !isHoliday) {
        upsertVacation.run(targetUserId, isoDate, napomena || null);
        createdDates.push(isoDate);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  return res.json({
    message: `Godišnji odmor je spremljen za ${createdDates.length} radnih dana.`,
    dates: createdDates
  });
});

app.delete('/api/time-entries/:date', authRequired, (req, res, next) => {
  try {
    const date = req.params.date;
    if (!isValidDate(date)) {
      return res.status(400).json({ message: 'Neispravan datum unosa.' });
    }
    const targetUserId = resolveTargetUserId(req, req.query.userId);
    db.prepare(`DELETE FROM time_entries WHERE user_id = ? AND date = ?`).run(targetUserId, date);
    return res.json({ message: 'Unos je obrisan.' });
  } catch (error) {
    return next(error);
  }
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  if (error && error.message === 'Origin nije dopušten.') {
    return res.status(403).json({ message: 'Origin nije dopušten.' });
  }
  const status = error.status || 500;
  console.error(error);
  return res.status(status).json({ message: error.message || 'Došlo je do greške na serveru.' });
});

app.listen(PORT, () => {
  console.log(`Server sluša na http://localhost:${PORT}`);
});
