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

## Deployment na Oracle Cloud (Always Free)

Aplikacija je trenutno postavljena na besplatnom **Oracle Cloud "Always Free"** ARM VM-u, koristeći `Dockerfile` iz repozitorija (Node 22, bez potrebe za kompajliranjem nativnih modula – koristi se ugrađeni `node:sqlite`) te **Caddy** kao reverse proxy s automatskim HTTPS certifikatom.

Trenutna produkcija: **https://130-61-129-94.sslip.io** (SSH pristup: `ssh -i <ključ> ubuntu@130.61.129.94`)

Postupak (za buduću referencu / eventualno ponovno postavljanje):
1. Napravi Oracle Cloud "Always Free" račun i pokreni Compute instancu (Ubuntu, shape `VM.Standard.A1.Flex`, ARM64) unutar VCN-a s javnim IPv4.
2. U OCI **Security List** otvori ingress pravila za portove **80** i **443** (`0.0.0.0/0`).
3. **Bitno:** Oracle-ove Ubuntu slike imaju i vlastiti OS-razinski `iptables` firewall (odvojen od OCI Security Liste) koji po defaultu blokira sve osim SSH-a. Potrebno je dodati pravila i tamo: `sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT`, isto za 443, pa `sudo netfilter-persistent save`.
4. Instaliraj Docker Engine i Caddy (službeni apt repozitoriji).
5. `git clone` repozitorij na server, `docker build -t evidencija-app .`
6. Pokreni kontejner vezan samo na localhost (Caddy je jedina javna točka): 
   ```bash
   docker run -d --name evidencija --restart unless-stopped \
     -p 127.0.0.1:4000:4000 -v evidencija-data:/data \
     -e DATA_DIR=/data -e NODE_ENV=production -e JWT_SECRET=<slucajni-string> \
     evidencija-app
   ```
7. Postavi `/etc/caddy/Caddyfile`:
   ```
   <ip-s-crticama>.sslip.io {
     reverse_proxy localhost:4000
   }
   ```
   (npr. IP `130.61.129.94` → `130-61-129-94.sslip.io`). **sslip.io** je besplatna wildcard DNS usluga bez registracije – automatski razrješava na IP upisan u sam naziv domene. Caddy sam ishodi i obnavlja Let's Encrypt certifikat.
8. Nakon prvog pokretanja, provjeri logove kontejnera (`docker logs evidencija`) za ispisanu administratorsku lozinku.

Podaci su trajni zahvaljujući named Docker volumenu (`evidencija-data` mapiran na `/data`) – preživljavaju rebuild/redeploy kontejnera. I `docker` i `caddy` systemd servisi su omogućeni (`enabled`), a kontejner ima `--restart unless-stopped`, pa sve preživljava i restart same VM instance.

Ažuriranje aplikacije (nema automatskog CI/CD-a, ručni postupak na serveru):
```bash
cd ~/app && git pull
docker build -t evidencija-app .
docker stop evidencija && docker rm evidencija
docker run -d --name evidencija --restart unless-stopped \
  -p 127.0.0.1:4000:4000 -v evidencija-data:/data \
  -e DATA_DIR=/data -e NODE_ENV=production -e JWT_SECRET=<isti-secret-kao-prije> \
  evidencija-app
```

CORS je riješen automatski – backend dopušta zahtjeve s iste domene s koje se poslužuje.

## Mogući kasniji deployment

Aplikacija se alternativno može postaviti i pomoću:
- **Render.com** (repozitorij i dalje sadrži `render.yaml` Blueprint kao pripremljenu alternativu)
- **VPS + Nginx**
- Bilo koji drugi Docker-kompatibilan hosting (isti `Dockerfile` radi na amd64 i arm64)

Za produkciju je preporučljivo:
- postaviti `JWT_SECRET` kroz environment varijable
- koristiti HTTPS
- servirati `client/dist` kroz backend ili zaseban web server

