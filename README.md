# Implementacija blockchain sustava za kupoprodaju nekretnina pomoću pametnih ugovora

Diplomski rad – Fakultet elektrotehnike, računarstva i informacijskih tehnologija Osijek  
Sveučilište Josipa Jurja Strossmayera u Osijeku

**Autor:** Mislav Čačić

---

## Cilj diplomskog rada

Cilj diplomskog rada je osmisliti i razviti prototip decentraliziranog sustava za kupoprodaju nekretnina koji koristi blockchain tehnologiju i pametne ugovore (smart contracts) radi uklanjanja potrebe za posrednicima i povećanja sigurnosti transakcija. Student treba istražiti postojeće modele i pravni okvir Republike Hrvatske vezan uz prijenos vlasništva nad nekretninom, definirati uvjete koji moraju biti zadovoljeni prije izvršenja ugovora te razviti smart contract koji automatski izvršava transakciju kada su svi uvjeti ispunjeni (prodavatelj ima valjane dokumente, kupac raspolaže sredstvima).

Implementacija treba uključiti frontend sučelje koje omogućuje interakciju korisnika sa sustavom (prodavatelj i kupac), a izbor blockchain platforme (npr. Ethereum, Solana, Polkadot, Hyperledger Fabric i dr.) prepušten je studentu.

Na kraju rada potrebno je prikazati primjer simulirane transakcije i analizirati mogućnosti primjene blockchain tehnologije u stvarnim postupcima prijenosa vlasništva nad nekretninama, uz osvrt na tehnička i pravna ograničenja.

---

# Opis implementiranog prototipa

Razvijen je prototip decentralizirane aplikacije za kupoprodaju nekretnina temeljen na **Ethereum/EVM platformi**.

Za lokalni razvoj, deployment i testiranje koristi se **Hardhat lokalna Ethereum-kompatibilna blockchain mreža**.

Frontend prototipa koristi unaprijed definirane demonstracijske profile:

```text
Administrator
Prodavatelj
Kupac
Verifikator
```

Prodavatelj registrira nekretninu i predaje potrebnu dokumentaciju.

Verifikator pregledava dokumentaciju i svaki dokument zasebno potvrđuje ili odbija.

Nakon potpune verifikacije Prodavatelj može kreirati prodaju.

Kupac zatim može pregledati prodaju, zadovoljiti potrebne financijske uvjete i pokrenuti kupoprodaju.

Sustav omogućuje:

- registraciju nekretnina
- predaju dokumentacije povezane s nekretninom
- lokalnu off-chain pohranu izvornih datoteka dokumentacije
- izračun kriptografskih hash vrijednosti datoteka
- pohranu hash vrijednosti i URI adresa dokumenata na blockchainu
- pregled izvorne datoteke dokumenta putem URI-ja
- zasebnu provjeru svakog potrebnog dokumenta
- određivanje je li nekretnina spremna za prodaju
- kreiranje i otkazivanje prodaje
- provjeru uvjeta potrebnih za kupoprodaju
- provjeru raspoloživih sredstava kupca
- odobravanje ERC-20 sredstava escrow ugovoru
- automatsko izvršenje kupoprodaje kada su svi uvjeti zadovoljeni
- automatski prijenos simuliranih sredstava kupca prodavatelju
- automatski prijenos digitalnog vlasništva na kupca
- pregled aktivnih prodaja
- pregled vlastitih nekretnina
- pregled povijesti završenih i otkazanih prodaja
- neovisnu provjeru konačnog blockchain stanja

---

# Korištene tehnologije

| Tehnologija | Namjena |
|---|---|
| Ethereum / EVM | Odabrana blockchain platforma |
| Solidity | Implementacija pametnih ugovora |
| Hardhat | Lokalno blockchain razvojno i testno okruženje |
| Hardhat Ignition | Deployment pametnih ugovora |
| OpenZeppelin Contracts | Standardizirane i sigurnosno provjerene Solidity komponente |
| React | Frontend aplikacija |
| TypeScript | Razvoj frontend aplikacije i testova |
| ethers.js | Komunikacija frontenda s blockchainom |
| MetaMask | Povezivanje blockchain računa i potpisivanje transakcija |
| Vite | Razvojno i build okruženje za frontend |
| ERC-20 MockEUR | Simulacija financijskih sredstava |
| Node.js + Express | Lokalni off-chain servis za pohranu dokumentacije |
| Multer | Prihvat i spremanje PDF/JPG/PNG datoteka |
| CORS | Komunikacija frontenda i lokalnog document storage servisa |

> **Napomena:** Hardhat nije odabrana blockchain platforma, već razvojno i testno okruženje. Odabrana blockchain platforma je **Ethereum/EVM**.

---

# Arhitektura sustava

Osnovni tok komunikacije izgleda ovako:

```text
Korisnik
   ↓
React frontend
   ├── READ → Hardhat JSON-RPC
   ├── WRITE → MetaMask → Hardhat lokalna EVM mreža
   └── upload dokumenta → Document Storage Server
                                   ↓
                         HTTP URI dokumenta

Hardhat lokalna EVM mreža
   ↓
Solidity pametni ugovori
   ├── PropertyRegistry
   ├── RealEstateEscrow
   └── MockEUR
```

Frontend prikazuje podatke očitane s blockchaina i omogućuje korisniku pokretanje transakcija.

