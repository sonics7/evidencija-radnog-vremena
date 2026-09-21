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

## Deployment na Railway.com

Aplikacija je trenutno postavljena na [Railway.com](https://railway.com) koristeći `Dockerfile` iz repozitorija (Node 22, bez potrebe za kompajliranjem nativnih modula – koristi se ugrađeni `node:sqlite`).

Postupak:
1. Napravi besplatni Railway račun (preko GitHub prijave) i poveži repozitorij putem Railway GitHub App-a.
2. Railway automatski prepoznaje `Dockerfile` i koristi ga za build i pokretanje.
3. U **Settings → Networking** klikni **Generate Domain** da dobiješ javni `*.up.railway.app` URL (ako već nije generiran).
4. Provjeri u **Settings → Deploy** da polja "Custom Build Command" i "Custom Start Command" budu **prazna** – u suprotnom Railway zaobilazi `Dockerfile` i koristi stariji, nekompatibilan način pokretanja.
5. Nakon prvog uspješnog deploya, otvori **Deploy Logs** i pronađi ispisanu administratorsku lozinku (redak "Lozinka: ...").
6. Aplikacija je dostupna na dodijeljenom URL-u, radi na računalu i mobitelu, bilo gdje s internetskom vezom.

Napomena: besplatni Railway plan nema trajni disk (Persistent Volume), pa se SQLite baza i `ADMIN_PASSWORD.txt` brišu kod svakog novog builda (push novog commita). Za trajne podatke potrebno je dodati Railway Volume i env varijablu `DATA_DIR` koja pokazuje na njegovu putanju.

CORS je riješen automatski – backend dopušta zahtjeve s iste domene s koje se poslužuje (nije potrebno ručno postavljati `ALLOWED_ORIGIN` osim ako frontend hostiraš na posebnoj domeni odvojeno od backenda).

## Mogući kasniji deployment

Aplikacija se alternativno može postaviti i pomoću:
- **Render.com** (repozitorij i dalje sadrži `render.yaml` Blueprint kao pripremljenu alternativu)
- **VPS + Nginx**

Za produkciju je preporučljivo:
- postaviti `JWT_SECRET` kroz environment varijable
- koristiti HTTPS
- servirati `client/dist` kroz backend ili zaseban web server

