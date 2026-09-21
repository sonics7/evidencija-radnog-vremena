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

## Deployment na Render.com

Repozitorij sadrži `render.yaml` (Render Blueprint) koji automatski konfigurira sve potrebno:
- build: instalira ovisnosti za `server` i `client`, builda frontend (`client/dist`)
- start: `npm start --prefix server` – backend servira i API i gotov frontend na istom URL-u
- `NODE_ENV=production` – uključuje `secure` kolačiće (zahtijeva HTTPS, koji Render osigurava automatski)
- `JWT_SECRET` – generira se automatski kao tajna vrijednost

Trenutno je konfiguriran **besplatni (Free) plan** – bez plaćanja, ali bez trajnog diska (Persistent Disk), pa se SQLite baza i `ADMIN_PASSWORD.txt` brišu kod svakog redeploya (novi build, ručni redeploy, ili buđenje iz mirovanja ne briše bazu – samo pravi redeploy zbog izmjene koda). Dobro za testiranje; za stvarno svakodnevno korištenje s trajnim podacima preporučljivo je prijeći na **Starter** plan (~7$/mj) i dodati Persistent Disk s env varijablom `DATA_DIR=/var/data` (konfiguracija je pripremljena i može se vratiti u `render.yaml` po potrebi).

Postupak:
1. Napravi besplatni Render račun na [render.com](https://render.com) (može i preko GitHub prijave).
2. Poveži svoj GitHub račun s Renderom i odobri pristup repozitoriju.
3. U Render dashboardu odaberi **New +** → **Blueprint**, izaberi ovaj repozitorij – Render će očitati `render.yaml` i predložiti konfiguraciju.
4. Potvrdi kreiranje.
5. Nakon prvog uspješnog deploya, otvori **Logs** tab i pronađi ispisanu administratorsku lozinku.
6. Aplikacija je dostupna na URL-u koji Render dodijeli, npr. `https://evidencija-radnog-vremena.onrender.com` – radi na računalu i mobitelu, bilo gdje s internetskom vezom.

Napomena za besplatni plan: servis se uspava nakon ~15 min neaktivnosti, prvo sljedeće otvaranje traje do 30-ak sekundi dok se probudi.

Napomena: ako se u budućnosti frontend hostira na drugoj domeni odvojeno od backenda, potrebno je postaviti env varijablu `ALLOWED_ORIGIN` na backendu (npr. `ALLOWED_ORIGIN=https://moja-domena.com`) da CORS dopusti tu domenu.

## Mogući kasniji deployment

Aplikacija se kasnije može containerizirati i postaviti online, primjerice pomoću:
- **Docker**
- **VPS + Nginx**
- **Render** ili **Railway**

Za produkciju je preporučljivo:
- postaviti `JWT_SECRET` kroz environment varijable
- koristiti HTTPS
- servirati `client/dist` kroz backend ili zaseban web server