Operacije čitanja blockchain stanja izvode se izravno preko lokalnog Hardhat JSON-RPC providera.

Operacije koje mijenjaju blockchain stanje korisnik potpisuje putem MetaMaska.

Izvorne datoteke dokumentacije ne spremaju se izravno na blockchain.

Frontend datoteku šalje lokalnom Document Storage Serveru, koji vraća URI dokumenta.

Istodobno se iz sadržaja datoteke računa:

```text
keccak256
```

hash.

Pametni ugovor za svaki dokument zatim evidentira:

```text
documentHash
documentURI
verificationStatus
submitted
```

Blockchain predstavlja izvor istine za:

```text
digitalno vlasništvo
status dokumentacije
prodavatelja
kupca
aktivne i završene prodaje
MockEUR sredstva
uvjete kupoprodaje
```

---

# Off-chain pohrana dokumentacije

Izvorni PDF, PNG, JPG ili JPEG dokumenti ne spremaju se izravno na blockchain.

Takav pristup omogućuje da blockchain pohranjuje samo podatke potrebne za povezivanje i provjeru dokumenta, dok sama datoteka ostaje u zasebnom spremištu.

Za potrebe lokalnog prototipa implementiran je:

```text
frontend/document-storage-server.mjs
```

Document Storage Server.

Servis koristi:

```text
Node.js
Express
Multer
CORS
```

Uploadane datoteke spremaju se u lokalni direktorij:

```text
frontend/document-storage/
```

Direktorij je dodan u `.gitignore`, zbog čega se testni dokumenti ne pohranjuju u Git repozitorij.

Tok predaje dokumenta izgleda ovako:

```text
Prodavatelj odabire datoteku
        ↓
frontend računa keccak256 hash
        ↓
datoteka se šalje Document Storage Serveru
        ↓
server sprema izvornu datoteku
        ↓
server vraća documentURI
        ↓
frontend šalje:
documentHash + documentURI
        ↓
PropertyRegistry sprema podatke na blockchain
```

Primjer lokalnog URI-ja:

```text
http://127.0.0.1:3001/documents/<id-dokumenta>.jpg
```

Verifikator zatim može iz blockchain stanja pročitati:

```text
documentHash
documentURI
```

te klikom na:

```text
Pregledaj dokument
```

otvoriti stvarnu datoteku prije potvrde ili odbijanja.

Pametni ugovor koristi generički naziv:

```text
documentURI
```

i nije vezan uz određenu tehnologiju pohrane.

U naprednijoj implementaciji URI bi mogao upućivati na:

```text
IPFS
decentralizirano spremište
privatni dokumentni servis
drugi off-chain sustav
```

Lokalni Document Storage Server služi za jednostavnu demonstraciju takve arhitekture u okviru prototipa.

---

# Pametni ugovori

## PropertyRegistry

`PropertyRegistry` predstavlja blockchain registar nekretnina.

Pametni ugovor zadužen je za:

- registraciju nekretnina
- evidenciju katastarske općine
- evidenciju broja čestice
- evidenciju adrese nekretnine
- evidenciju trenutnog digitalnog vlasnika
- evidenciju dokumentacije
- provjeru statusa dokumentacije
- prijenos digitalnog vlasništva

Za svaku nekretninu u prototipu definirana su tri potrebna dokumenta:

1. zemljišnoknjižni izvadak
2. katastarski dokument
3. dokaz / osnova vlasništva

Ovaj popis predstavlja dokumentacijski model korišten u prototipu i ne predstavlja tvrdnju da su navedena tri dokumenta iscrpan popis dokumentacije potrebne u svakom stvarnom postupku kupoprodaje nekretnine u Republici Hrvatskoj.

Za svaki dokument pametni ugovor sprema:

```text
documentHash
documentURI
verificationStatus
submitted
```

`documentHash` predstavlja kriptografski hash sadržaja dokumenta.

`documentURI` predstavlja adresu dokumenta spremljenog izvan blockchaina.

Izvorna datoteka nije spremljena u Solidity ugovoru.

Svaki dokument može imati jedan od statusa:

```text
Pending
Verified
Rejected
```

Nekretnina je spremna za prodaju tek kada su:

```text
3/3 dokumenta predana
3/3 dokumenta potvrđena
```

Ako je barem jedan dokument odbijen, ukupna dokumentacija nekretnine dobiva status:

```text
Rejected
```

Ako dokumentacija još nije potpuno potvrđena:

```text
Pending
```

Nakon potvrde sva tri dokumenta:

```text
Verified
```

Trenutni digitalni vlasnik nekretnine evidentira se u atributu:

```text
digitalOwner
```

Prilikom registracije povezana blockchain adresa Prodavatelja postaje početni `digitalOwner`.

Nakon uspješne kupoprodaje `RealEstateEscrow` pokreće prijenos i `PropertyRegistry` mijenja digitalnog vlasnika na adresu Kupca.

---

## RealEstateEscrow

`RealEstateEscrow` upravlja procesom kupoprodaje.

Prodaju može kreirati Prodavatelj samo ako:

```text
- je trenutni digitalni vlasnik nekretnine
- dokumentacija nekretnine je potpuno potvrđena
- za istu nekretninu nema druge aktivne prodaje
```

Prije izvršenja kupoprodaje pametni ugovor provjerava sljedeće uvjete:

