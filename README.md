# Evidencija radnog vremena

Aplikacija **Evidencija radnog vremena** sastoji se od dva dijela:
- **server** – Node.js + Express + SQLite (`better-sqlite3`)
- **client** – React aplikacija napravljena s Vite alatom

Sučelje je na hrvatskom jeziku, a autentikacija koristi JWT spremljen u `httpOnly` kolačić.

## Preduvjeti

- Node.js 18+
- npm

## Struktura projekta

- `server/` – REST API, SQLite baza (`server/data/app.db`)
- `client/` – React korisničko sučelje
- `server/ADMIN_PASSWORD.txt` – inicijalna administratorska lozinka (generira se pri prvom pokretanju servera)

## Instalacija i pokretanje

### Brzo pokretanje (jedan klik)

Dvoklikom na `Pokreni-aplikaciju.bat` u korijenu projekta automatski se pokreću i backend i frontend (svaki u zasebnom prozoru) te se otvara aplikacija u pregledniku na `http://localhost:5173`. Prozore ostavite otvorene dok koristite aplikaciju; zatvaranjem prozora se servisi gase.

### Ručno pokretanje

Otvorite **dva terminala**.

### Backend

```bash
cd server
npm install
npm start
```

Alternativno:

```bash
node index.js
```

Backend radi na `http://localhost:4000`.

Pri prvom pokretanju server će:
- kreirati bazu `server/data/app.db`
- kreirati tablice ako ne postoje
- upisati hrvatske praznike za 2025. i 2026.
- kreirati administratorski račun `admin`
- ispisati lozinku u konzolu i spremiti je u `server/ADMIN_PASSWORD.txt`

### Frontend

```bash
cd client
npm install
npm run dev
```

Frontend radi na `http://localhost:5173`.

Vite razvojni server prosljeđuje `/api` zahtjeve na backend na portu `4000`.

## Korištenje

1. Otvorite `http://localhost:5173`
2. Prijavite se s korisnikom `admin`
3. Lozinku pronađite u datoteci `server/ADMIN_PASSWORD.txt`
4. Administrator može odobriti korisnike, resetirati lozinke, deaktivirati račune, uređivati praznike i pregledavati kalendar svih korisnika
5. Obični korisnici mogu pregledavati i uređivati samo vlastite unose

## Produkcijski build frontenda

```bash
cd client
npm run build
```

## Mogući kasniji deployment

Aplikacija se kasnije može containerizirati i postaviti online, primjerice pomoću:
- **Docker**
- **VPS + Nginx**
- **Render** ili **Railway**

Za produkciju je preporučljivo:
- postaviti `JWT_SECRET` kroz environment varijable
- koristiti HTTPS
- servirati `client/dist` kroz backend ili zaseban web server
