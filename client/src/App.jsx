import { useEffect, useMemo, useState } from 'react';

const dayNames = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];
const monthNamesHr = ['Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj', 'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toMonthString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}.`;
}

function formatMonthTitle(date) {
  return date.toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
}

function timeToMinutes(value) {
  if (!value) return 0;
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
  const raw = timeToMinutes(entry.odlazak) - timeToMinutes(entry.dolazak);
  let pauza = 0;
  if (entry.pauza_odlazak && entry.pauza_povratak) {
    pauza = Math.max(0, timeToMinutes(entry.pauza_povratak) - timeToMinutes(entry.pauza_odlazak));
  }
  const extraPause = Math.max(0, pauza - 30);
  return Math.max(0, raw - extraPause);
}

function formatMinutes(minutes) {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return `${sign}${hours}:${pad(mins)}`;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function buildCalendarWeeks(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekdayIndex = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - firstWeekdayIndex);
  const lastWeekdayIndex = (lastDay.getDay() + 6) % 7;
  const endDate = new Date(year, month, lastDay.getDate() + (6 - lastWeekdayIndex));

  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

async function api(path, options = {}) {
  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  };

  if (config.body && typeof config.body !== 'string') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(path, config);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { message: text || 'Nepoznat odgovor servera.' };
  }

  if (!response.ok) {
    throw new Error(payload?.message || 'Zahtjev nije uspio.');
  }

  return payload;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type || 'info'}`}>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose}>×</button>
    </div>
  );
}

function AuthView({ onLogin, loading }) {
  const [password, setPassword] = useState('');

  const submitLogin = async (event) => {
    event.preventDefault();
    await onLogin({ password });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Evidencija radnog vremena</h1>
        <p className="muted">Jednostavno praćenje radnih sati, godišnjeg odmora i rada od kuće.</p>
        <form className="auth-form" onSubmit={submitLogin}>
          <label>
            Lozinka
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </label>
          <button type="submit" className="primary" disabled={loading}>{loading ? 'Prijava...' : 'Prijavi se'}</button>
        </form>
      </div>

    </div>
  );
}

function TimeField({ label, value, onChange, disabled, required }) {
  const handleChange = (event) => {
    const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    const formatted = digits.length >= 3 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    onChange(formatted);
  };

  const setNow = () => {
    const now = new Date();
    onChange(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  };

  return (
    <label>
      {label}
      <div className="time-field-row">
        <input
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
          title="Unesite vrijeme u 24-satnom formatu, npr. 08:00 ili 16:30"
          maxLength={5}
          value={value}
          disabled={disabled}
          required={required}
          onChange={handleChange}
        />
        <button type="button" className="mini now-btn" disabled={disabled} onClick={setNow}>Sada</button>
      </div>
    </label>
  );
}

function DayModal({ date, entry, onClose, onSave, onDelete, selectedUser, saving }) {
  const isAutoHoliday = entry?.tip === 'drzavni_praznik' && entry?.auto;
  const [form, setForm] = useState(() => ({
    tip: isAutoHoliday ? 'radni' : (entry?.tip || 'radni'),
    dolazak: entry?.dolazak || '',
    odlazak: entry?.odlazak || '',
    pauza_odlazak: entry?.pauza_odlazak || '',
    pauza_povratak: entry?.pauza_povratak || '',
    napomena: isAutoHoliday ? '' : (entry?.napomena || ''),
    rangeEnabled: false,
    fromDate: date,
    toDate: date
  }));

  useEffect(() => {
    if (['home_office', 'sluzbeni_put'].includes(form.tip)) {
      setForm((prev) => ({ ...prev, dolazak: '08:00', odlazak: '16:00', pauza_odlazak: '', pauza_povratak: '' }));
    }
    if (form.tip === 'godisnji') {
      setForm((prev) => ({ ...prev, dolazak: '', odlazak: '', pauza_odlazak: '', pauza_povratak: '' }));
    }
  }, [form.tip]);

  const submit = async (event) => {
    event.preventDefault();
    await onSave(form);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3>Unos za {formatDisplayDate(date)}</h3>
            <p className="muted">Korisnik: {selectedUser?.full_name || selectedUser?.username}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label>
            Tip dana
            <select value={form.tip} onChange={(event) => setForm((prev) => ({ ...prev, tip: event.target.value }))}>
              <option value="radni">Radni dan</option>
              <option value="godisnji">Godišnji odmor</option>
              <option value="home_office">Home Office</option>
              <option value="sluzbeni_put">Službeni put</option>
            </select>
          </label>
          {form.tip === 'godisnji' ? (
            <div className="range-box">
              <label className="checkbox-row">
                <input type="checkbox" checked={form.rangeEnabled} onChange={(event) => setForm((prev) => ({ ...prev, rangeEnabled: event.target.checked }))} />
                Primijeni na raspon datuma
              </label>
              {form.rangeEnabled && (
                <div className="range-grid">
                  <label>
                    Od
                    <input type="date" value={form.fromDate} onChange={(event) => setForm((prev) => ({ ...prev, fromDate: event.target.value }))} required />
                  </label>
                  <label>
                    Do
                    <input type="date" value={form.toDate} onChange={(event) => setForm((prev) => ({ ...prev, toDate: event.target.value }))} required />
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div className="time-grid">
              <TimeField
                label="Dolazak"
                value={form.dolazak}
                disabled={form.tip !== 'radni'}
                required={form.tip === 'radni'}
                onChange={(value) => setForm((prev) => ({ ...prev, dolazak: value }))}
              />
              <TimeField
                label="Odlazak"
                value={form.odlazak}
                disabled={form.tip !== 'radni'}
                required={form.tip === 'radni'}
                onChange={(value) => setForm((prev) => ({ ...prev, odlazak: value }))}
              />
              <TimeField
                label="Pauza odlazak"
                value={form.pauza_odlazak}
                disabled={form.tip !== 'radni'}
                onChange={(value) => setForm((prev) => ({ ...prev, pauza_odlazak: value }))}
              />
              <TimeField
                label="Pauza povratak"
                value={form.pauza_povratak}
                disabled={form.tip !== 'radni'}
                onChange={(value) => setForm((prev) => ({ ...prev, pauza_povratak: value }))}
              />
            </div>
          )}
          <label>
            Napomena
            <textarea rows="3" value={form.napomena} onChange={(event) => setForm((prev) => ({ ...prev, napomena: event.target.value }))} placeholder="Opcionalna napomena" />
          </label>
          <div className="modal-actions">
            {entry && !isAutoHoliday ? <button type="button" className="danger ghost" onClick={onDelete} disabled={saving}>Obriši unos</button> : <span />}
            <div className="action-group">
              <button type="button" className="ghost" onClick={onClose} disabled={saving}>Odustani</button>
              <button type="submit" className="primary" disabled={saving}>{saving ? 'Spremanje...' : 'Spremi'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminPanel({ users, holidays, onRefresh, onShowToast, loading, currentUserId }) {
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });

  const changeStatus = async (userId, status) => {
    const response = await api(`/api/users/${userId}/status`, { method: 'PATCH', body: { status } });
    onShowToast(response.message, 'success');
    await onRefresh();
  };

  const resetPassword = async (user) => {
    const response = await api(`/api/users/${user.id}/reset-password`, { method: 'POST' });
    onShowToast(`Privremena lozinka za ${user.username}: ${response.tempPassword}`, 'success');
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Jeste li sigurni da želite trajno izbrisati korisnika ${user.full_name} (${user.username})? Svi njegovi upisi radnog vremena bit će izbrisani.`)) {
      return;
    }
    const response = await api(`/api/users/${user.id}`, { method: 'DELETE' });
    onShowToast(response.message, 'success');
    await onRefresh();
  };

  const saveHoliday = async (event) => {
    event.preventDefault();
    const response = await api('/api/holidays', { method: 'POST', body: holidayForm });
    onShowToast(response.message, 'success');
    setHolidayForm({ date: '', name: '' });
    await onRefresh();
  };

  const deleteHoliday = async (date) => {
    const response = await api(`/api/holidays/${date}`, { method: 'DELETE' });
    onShowToast(response.message, 'success');
    await onRefresh();
  };

  return (
    <div className="admin-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>Korisnici</h2>
          <button type="button" className="ghost" onClick={onRefresh} disabled={loading}>Osvježi</button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Korisničko ime</th>
                <th>Ime i prezime</th>
                <th>Uloga</th>
                <th>Status</th>
                <th>Akcije</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isLastAdmin = user.role === 'admin' && users.filter((item) => item.role === 'admin').length <= 1;
                return (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name}</td>
                  <td>{user.role === 'admin' ? 'Admin' : 'Korisnik'}</td>
                  <td><span className={`badge status-${user.status}`}>{user.status === 'approved' ? 'Odobren' : user.status === 'pending' ? 'Na čekanju' : 'Odbijen'}</span></td>
                  <td>
                    <div className="table-actions">
                      {user.status !== 'approved' && <button type="button" className="mini" onClick={() => changeStatus(user.id, 'approved')}>Odobri</button>}
                      {user.status !== 'rejected' && <button type="button" className="mini" onClick={() => changeStatus(user.id, 'rejected')}>Odbij / deaktiviraj</button>}
                      {user.status !== 'pending' && user.role !== 'admin' && <button type="button" className="mini" onClick={() => changeStatus(user.id, 'pending')}>Vrati na čekanje</button>}
                      <button type="button" className="mini" onClick={() => resetPassword(user)}>Reset lozinke</button>
                      {!isSelf && !isLastAdmin && <button type="button" className="mini danger" onClick={() => deleteUser(user)}>Izbriši</button>}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Praznici</h2></div>
        <form className="holiday-form" onSubmit={saveHoliday}>
          <label>
            Datum
            <input type="date" value={holidayForm.date} onChange={(event) => setHolidayForm((prev) => ({ ...prev, date: event.target.value }))} required />
          </label>
          <label>
            Naziv praznika
            <input value={holidayForm.name} onChange={(event) => setHolidayForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </label>
          <button type="submit" className="primary">Spremi praznik</button>
        </form>
        <div className="holiday-list">
          {holidays.map((holiday) => (
            <div className="holiday-item" key={holiday.date}>
              <div>
                <strong>{formatDisplayDate(holiday.date)}</strong>
                <div className="muted small">{holiday.name}</div>
              </div>
              <button type="button" className="ghost danger" onClick={() => deleteHoliday(holiday.date)}>Ukloni</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileModal({ user, onClose, onSave, saving, defaultMonth, onShowToast }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [exportMonth, setExportMonth] = useState(defaultMonth);
  const [exportFormat, setExportFormat] = useState('excel');
  const [exporting, setExporting] = useState(false);
  const [exportYear, exportMonthIndex] = exportMonth.split('-').map((part, index) => (index === 1 ? Number(part) - 1 : Number(part)));
  const exportYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear - 2; year <= currentYear + 2; year += 1) {
      years.push(year);
    }
    return years;
  }, []);
  const updateExportMonth = (year, monthIndex) => {
    setExportMonth(`${year}-${pad(monthIndex + 1)}`);
  };
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    await onSave(fullName);
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    setChangingPassword(true);
    try {
      const response = await api('/api/auth/change-password', { method: 'POST', body: passwordForm });
      onShowToast?.(response.message, 'success');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      onShowToast?.(error.message, 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const downloadExport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`/api/export?month=${exportMonth}&format=${exportFormat}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Izvoz nije uspio.');
      }
      const blob = await response.blob();
      const extension = exportFormat === 'excel' ? 'xlsx' : 'pdf';
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Evidencija-${user.username}-${exportMonth}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      onShowToast?.(error.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h3>Moj profil</h3>
            <p className="muted">Korisničko ime: {user.username}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label>
            Ime i prezime
            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={3} />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Odustani</button>
            <button type="submit" className="primary" disabled={saving}>Spremi</button>
          </div>
        </form>
        <div className="profile-password">
          <h4>Promjena lozinke</h4>
          <form className="modal-form" onSubmit={submitPasswordChange}>
            <label>
              Trenutna lozinka
              <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))} required />
            </label>
            <label>
              Nova lozinka
              <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))} required minLength={6} />
            </label>
            <label>
              Potvrda nove lozinke
              <input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))} required minLength={6} />
            </label>
            <div className="modal-actions">
              <span />
              <button type="submit" className="primary" disabled={changingPassword}>{changingPassword ? 'Spremanje...' : 'Promijeni lozinku'}</button>
            </div>
          </form>
        </div>
        <div className="profile-export">
          <h4>Izvoz evidencije</h4>
          <p className="muted">Preuzmi mjesečni izvještaj u Excel ili PDF formatu.</p>
          <div className="export-controls">
            <label>
              Mjesec
              <div className="month-picker">
                <select value={exportMonthIndex} onChange={(event) => updateExportMonth(exportYear, Number(event.target.value))}>
                  {monthNamesHr.map((name, index) => (
                    <option key={name} value={index}>{name}</option>
                  ))}
                </select>
                <select value={exportYear} onChange={(event) => updateExportMonth(Number(event.target.value), exportMonthIndex)}>
                  {exportYearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </label>
            <label>
              Format
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="excel">Excel (.xlsx)</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <button type="button" className="primary" onClick={downloadExport} disabled={exporting}>
              {exporting ? 'Priprema...' : 'Preuzmi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [viewDate, setViewDate] = useState(() => new Date());
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('erv-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('erv-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  // Gumb "Administracija" je trenutno skriven na zahtjev korisnika, ali kod
  // ostaje netaknut - postavi na true ako je ponovno treba prikazati.
  const SHOW_ADMIN_TAB = false;
  const [activeTab, setActiveTab] = useState('calendar');
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [savingEntry, setSavingEntry] = useState(false);

  const monthString = useMemo(() => toMonthString(viewDate), [viewDate]);
  const entryMap = useMemo(() => Object.fromEntries(entries.map((entry) => [entry.date, entry])), [entries]);
  const holidayMap = useMemo(() => Object.fromEntries(holidays.map((holiday) => [holiday.date, holiday])), [holidays]);
  const weeks = useMemo(() => buildCalendarWeeks(viewDate), [viewDate]);
  const currentEntry = modalDate ? entryMap[modalDate] : null;

  const showToast = (message, type = 'info') => setToast({ message, type });
  const closeToast = () => setToast(null);

  const loadAdminData = async () => {
    const [usersResponse, holidaysResponse] = await Promise.all([api('/api/users'), api('/api/holidays')]);
    setUsers(usersResponse.users);
    setHolidays(holidaysResponse.holidays);
    if (!selectedUserId && usersResponse.users.length > 0) {
      const ownUser = usersResponse.users.find((item) => item.id === user?.id);
      if (ownUser) {
        setSelectedUserId(String(ownUser.id));
      }
    }
  };

  const loadCalendar = async (effectiveUserId = selectedUserId) => {
    if (!user) return;
    const params = new URLSearchParams({ month: monthString });
    if (user.role === 'admin' && effectiveUserId) {
      params.set('userId', effectiveUserId);
    }
    const response = await api(`/api/time-entries?${params.toString()}`);
    setEntries(response.entries);
    setSelectedUser(response.selectedUser);
    // Napomena: puni popis praznika (svi datumi) već se učitava jednom prilikom
    // prijave putem /api/holidays i drži se u stanju "holidays" - ne prepisujemo
    // ga ovdje mjesečno skraćenim popisom, jer bi to trajno "zaključalo" prikaz
    // praznika samo na mjesec u kojem se popis zadnji put promijenio.
  };

  const bootstrap = async () => {
    setAuthLoading(true);
    try {
      const session = await api('/api/auth/me');
      setUser(session.user);
    } catch (error) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!user) {
      setUsers([]);
      setEntries([]);
      setSelectedUser(null);
      setSelectedUserId('');
      return;
    }

    const run = async () => {
      setActionLoading(true);
      try {
        if (user.role === 'admin') {
          await loadAdminData();
        } else {
          const holidayResponse = await api('/api/holidays');
          setHolidays(holidayResponse.holidays);
          setSelectedUserId(String(user.id));
        }
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setActionLoading(false);
      }
    };

    run();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const effectiveUserId = user.role === 'admin' ? (selectedUserId || String(user.id)) : String(user.id);
    if (!effectiveUserId) return;

    const run = async () => {
      setActionLoading(true);
      try {
        await loadCalendar(effectiveUserId);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setActionLoading(false);
      }
    };

    run();
  }, [user, monthString, selectedUserId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const handleLogin = async (credentials) => {
    setActionLoading(true);
    try {
      const response = await api('/api/auth/login', { method: 'POST', body: credentials });
      setUser(response.user);
      showToast('Prijava uspješna.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };


  const handleLogout = async () => {
    setActionLoading(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setUser(null);
      showToast('Odjava uspješna.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const saveProfile = async (fullName) => {
    setSavingProfile(true);
    try {
      const response = await api('/api/auth/me', { method: 'PATCH', body: { fullName } });
      setUser(response.user);
      setProfileModalOpen(false);
      showToast('Profil je ažuriran.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const refreshAdminData = async () => {
    setActionLoading(true);
    try {
      await loadAdminData();
      await loadCalendar(selectedUserId || String(user.id));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const saveEntry = async (form) => {
    if (!modalDate) return;
    setSavingEntry(true);
    try {
      if (form.tip === 'godisnji' && form.rangeEnabled) {
        const response = await api('/api/time-entries/godisnji-range', {
          method: 'POST',
          body: { fromDate: form.fromDate, toDate: form.toDate, napomena: form.napomena, userId: selectedUserId }
        });
        showToast(response.message, 'success');
      } else {
        const response = await api(`/api/time-entries/${modalDate}`, { method: 'PUT', body: { ...form, userId: selectedUserId } });
        showToast(response.message, 'success');
      }
      setModalDate(null);
      await loadCalendar(selectedUserId || String(user.id));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async () => {
    if (!modalDate) return;
    setSavingEntry(true);
    try {
      const params = new URLSearchParams();
      if (selectedUserId) params.set('userId', selectedUserId);
      const query = params.toString();
      const response = await api(`/api/time-entries/${modalDate}${query ? `?${query}` : ''}`, { method: 'DELETE' });
      showToast(response.message, 'success');
      setModalDate(null);
      await loadCalendar(selectedUserId || String(user.id));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingEntry(false);
    }
  };

  const monthlySummary = useMemo(() => {
    const targetYear = viewDate.getFullYear();
    const targetMonth = viewDate.getMonth();
    let workedMinutes = 0;
    let vacationDays = 0;
    let homeOfficeDays = 0;
    let fundDays = 0;

    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day += 1) {
      const date = new Date(targetYear, targetMonth, day);
      const iso = toDateString(date);
      const entry = entryMap[iso];
      workedMinutes += calculateWorkedMinutes(entry);
      if (entry?.tip === 'godisnji') vacationDays += 1;
      if (entry?.tip === 'home_office') homeOfficeDays += 1;
      if (!isWeekend(date) && !holidayMap[iso]) fundDays += 1;
    }

    return {
      workedMinutes,
      vacationDays,
      homeOfficeDays,
      fundMinutes: fundDays * 480,
      diffMinutes: workedMinutes - (fundDays * 480)
    };
  }, [viewDate, entryMap, holidayMap]);

  if (authLoading) return <div className="center-message">Učitavanje...</div>;

  if (!user) {
    return (
      <>
        <Toast toast={toast} onClose={closeToast} />
        <button type="button" className="icon-button theme-toggle-floating" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Prebaci na svijetli način' : 'Prebaci na tamni način'} title={theme === 'dark' ? 'Svijetli način' : 'Tamni način'}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <AuthView onLogin={handleLogin} loading={actionLoading} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Toast toast={toast} onClose={closeToast} />
      <header className="topbar">
        <div>
          <h1>Evidencija radnog vremena</h1>
          <p className="muted">Prijavljeni korisnik: <strong>{user.full_name}</strong> ({user.username})</p>
        </div>
        <div className="topbar-actions">
          {user.role === 'admin' && SHOW_ADMIN_TAB && (
            <div className="tab-switcher">
              <button type="button" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => setActiveTab('calendar')}>Kalendar</button>
              <button type="button" className={activeTab === 'admin' ? 'active' : ''} onClick={() => setActiveTab('admin')}>Administracija</button>
            </div>
          )}
          <button type="button" className="icon-button theme-toggle-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Prebaci na svijetli način' : 'Prebaci na tamni način'} title={theme === 'dark' ? 'Svijetli način' : 'Tamni način'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button type="button" className="ghost" onClick={() => setProfileModalOpen(true)}>Moj profil</button>
          <button type="button" className="ghost" onClick={handleLogout}>Odjava</button>
        </div>
        <button type="button" className="hamburger-btn" onClick={() => setMobileMenuOpen((prev) => !prev)} aria-label="Izbornik" aria-expanded={mobileMenuOpen}>
          ☰
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="mobile-menu panel">
          {user.role === 'admin' && SHOW_ADMIN_TAB && (
            <div className="tab-switcher">
              <button type="button" className={activeTab === 'calendar' ? 'active' : ''} onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}>Kalendar</button>
              <button type="button" className={activeTab === 'admin' ? 'active' : ''} onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }}>Administracija</button>
            </div>
          )}
          <button type="button" className="icon-button theme-toggle-icon" onClick={() => { toggleTheme(); setMobileMenuOpen(false); }} aria-label={theme === 'dark' ? 'Prebaci na svijetli način' : 'Prebaci na tamni način'} title={theme === 'dark' ? 'Svijetli način' : 'Tamni način'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button type="button" className="ghost" onClick={() => { setProfileModalOpen(true); setMobileMenuOpen(false); }}>Moj profil</button>
          <button type="button" className="ghost" onClick={() => { handleLogout(); setMobileMenuOpen(false); }}>Odjava</button>
        </div>
      )}

      {activeTab === 'calendar' ? (
        <main className="content-stack">
          <section className="toolbar panel">
            <div className="month-nav">
              <button type="button" className="ghost" onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>← Prošli mjesec</button>
              <h2>{formatMonthTitle(viewDate)}</h2>
              <button type="button" className="ghost" onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>Sljedeći mjesec →</button>
            </div>
            <div className="toolbar-side">
              {user.role === 'admin' && (
                <label>
                  Pregled korisnika
                  <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                    {users.map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.username})</option>)}
                  </select>
                </label>
              )}
              <div className="selected-user-card">
                <span className="muted small">Aktivni prikaz</span>
                <strong>{selectedUser?.full_name || user.full_name}</strong>
              </div>
            </div>
          </section>

          <section className="calendar-panel panel">
            <div className="legend">
              <span><strong>Radni sati</strong> = radni dan + home office + službeni put + državni praznik</span>
              <span><strong>GO</strong> = godišnji odmor (računa se posebno kao 1 dan)</span>
              <span><strong>HO</strong> = home office, automatski 08:00–16:00</span>
              <span><strong>SP</strong> = službeni put, automatski 08:00–16:00</span>
              <span><strong>DP</strong> = državni praznik (rad), automatski 08:00–16:00</span>
            </div>
            <div className="calendar-grid">
              <div className="calendar-header week-sum-header">Tjedan</div>
              {dayNames.map((dayName) => <div key={dayName} className="calendar-header">{dayName}</div>)}
              {weeks.map((week) => {
                const weekMinutes = week.reduce((sum, day) => {
                  const iso = toDateString(day);
                  if (day.getMonth() !== viewDate.getMonth()) return sum;
                  return sum + calculateWorkedMinutes(entryMap[iso]);
                }, 0);

                return [
                  <div className="week-sum-cell" key={`sum-${toDateString(week[0])}`}>
                    <span className="small muted">Ukupno</span>
                    <strong>{formatMinutes(weekMinutes)}</strong>
                  </div>,
                  ...week.map((day) => {
                    const iso = toDateString(day);
                    const entry = entryMap[iso];
                    const holiday = holidayMap[iso];
                    const outsideMonth = day.getMonth() !== viewDate.getMonth();
                    const weekend = isWeekend(day);
                    const workedMinutes = calculateWorkedMinutes(entry);

                    return (
                      <button type="button" key={iso} className={`day-cell ${outsideMonth ? 'outside' : ''} ${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''}`} onClick={() => !outsideMonth && setModalDate(iso)} disabled={outsideMonth} title={holiday?.name || ''}>
                        <div className="day-top">
                          <span className="day-number">{day.getDate()}</span>
                          <div className="badge-group">
                            {holiday && <span className="badge badge-holiday">P</span>}
                            {weekend && <span className="badge badge-weekend">Vikend</span>}
                          </div>
                        </div>
                        {holiday && <div className="holiday-name">{holiday.name}</div>}
                        {entry ? (
                          <div className="entry-preview">
                            {entry.tip === 'godisnji' ? <div className="status-box go">GO</div> : entry.tip === 'home_office' ? <><div className="status-box ho">HO</div><div className="mini-line">08:00 - 16:00</div><div className="mini-line strong">{formatMinutes(workedMinutes)}</div></> : entry.tip === 'sluzbeni_put' ? <><div className="status-box sp">SP</div><div className="mini-line">08:00 - 16:00</div><div className="mini-line strong">{formatMinutes(workedMinutes)}</div></> : entry.tip === 'drzavni_praznik' ? <><div className="status-box dp">DP</div><div className="mini-line">08:00 - 16:00</div><div className="mini-line strong">{formatMinutes(workedMinutes)}</div></> : <><div className="mini-line">{entry.dolazak} - {entry.odlazak}</div>{entry.pauza_odlazak && entry.pauza_povratak && <div className="mini-line">Pauza {entry.pauza_odlazak} - {entry.pauza_povratak}</div>}<div className="mini-line strong">{formatMinutes(workedMinutes)}</div></>}
                          </div>
                        ) : <div className="empty-note">Klik za unos</div>}
                      </button>
                    );
                  })
                ];
              })}
            </div>
          </section>

          <section className="summary-grid">
            <div className="summary-card panel"><span className="muted small">Ukupno radni sati</span><strong>{formatMinutes(monthlySummary.workedMinutes)}</strong></div>
            <div className="summary-card panel"><span className="muted small">Korišteni godišnji</span><strong>{monthlySummary.vacationDays} dana</strong></div>
            <div className="summary-card panel"><span className="muted small">Korišteno HO</span><strong>{monthlySummary.homeOfficeDays} dana</strong></div>
            <div className="summary-card panel"><span className="muted small">Mjesečni fond sati</span><strong>{formatMinutes(monthlySummary.fundMinutes)}</strong></div>
            <div className="summary-card panel"><span className="muted small">Razlika (upisano - fond)</span><strong className={monthlySummary.diffMinutes < 0 ? 'negative' : 'positive'}>{formatMinutes(monthlySummary.diffMinutes)}</strong></div>
          </section>
        </main>
      ) : (
        <main className="content-stack">
          <AdminPanel users={users} holidays={holidays} onRefresh={refreshAdminData} onShowToast={showToast} loading={actionLoading} currentUserId={user.id} />
        </main>
      )}

      {modalDate && <DayModal date={modalDate} entry={currentEntry} onClose={() => setModalDate(null)} onSave={saveEntry} onDelete={deleteEntry} selectedUser={selectedUser || user} saving={savingEntry} />}
      {profileModalOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileModalOpen(false)}
          onSave={saveProfile}
          saving={savingProfile}
          defaultMonth={monthString}
          onShowToast={showToast}
        />
      )}
      <footer className="app-footer">Evidencija radnog vremena - Spar</footer>
    </div>
  );
}