```text
Prodaja postoji
Prodaja je aktivna
Dokumentacija je valjana
Prodavatelj je trenutni digitalni vlasnik
Kupac nije prodavatelj
Kupac ima dovoljno MockEUR sredstava
Escrow ima dovoljan allowance
```

Frontend navedene uvjete Kupcu prikazuje u obliku checkliste.

Primjer:

```text
Prodaja postoji                  → Zadovoljeno
Prodaja je aktivna               → Zadovoljeno
Dokumentacija je valjana         → Zadovoljeno
Prodavatelj je vlasnik           → Zadovoljeno
Kupac nije prodavatelj           → Zadovoljeno
Kupac ima dovoljno sredstava     → Zadovoljeno
Allowance je dovoljan            → Zadovoljeno
```

Tek kada su svi uvjeti zadovoljeni:

```text
readyForPurchase = true
```

kupoprodaja može biti izvršena.

Kupac pokreće kupnju, nakon čega `RealEstateEscrow` automatski:

```text
1. preuzima potreban iznos MockEUR tokena od kupca
2. prenosi MockEUR sredstva prodavatelju
3. prenosi digitalno vlasništvo nekretnine na kupca
4. označava prodaju kao završenu
```

Navedene radnje izvode se u okviru blockchain transakcije.

Ako neki od potrebnih koraka ne može biti izvršen, transakcija se poništava.

Time se osigurava atomsko izvršenje kupoprodaje.

---

## MockEUR

`MockEUR` je ERC-20 token razvijen isključivo za potrebe simulacije financijskog dijela kupoprodaje.

Token nema stvarnu novčanu vrijednost.

Administrator može dodijeliti MockEUR sredstva Kupcu kako bi se mogao simulirati postupak kupoprodaje.

Kupac mora imati:

```text
dovoljan MockEUR saldo
```

i escrow pametnom ugovoru odobriti korištenje potrebnog iznosa:

```text
approve()
```

Prije odobravanja može vrijediti:

```text
buyerHasSufficientBalance = true
buyerHasSufficientAllowance = false
readyForPurchase = false
```

Nakon dovoljnog `approve()`:

```text
buyerHasSufficientAllowance = true
readyForPurchase = true
```

ako su zadovoljeni i svi ostali uvjeti.

---

# Uloge u sustavu

Prototip razlikuje četiri demonstracijske uloge:

```text
Administrator
Prodavatelj
Kupac
Verifikator
```

---

## Administrator

Administrator ima pregled ukupnog stanja sustava i upravlja simuliranim MockEUR sredstvima.

Administrator može:

```text
- pregledavati sve registrirane nekretnine
- pregledavati aktivne prodaje
- pregledavati povijest prodaja
- dodjeljivati MockEUR sredstva korisnicima
- pregledavati globalno stanje sustava
```

Administrator ne potvrđuje dokumentaciju.

Administrator ne izvršava ručni prijenos vlasništva.

Prijenos digitalnog vlasništva izvršava escrow pametni ugovor kada su uvjeti kupoprodaje zadovoljeni.

---

## Verifikator

Verifikator predstavlja pouzdani vanjski autoritet koji provjerava dokumentaciju.

Za svaki predani dokument može pregledati:

```text
status dokumenta
documentHash
documentURI
```

Verifikator može kliknuti:

```text
Pregledaj dokument
```

i otvoriti stvarnu datoteku dokumenta.

Nakon pregleda dokument može zasebno:

```text
- potvrditi
- odbiti
```

Blockchain samostalno ne može utvrditi pravnu valjanost vanjskog pravnog dokumenta.

Zbog toga Verifikator u prototipu predstavlja pouzdani vanjski izvor podataka, odnosno oblik oracle mehanizma.

Nekretnina postaje spremna za prodaju tek nakon potvrde sva tri dokumenta.

---

## Prodavatelj

Prodavatelj može:

```text
- registrirati nekretninu
- predati potrebnu dokumentaciju
- pratiti status dokumentacije
- pregledavati vlastite nekretnine
- pregledavati hash i URI dokumentacije
- otvoriti predane dokumente
- kreirati prodaju
- otkazati aktivnu prodaju
- pregledavati aktivne prodaje
- pregledavati povijest prodaja
- pratiti stanje MockEUR računa
```

Prodaja se može kreirati samo za nekretninu čija je dokumentacija u potpunosti potvrđena.

---

## Kupac

Kupac može:

```text
- pregledavati dostupne prodaje
- pregledavati uvjete kupoprodaje
- pregledavati stanje MockEUR računa
- odobriti sredstva escrow ugovoru
- izvršiti kupnju
- pregledavati nekretnine u svom digitalnom vlasništvu
- pregledavati povijest završenih kupnji
```

Kupac ne može kupiti vlastitu nekretninu.

Pametni ugovor provjerava:

```text
Kupac nije prodavatelj
```

prije izvršenja transakcije.

---

# Struktura projekta

Repozitorij sadrži dvije glavne cjeline:

```text
blockchain/
frontend/
```

`blockchain/` sadrži:

```text
- Solidity pametne ugovore
- Hardhat konfiguraciju
- Hardhat Ignition deployment modul
- automatizirane testove pametnih ugovora
```

`frontend/` sadrži:

```text
- React + TypeScript frontend aplikaciju
- komunikaciju s blockchainom putem ethers.js
- korisnička sučelja za sve demonstracijske uloge
- funkcionalnosti registracije, prodaje i kupnje
- document-storage-server.mjs
- lokalnu off-chain pohranu dokumenata
- check-state.mjs skriptu za neovisnu provjeru blockchain stanja
```

Direktorij:

```text
frontend/document-storage/
```

koristi se za lokalne uploadane datoteke i ignoriran je putem `.gitignore` datoteke.

---

# Pokretanje projekta

## Preduvjeti

Za pokretanje projekta potrebno je imati instalirano:

```text
Node.js
npm
MetaMask ekstenziju za web preglednik
Git
```

---

## Kloniranje repozitorija

```bash
git clone https://github.com/MislavCacic/Masters-Thesis.git blockchain-real-estate
cd blockchain-real-estate
```

Glavna verzija aplikacije s unaprijed definiranim demonstracijskim ulogama nalazi se na grani:

```text
main
```

Prebacivanje na `main`:

```bash
git checkout main
```

---

# Instalacija ovisnosti

Ovisnosti je potrebno instalirati prije prvog pokretanja projekta.

## Blockchain

Iz root direktorija projekta:

```bash
cd blockchain
npm install
```

Nakon toga:

```bash
cd ..
```

---

## Frontend

Iz root direktorija projekta:

```bash
cd frontend
npm install
```

Nakon toga:

```bash
cd ..
```

---

# Pokretanje aplikacije

Za potpuno pokretanje aplikacije koriste se **četiri odvojena terminala**.

Tri procesa ostaju aktivna tijekom korištenja aplikacije:

```text
Hardhat node
Document Storage Server
Vite frontend
```

Hardhat Ignition deployment izvršava se zasebno nakon pokretanja lokalnog blockchain nodea.

---

## Terminal 1 – pokretanje lokalne blockchain mreže

Iz root direktorija projekta:

```bash
cd blockchain
npx hardhat node
```

Hardhat pokreće lokalnu Ethereum-kompatibilnu blockchain mrežu.

RPC adresa:

```text
http://127.0.0.1:8545
```

Chain ID:

```text
31337
```

**Terminal 1 potrebno je ostaviti pokrenut tijekom cijelog korištenja aplikacije.**

Hardhat u terminalu ispisuje lokalne testne račune i njihove privatne ključeve.

---

## Terminal 2 – deployment pametnih ugovora

Dok je Terminal 1 aktivan, otvoriti novi terminal.

Iz root direktorija projekta:

```bash
cd blockchain
npx hardhat ignition deploy ignition/modules/RealEstateSystem.ts --network localhost --reset
```

Deployment uključuje:

```text
MockEUR
PropertyRegistry
RealEstateEscrow
```

te dodjelu potrebnih blockchain uloga.

Nakon uspješnog deploymenta Terminal 2 ne mora ostati aktivan.

---

## Terminal 3 – pokretanje Document Storage Servera

Otvoriti treći terminal.

Iz root direktorija projekta:

```bash
cd frontend
npm run dev:storage
```

Server se pokreće na:

```text
http://127.0.0.1:3001
```

Provjera rada:

```text
http://127.0.0.1:3001/health
```

Očekivani odgovor:

```json
{
  "status": "ok",
  "service": "real-estate-document-storage"
}
```

Dokumenti su nakon uploada dostupni putem URL-a oblika:

```text
http://127.0.0.1:3001/documents/<naziv-datoteke>
```

Podržani formati:

```text
PDF
PNG
JPG
JPEG
```

Maksimalna veličina pojedine datoteke:

```text
10 MB
```

**Terminal 3 potrebno je ostaviti aktivan tijekom korištenja funkcionalnosti dokumentacije.**

---

## Terminal 4 – pokretanje frontend aplikacije

Otvoriti četvrti terminal.

Iz root direktorija projekta:

```bash
cd frontend
npm run dev
```

Vite će prikazati adresu aplikacije, primjerice:

```text
http://localhost:5173
```

Ako je port zauzet, Vite može koristiti drugi lokalni port.

Document Storage Server dopušta komunikaciju s lokalnom frontend aplikacijom na `localhost` ili `127.0.0.1`.

Adresu frontenda potrebno je otvoriti u pregledniku u kojem je instaliran MetaMask.

---

# Redoslijed pokretanja

Kod svakog novog pokretanja sustava koristiti sljedeći redoslijed:

```text
1. Terminal 1
   cd blockchain
   npx hardhat node

2. Terminal 2
   cd blockchain
   npx hardhat ignition deploy ignition/modules/RealEstateSystem.ts --network localhost --reset

3. Terminal 3
   cd frontend
   npm run dev:storage

4. Terminal 4
   cd frontend
   npm run dev

5. Otvoriti frontend u pregledniku

6. Povezati MetaMask s Hardhat Local mrežom

7. Odabrati odgovarajući testni račun
```

> **Važno:** Ponovnim pokretanjem Hardhat nodea od početka resetira se lokalno blockchain stanje. Nakon novog pokretanja nodea potrebno je ponovno izvršiti deployment pametnih ugovora.

Datoteke spremljene u lokalnom `document-storage/` direktoriju mogu ostati na disku nakon resetiranja blockchaina, ali više nisu povezane s novim blockchain stanjem.

Po potrebi se mogu ručno obrisati.

---

# MetaMask konfiguracija

U MetaMask je potrebno dodati lokalnu Hardhat mrežu.

Koristiti sljedeće podatke:

```text
Network name:
Hardhat Local

RPC URL:
http://127.0.0.1:8545

Chain ID:
31337

Currency symbol:
ETH
```

---

# Testni računi

Pokretanjem:

```bash
npx hardhat node
```

Hardhat automatski generira lokalne testne račune i u terminalu prikazuje njihove adrese i privatne ključeve.

Za ovaj prototip koriste se prva četiri Hardhat računa:

```text
Account #0 → Administrator
Account #1 → Prodavatelj
Account #2 → Kupac
Account #3 → Verifikator
```

Adrese standardnih računa:

```text
Administrator – Account #0
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266


Prodavatelj – Account #1
0x70997970C51812dc3A010C7d01b50e0d17dc79C8


Kupac – Account #2
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC


Verifikator – Account #3
0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

Za korištenje računa potrebno je u MetaMask uvesti odgovarajući privatni ključ koji Hardhat prikaže u Terminalu 1.

> **VAŽNO:** Navedeni računi i privatni ključevi koriste se isključivo na lokalnoj Hardhat razvojnoj mreži. Ne predstavljaju stvarne Ethereum račune i ne smiju se koristiti za pohranu stvarnih sredstava.

---

# Predloženi scenarij testiranja prototipa

Kompletna simulacija kupoprodaje može se testirati sljedećim redoslijedom.

---

## 1. Registracija nekretnine

U MetaMask odabrati:

```text
Prodavatelj – Account #1
```

U aplikaciji otvoriti:

```text
Registracija
```

Unijeti podatke nove nekretnine i odabrati tri dokumenta korištena u prototipu:

```text
1. Zemljišnoknjižni izvadak
2. Katastarski dokument
3. Dokaz / osnova vlasništva
```

Za svaki dokument frontend:

```text
1. čita sadržaj odabrane datoteke
2. izračunava keccak256 hash
3. šalje datoteku Document Storage Serveru
4. prima documentURI
5. šalje documentHash + documentURI u PropertyRegistry
```

Prodavatelj u MetaMasku potvrđuje:

```text
1. registraciju nekretnine
2. predaju zemljišnoknjižnog izvatka
3. predaju katastarskog dokumenta
4. predaju dokaza / osnove vlasništva
```

Povezani račun postaje početni:

```text
digitalOwner
```

registrirane nekretnine.

Ako je registracija nekretnine već završena, ali predaja dokumenata bude prekinuta, frontend tijekom aktualne sesije omogućuje nastavak predaje bez ponovne registracije iste nekretnine.

---

## 2. Provjera stanja prije verifikacije

Nakon registracije očekivano stanje je:

```text
Dokumenti predani:
3/3

Dokumenti potvrđeni:
0/3

Spremna za prodaju:
NE
```

Ako Prodavatelj otvori:

```text
Kreiranje prodaje
```

nekretnina se još ne smije moći ponuditi na prodaju.

---

## 3. Verifikacija dokumentacije

U MetaMask odabrati:

```text
Verifikator – Account #3
```

Otvoriti:

```text
Verifikacija
```

Za svaki dokument prikazuju se:

```text
naziv dokumenta
status
hash dokumenta
adresa dokumenta
```

Verifikator prije odluke može kliknuti:

```text
Pregledaj dokument
```

i otvoriti stvarnu PDF/JPG/PNG datoteku spremljenu izvan blockchaina.

Nakon pregleda dokument može:

```text
Potvrdi dokument
```

ili:

```text
Odbij dokument
```

Dokumente je moguće potvrđivati pojedinačno.

Međustanje:

```text
Dokumenti predani:
3/3

Dokumenti potvrđeni:
2/3

Spremna za prodaju:
NE
```

Tek nakon potvrde trećeg dokumenta očekuje se:

```text
Dokumenti predani:
3/3

Dokumenti potvrđeni:
3/3

Spremna za prodaju:
DA
```

Ukupni status nekretnine tada automatski postaje:

```text
Verified
```

---

## 4. Kreiranje prodaje

U MetaMask ponovno odabrati:

```text
Prodavatelj – Account #1
```

Otvoriti:

```text
Kreiranje prodaje
```

Odabrati potpuno potvrđenu nekretninu i unijeti prodajnu cijenu.

Primjer:

```text
120000 mEUR
```

Potvrditi blockchain transakciju.

Prodaja se nakon toga pojavljuje među aktivnim prodajama.

Očekivano stanje:

```text
Status:
Created
```

---

## 5. Dodjela MockEUR sredstava

U MetaMask odabrati:

```text
Administrator – Account #0
```

Otvoriti administrativni dio za MockEUR.

Unijeti adresu Kupca:

```text
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

Dodijeliti dovoljan iznos tokena.

Primjer:

```text
200000 mEUR
```

---

## 6. Provjera uvjeta kupoprodaje

U MetaMask odabrati:

```text
Kupac – Account #2
```

Otvoriti:

```text
Kupnja
```

Frontend prikazuje aktivnu prodaju Prodavatelja i checklist uvjeta koje vraća pametni ugovor.

Prije `approve()` transakcije očekuje se:

```text
Prodaja postoji                     → Zadovoljeno
Prodaja je aktivna                  → Zadovoljeno
Dokumentacija je valjana            → Zadovoljeno
Prodavatelj je vlasnik              → Zadovoljeno
Kupac nije prodavatelj              → Zadovoljeno
Kupac ima dovoljno sredstava        → Zadovoljeno
Allowance je dovoljan               → Nije zadovoljeno

Spremno za kupoprodaju: NE
```

Time se potvrđuje da samo raspoloživ saldo nije dovoljan za izvršenje kupoprodaje.

---

## 7. Odobravanje sredstava

Kupac klikne:

```text
Odobri sredstva
```

i potvrdi `approve()` transakciju u MetaMasku.

Nakon potvrde očekuje se:

```text
Allowance je dovoljan:
Zadovoljeno
```

i:

```text
Spremno za kupoprodaju:
DA
```

Tada su svi uvjeti pametnog ugovora ispunjeni.

---

## 8. Izvršenje kupoprodaje

Kupac klikne:

```text
Kupi nekretninu
```

i potvrdi transakciju.

`RealEstateEscrow` automatski:

```text
1. prenosi potrebna MockEUR sredstva od kupca
2. prenosi MockEUR sredstva prodavatelju
3. prenosi digitalno vlasništvo nekretnine na kupca
4. označava prodaju kao završenu
```

Očekivani rezultat:

```text
Prodaja:
Completed

Kupac:
novi digitalOwner

Allowance:
potrošen

Aktivna prodaja:
više se ne prikazuje
```

---

## 9. Provjera nakon kupnje

### Kupac

Na računu Kupca provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Kupljena nekretnina mora imati:

```text
digitalOwner = Kupac
```

Potvrđena dokumentacija ostaje vezana uz nekretninu.

Kupac može pregledati:

```text
documentHash
documentURI
```

i otvoriti prethodno potvrđene dokumente.

---

### Prodavatelj

Na računu Prodavatelja provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Prodavatelj više ne smije biti digitalni vlasnik prodane nekretnine.

Njegov MockEUR saldo mora biti uvećan za prodajnu cijenu.

---

### Administrator

Administrator može provjeriti:

```text
ukupan broj nekretnina
broj aktivnih prodaja
broj završenih prodaja
broj otkazanih prodaja
```

---

# Dodatni scenarij – odbijanje dokumenta

Verifikator može dokument odbiti dok je u statusu:

```text
Pending
```

Nakon odbijanja:

```text
status dokumenta:
Rejected
```

i ukupna dokumentacija nekretnine postaje odbijena.

Prodavatelj zatim može ponovno predati ispravljenu verziju odbijenog dokumenta.

Nova predaja može imati:

```text
novi documentHash
novi documentURI
```

Nakon ponovne predaje dokument se vraća u:

```text
Pending
```

status.

Ako Verifikator zatim potvrdi ispravljeni dokument, ukupna dokumentacija može ponovno postati valjana.

Već potvrđeni dokument nije moguće zamijeniti.

---

# Dodatni scenarij – otkazivanje prodaje

Prodavatelj može otkazati aktivnu prodaju prije kupnje.

Nakon otkazivanja:

```text
status prodaje → Cancelled

digitalOwner ostaje Prodavatelj

nekretnina ponovno postaje dostupna
za kreiranje nove prodaje

otkazana prodaja ostaje evidentirana
u blockchain povijesti
```

---

# Povijest kupoprodaja

Povijest omogućuje pregled završenih i otkazanih prodaja.

Podaci uključuju:

```text
ID prodaje
ID nekretnine
adresu nekretnine
katastarsku općinu
broj čestice
prodajnu cijenu
prodavatelja
kupca
status prodaje
trenutnog digitalnog vlasnika
```

Nakon završene kupoprodaje moguće je potvrditi da:

```text
sale.buyer
```

odgovara Kupcu koji je izvršio transakciju, dok:

```text
digitalOwner
```

predstavlja aktualnog digitalnog vlasnika nekretnine.

---

# Automatizirani testovi pametnih ugovora

Testovi se pokreću iz `blockchain` direktorija:

```bash
cd blockchain
npx hardhat test
```

Trenutna verzija sustava s podrškom za `documentURI` sadrži:

```text
44 passing
```

Testovima su obuhvaćeni pozitivni i negativni scenariji, uključujući:

```text
- dodjelu blockchain uloga
- registraciju nekretnine
- predaju dokumentacije
- spremanje documentHash vrijednosti
- spremanje documentURI vrijednosti
- dohvat URI-ja dokumenta s blockchaina
- zabranu praznog documentHasha
- zabranu praznog documentURI-ja
- zabranu predaje dokumenta korisniku koji nije vlasnik
- pojedinačnu verifikaciju dokumenata
- odbijanje dokumenta
- očuvanje URI-ja odbijenog dokumenta
- ponovnu predaju odbijenog dokumenta s novim hashom i URI-jem
- zabranu zamjene već potvrđenog dokumenta
- automatski ukupni status dokumentacije
- zabranu prodaje bez potpune dokumentacije
- prijenos digitalnog vlasništva
- zabranu neovlaštenog prijenosa
- kreiranje prodaje
- zabranu cijene 0
- zabranu prodaje tuđe nekretnine
- zabranu više aktivnih prodaja iste nekretnine
- otkazivanje prodaje
- zabranu otkazivanja tuđe prodaje
- provjeru stanja kupca
- provjeru allowancea
- zabranu kupnje bez dovoljno sredstava
- zabranu kupnje bez allowancea
- zabranu kupnje vlastite nekretnine
- automatsko izvršenje kupoprodaje
- automatski prijenos sredstava
- automatski prijenos digitalnog vlasništva
- atomic rollback u slučaju neuspjeha transakcije
- provjeru svih uvjeta kupoprodaje
- provjeru readyForPurchase statusa
```

Posljednja provjera:

```text
44 / 44 passing
```

---

# Production build frontend aplikacije

Production build provjerava se naredbom:

```bash
cd frontend
npm run build
```

Posljednja provjera završila je uspješno:

```text
vite v8.1.5

194 modules transformed

Production build:
uspješan
```

Vite može prikazati upozorenje:

```text
Some chunks are larger than 500 kB after minification.
```

To je upozorenje o veličini JavaScript bundlea, a ne build greška.

---

# Provjera Document Storage Servera

Sintaksa lokalnog storage servera može se provjeriti naredbom:

```bash
cd frontend
node --check document-storage-server.mjs
```

Ako naredba ne ispiše grešku, JavaScript datoteka je sintaktički ispravna.

Rad pokrenutog servisa može se provjeriti otvaranjem:

```text
http://127.0.0.1:3001/health
```

---

# Neovisna provjera blockchain stanja

Frontend sadrži skriptu:

```text
check-state.mjs
```

koja omogućuje direktno očitavanje blockchain stanja neovisno o korisničkom sučelju.

Nakon provedene simulacije može se pokrenuti:

```bash
cd frontend
node check-state.mjs
```

Skripta omogućuje provjeru podataka kao što su:

```text
Chain ID
broj registriranih nekretnina
broj evidentiranih prodaja
podaci o nekretninama
trenutni digitalni vlasnik
status nekretnine
prodavatelj
kupac
prodajna cijena
status prodaje
MockEUR stanje kupca
MockEUR stanje prodavatelja
```

Na ovaj način moguće je potvrditi da stanje prikazano u frontend aplikaciji odgovara stvarnom stanju pametnih ugovora na blockchainu.

---

# Testirani E2E scenarij s pregledom stvarnih dokumenata

Proveden je kompletan ručni E2E scenarij koji uključuje stvarne JPG datoteke.

Testirani tok:

```text
1. Prodavatelj registrira nekretninu
2. Prodavatelj odabire tri stvarne datoteke
3. Document Storage Server sprema datoteke izvan blockchaina
4. Frontend izračunava hash svake datoteke
5. PropertyRegistry sprema documentHash + documentURI
6. Verifikator vidi hash i URI svakog dokumenta
7. Verifikator otvara stvarni uploadani dokument
8. Verifikator potvrđuje dokumente jedan po jedan
9. Nakon 3/3 potvrđenih dokumenata nekretnina postaje spremna za prodaju
10. Prodavatelj kreira prodaju
11. Administrator dodjeljuje sredstva Kupcu
12. Kupac vidi checklist uvjeta
13. Kupac daje allowance escrow ugovoru
14. readyForPurchase postaje true
15. Kupac pokreće kupoprodaju
16. MockEUR sredstva prelaze Prodavatelju
17. digitalOwner prelazi na Kupca
18. Prodaja dobiva status Completed
19. Potvrđena dokumentacija ostaje vezana uz nekretninu
20. Dokumenti ostaju dostupni za pregled i nakon kupoprodaje
```

Primjer testirane kupoprodaje:

```text
Prodajna cijena:
120000 mEUR

Kupac prije kupnje:
200000 mEUR

Kupac nakon kupnje:
80000 mEUR

Prodavatelj nakon kupnje:
120000 mEUR
```

Matematička provjera:

```text
200000 - 120000 = 80000 mEUR
```

Blockchain je nakon transakcije potvrdio da je Kupac novi:

```text
digitalOwner
```

nekretnine.

Prodaja je dobila status:

```text
Completed
```

---

# Status testiranja prototipa

Kompletni ručni E2E scenarij uspješno je proveden.

```text
1. Prodavatelj registrira novu nekretninu                  ✅

2. Izvorne datoteke spremaju se off-chain                 ✅

3. Frontend izračunava hash svakog dokumenta              ✅

4. Blockchain sprema documentHash i documentURI           ✅

5. Prodavatelj predaje sva 3 dokumenta                    ✅

6. Prodaja prije verifikacije nije moguća                 ✅

7. Verifikator vidi hash i URI dokumenta                  ✅

8. Verifikator može otvoriti stvarnu datoteku             ✅

9. Verifikator potvrđuje dokumente pojedinačno            ✅

10. Nakon 2/3 dokumenata prodaja još nije moguća          ✅

11. Nakon 3/3 nekretnina postaje spremna                  ✅

12. Dokumenti ostaju dostupni nakon verifikacije          ✅

13. Prodavatelj kreira prodaju                            ✅

14. Administrator dodjeljuje MockEUR Kupcu                ✅

15. Kupac vidi checklist uvjeta                           ✅

16. Prije approve: allowance false / ready false          ✅

17. Kupac odobrava sredstva                               ✅

18. Nakon approve: svi uvjeti true / ready true           ✅

19. Kupac pokreće kupnju                                  ✅

20. Smart contract automatski završava transakciju        ✅

21. Kupac postaje novi digitalOwner                       ✅

22. Prodavatelj prima MockEUR                             ✅

23. Kupcu ostaje umanjeni saldo                           ✅

24. Prodaja dobiva status Completed                       ✅

25. Aktivna prodaja nestaje                               ✅

26. Povijest prikazuje završenu kupoprodaju               ✅

27. Dokumentacija ostaje vezana uz nekretninu             ✅

28. Novi vlasnik može pregledavati dokumentaciju          ✅

29. Backend testovi prolaze                               ✅

30. Frontend production build prolazi                     ✅
```

Uz ručni E2E scenarij:

```text
Hardhat testovi:
44 / 44 passing

Frontend production build:
uspješan

Document Storage Server:
sintaktička provjera uspješna
```

---

# Napomena o pravnom značenju prototipa

Ovaj sustav predstavlja **istraživački i razvojni prototip izrađen u sklopu diplomskog rada**.

Pojam:

```text
digitalOwner
```

predstavlja digitalno vlasništvo evidentirano unutar blockchain prototipa.

`digitalOwner` **ne predstavlja pravno valjani zemljišnoknjižni upis prava vlasništva u Republici Hrvatskoj**.

Prema postojećem pravnom sustavu Republike Hrvatske, stvarno pravo vlasništva nad nekretninom vezano je uz odgovarajući pravni temelj i upis u zemljišne knjige.

Pametni ugovor također ne može samostalno utvrditi pravnu valjanost dokumenta koji postoji izvan blockchain mreže.

`documentHash` omogućuje provjeru integriteta i identiteta sadržaja dokumenta, ali sam po sebi ne dokazuje njegovu pravnu valjanost.

`documentURI` predstavlja adresu s koje se dokument može dohvatiti, ali također ne predstavlja dokaz njegove pravne valjanosti.

Zbog toga je u prototipu uvedena uloga Verifikatora koja predstavlja pouzdani vanjski izvor informacija.

Trenutačna implementacija koristi lokalni Document Storage Server i testne dokumente.

U stvarnom sustavu dokumentacija vezana uz nekretnine može sadržavati:

```text
osobne podatke
identifikacijske podatke
podatke o vlasništvu
druge osjetljive podatke
```

Zbog toga bi u stvarnoj implementaciji trebalo riješiti:

```text
- autentikaciju
- autorizaciju
- enkripciju dokumentacije
- kontrolu pristupa
- sigurnu off-chain pohranu
- dostupnost dokumentacije
- trajnost URI resursa
```

Na javnom blockchainu i sam `documentURI` zapisan u pametnom ugovoru treba promatrati kao javno čitljiv podatak.

Za eventualnu stvarnu primjenu ovakvog sustava bilo bi potrebno riješiti pitanja poput:

```text
- integracije sa zemljišnim knjigama i katastrom
- pravnog priznanja blockchain zapisa
- pravnog priznanja pametnih ugovora
- identifikacije sudionika
- integracije s državnim institucijama
- pouzdane provjere vanjskih podataka
- zaštite osobnih podataka
- privatnosti dokumentacije
- sigurne off-chain pohrane dokumenata
- enkripcije i kontrole pristupa dokumentaciji
- dostupnosti i trajnosti URI resursa
- upravljanja blockchain ključevima
- regulatornih zahtjeva
```

Blockchain se stoga u ovom prototipu promatra kao tehnologija koja može automatizirati određene korake kupoprodaje i povećati transparentnost i sigurnost procesa, a ne kao trenutna pravna zamjena za zemljišne knjige Republike Hrvatske.

---

# Sažetak

Implementirani prototip demonstrira cjelokupni simulirani proces kupoprodaje nekretnine:

```text
Prodavatelj registrira nekretninu
        ↓
odabire dokumentaciju
        ↓
izvorne datoteke spremaju se off-chain
        ↓
izračunava se hash datoteke
        ↓
documentHash + documentURI
zapisuju se na blockchain
        ↓
Verifikator otvara dokumentaciju
        ↓
Verifikator potvrđuje dokumentaciju
        ↓
nakon 3/3 potvrđenih dokumenata
nekretnina je spremna za prodaju
        ↓
Prodavatelj kreira prodaju
        ↓
Administrator dodjeljuje
simulirana sredstva Kupcu
        ↓
Kupac pregledava uvjete
        ↓
Kupac odobrava sredstva
escrow ugovoru
        ↓
smart contract provjerava
sve uvjete
        ↓
readyForPurchase = true
        ↓
Kupac pokreće kupnju
        ↓
automatsko izvršenje kupoprodaje
        ↓
prijenos MockEUR sredstava
        ↓
prijenos digitalnog vlasništva
        ↓
Kupac postaje novi digitalOwner
        ↓
prodaja dobiva status Completed
        ↓
završena transakcija ostaje
evidentirana na blockchainu
```

Prototip demonstrira kombinaciju:

```text
on-chain logike
+
off-chain dokumentacije
```

Blockchain se koristi za:

```text
- hash dokumentacije
- URI dokumentacije
- status verifikacije
- vlasništvo unutar prototipa
- prodajne uvjete
- sredstva
- izvršenje transakcije
- povijest kupoprodaje
```

dok se stvarne datoteke dokumentacije pohranjuju izvan blockchaina.

Cilj prototipa je pokazati mogućnost korištenja Ethereum blockchain tehnologije i pametnih ugovora za automatizaciju kupoprodajnog procesa kada su svi unaprijed definirani uvjeti zadovoljeni.

---

## Autor

**Mislav Čačić**

Diplomski rad  
Sveučilište Josipa Jurja Strossmayera u Osijeku  
Fakultet elektrotehnike, računarstva i informacijskih tehnologija Osijek
