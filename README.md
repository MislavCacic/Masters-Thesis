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

Aplikacija je implementirana kao **multi-user sustav**.

Obični blockchain računi nisu trajno podijeljeni na Kupca i Prodavatelja. Svaki obični račun u aplikaciji predstavlja profil:

```text
Korisnik
```

Isti Korisnik može u različitim transakcijama nastupati kao:

```text
Prodavatelj
```

ili:

```text
Kupac
```

ovisno o konkretnoj kupoprodaji.

Primjer:

```text
Transakcija 1:

Korisnik A → Prodavatelj
Korisnik B → Kupac


Transakcija 2:

Korisnik B → Prodavatelj
Korisnik A → Kupac
```

Na taj način aplikacija omogućuje realističniji višekorisnički model u kojem jedan blockchain račun tijekom vremena može kupovati i prodavati različite nekretnine.

Sustav omogućuje:

- registraciju nekretnina
- predaju dokumentacije povezane s nekretninom
- pohranu hash vrijednosti dokumenata na blockchainu
- zasebnu provjeru svakog potrebnog dokumenta
- određivanje je li nekretnina spremna za prodaju
- pregled nekretnina u digitalnom vlasništvu korisnika
- kreiranje prodaje vlastite nekretnine
- otkazivanje vlastite aktivne prodaje
- pregled prodaja drugih korisnika dostupnih za kupnju
- provjeru uvjeta potrebnih za kupoprodaju
- provjeru raspoloživih sredstava kupca
- odobravanje ERC-20 sredstava escrow ugovoru
- automatsko izvršenje kupoprodaje kada su svi uvjeti zadovoljeni
- automatski prijenos simuliranih sredstava kupca prodavatelju
- automatski prijenos digitalnog vlasništva na kupca
- ponovno stavljanje kupljene nekretnine na prodaju
- pregled aktivnih prodaja
- pregled vlastitih nekretnina
- pregled vlastitih završenih prodaja
- pregled vlastitih završenih kupnji
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

> **Napomena:** Hardhat nije odabrana blockchain platforma, već razvojno i testno okruženje. Odabrana blockchain platforma je **Ethereum/EVM**.

---

# Arhitektura sustava

Osnovni tok komunikacije izgleda ovako:

```text
Korisnik
   ↓
React frontend
   ↓
ethers.js
   ↓
MetaMask
   ↓
Ethereum JSON-RPC
   ↓
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

Na taj način blockchain, a ne frontend aplikacija, predstavlja izvor istine za:

```text
digitalno vlasništvo
status dokumentacije
aktivne i završene prodaje
kupca
prodavatelja
MockEUR sredstva
uvjete kupoprodaje
```

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

Datoteke se ne pohranjuju izravno na blockchain.

Frontend iz datoteka izračunava kriptografske hash vrijednosti koje se zatim pohranjuju u pametni ugovor.

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

Trenutni digitalni vlasnik nekretnine evidentira se u atributu:

```text
digitalOwner
```

Prilikom registracije povezana blockchain adresa postaje početni `digitalOwner`.

Nakon uspješne kupoprodaje pametni ugovor automatski mijenja `digitalOwner` s adrese prodavatelja na adresu kupca.

---

## RealEstateEscrow

`RealEstateEscrow` upravlja procesom kupoprodaje.

Prodaju može kreirati samo korisnik koji:

```text
- jest trenutni digitalni vlasnik nekretnine
- ima potpuno potvrđenu dokumentaciju
- nema drugu aktivnu prodaju za istu nekretninu
```

Prije izvršenja kupoprodaje smart contract provjerava sljedeće uvjete:

```text
Prodaja postoji
Prodaja je aktivna
Dokumentacija je valjana
Prodavatelj je trenutni digitalni vlasnik
Kupac nije prodavatelj
Kupac ima dovoljno MockEUR sredstava
Escrow ima dovoljan allowance
```

Frontend prikazuje navedene uvjete korisniku koji želi kupiti nekretninu u obliku checkliste.

Tek kada su svi uvjeti zadovoljeni:

```text
readyForPurchase = true
```

kupoprodaja može biti izvršena.

Kupac zatim pokreće kupnju, nakon čega `RealEstateEscrow` automatski:

```text
1. preuzima potreban iznos MockEUR tokena od kupca
2. prenosi MockEUR sredstva prodavatelju
3. prenosi digitalno vlasništvo nekretnine na kupca
4. označava prodaju kao završenu
```

Navedene radnje predstavljaju jednu blockchain transakciju.

Ako neki od potrebnih koraka ne može biti izvršen, cijela transakcija se poništava.

Time je osigurano atomsko izvršenje kupoprodaje.

---

## MockEUR

`MockEUR` je ERC-20 token razvijen isključivo za potrebe simulacije financijskog dijela kupoprodaje.

Token nema stvarnu novčanu vrijednost.

Administrator može dodijeliti MockEUR sredstva bilo kojem korisničkom blockchain računu.

Kada određeni Korisnik želi kupiti nekretninu, mora imati:

```text
dovoljan MockEUR saldo
```

i zatim escrow pametnom ugovoru odobriti korištenje potrebnog iznosa tokena:

```text
approve()
```

Tek nakon toga može biti zadovoljen uvjet:

```text
buyerHasSufficientAllowance = true
```

---

# Uloge u sustavu

Multi-user verzija sustava razlikuje tri osnovna frontend profila:

```text
Administrator
Verifikator
Korisnik
```

Kupac i Prodavatelj nisu trajni korisnički profili.

Oni predstavljaju uloge Korisnika unutar konkretne kupoprodajne transakcije.

---

## Administrator

Administrator ima pregled ukupnog stanja sustava i upravlja simuliranim MockEUR sredstvima.

Administrator može:

```text
- pregledavati sve registrirane nekretnine
- pregledavati sve aktivne prodaje
- pregledavati povijest kupoprodaja
- dodjeljivati MockEUR sredstva korisnicima
- pregledavati globalnu statistiku sustava
```

Administrator ne potvrđuje dokumentaciju.

Administrator ne izvršava ručni prijenos vlasništva.

Administrator kroz svoje korisničko sučelje ne nastupa kao kupac ili prodavatelj.

---

## Verifikator

Verifikator predstavlja pouzdani vanjski autoritet koji provjerava dokumentaciju.

Verifikator može svaki dokument zasebno:

```text
- potvrditi
- odbiti
```

Blockchain samostalno ne može utvrditi je li vanjski pravni dokument valjan.

Zbog toga Verifikator u prototipu predstavlja vanjski pouzdani izvor podataka, odnosno oblik blockchain oracle mehanizma.

Nekretnina postaje spremna za prodaju tek nakon što Verifikator potvrdi sva tri obvezna dokumenta.

---

## Korisnik

Svaki obični blockchain račun koji nema administratorsku ili verifikatorsku ulogu u frontend aplikaciji prikazuje se kao:

```text
Korisnik
```

Korisnik može:

```text
- registrirati nekretninu
- predati potrebnu dokumentaciju
- pratiti status dokumentacije
- pregledavati vlastite nekretnine
- kreirati prodaju vlastite nekretnine
- otkazati vlastitu aktivnu prodaju
- pregledavati vlastite aktivne prodaje
- pregledavati aktivne prodaje drugih korisnika
- pregledavati uvjete kupoprodaje
- pregledavati stanje MockEUR računa
- odobriti sredstva escrow ugovoru
- kupiti nekretninu drugog korisnika
- postati novi digitalni vlasnik kupljene nekretnine
- ponovno ponuditi kupljenu nekretninu na prodaju
- pregledavati vlastite završene prodaje
- pregledavati vlastite završene kupnje
- pregledavati povijest svojih transakcija
```

Kada Korisnik kreira prodaju vlastite nekretnine, u toj konkretnoj transakciji nastupa kao:

```text
Prodavatelj
```

Kada Korisnik kupuje nekretninu drugog korisnika, u toj konkretnoj transakciji nastupa kao:

```text
Kupac
```

Isti račun može u različitim transakcijama imati obje uloge.

---

# Multi-user model

Profil običnog korisnika ne određuje se prema unaprijed definiranoj adresi.

Frontend provjerava posebne blockchain uloge:

```text
DEFAULT_ADMIN_ROLE
        ↓
Administrator


VERIFIER_ROLE
        ↓
Verifikator


nema posebnu ulogu
        ↓
Korisnik
```

Za običnog Korisnika prava nad nekretninama i prodajama određuju se prema stvarnom blockchain stanju.

Primjeri:

```text
digitalOwner == povezana adresa
        ↓
nekretnina se prikazuje u "Moje nekretnine"
```

```text
sale.seller == povezana adresa
        ↓
prodaja se prikazuje u "Aktivne prodaje"
```

```text
sale.seller != povezana adresa
        ↓
aktivna prodaja se prikazuje korisniku u "Kupnja"
```

```text
sale.seller == povezana adresa
ILI
sale.buyer == povezana adresa
        ↓
transakcija se prikazuje u korisničkoj povijesti
```

Vlastita aktivna prodaja korisniku se ne prikazuje kao dostupna kupnja.

Smart contract dodatno provjerava:

```text
Kupac nije prodavatelj
```

čime je onemogućena kupnja vlastite nekretnine.

---

# Korisnička statistika

Na početnom ekranu običnog Korisnika prikazuju se blockchain podaci povezani s njegovom adresom:

```text
Moje nekretnine
Moje aktivne prodaje
Dostupne prodaje
Moje završene prodaje
Moje završene kupnje
```

Primjer:

```text
Moje nekretnine           2
Moje aktivne prodaje      1
Dostupne prodaje          3
Moje završene prodaje     1
Moje završene kupnje      2
```

`Dostupne prodaje` predstavljaju samo aktivne prodaje drugih korisnika koje povezani korisnik potencijalno može kupiti.

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
- korisnička sučelja za Administratora, Verifikatora i Korisnika
- funkcionalnosti kupnje i prodaje za svakog običnog Korisnika
- check-state.mjs skriptu za neovisnu provjeru blockchain stanja
```

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

Multi-user verzija nalazi se na grani:

```text
multi-user
```

Prebacivanje na multi-user verziju:

```bash
git checkout multi-user
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

Nakon instalacije:

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

Nakon instalacije:

```bash
cd ..
```

---

# Pokretanje aplikacije

Za rad aplikacije potrebno je koristiti **tri odvojena terminala**.

Redoslijed pokretanja je važan.

---

## Terminal 1 – pokretanje lokalne blockchain mreže

Iz root direktorija projekta:

```bash
cd blockchain
npx hardhat node
```

Hardhat će pokrenuti lokalnu Ethereum-kompatibilnu blockchain mrežu.

RPC adresa:

```text
http://127.0.0.1:8545
```

Chain ID:

```text
31337
```

**Terminal 1 potrebno je ostaviti pokrenut tijekom cijelog korištenja aplikacije.**

Hardhat će u terminalu ispisati lokalne testne račune i njihove privatne ključeve.

---

## Terminal 2 – deployment pametnih ugovora

Dok je Terminal 1 aktivan, otvoriti novi terminal.

Iz root direktorija projekta:

```bash
cd blockchain
npx hardhat ignition deploy ignition/modules/RealEstateSystem.ts --network localhost --reset
```

Naredba implementira potrebne pametne ugovore na lokalnu Hardhat mrežu.

Deployment uključuje:

```text
MockEUR
PropertyRegistry
RealEstateEscrow
```

te dodjelu odgovarajućih blockchain uloga.

Nakon uspješnog deploymenta Terminal 2 ne mora ostati aktivan.

---

## Terminal 3 – pokretanje frontend aplikacije

Otvoriti treći terminal.

Iz root direktorija projekta:

```bash
cd frontend
npm run dev
```

Vite će prikazati lokalnu adresu aplikacije, primjerice:

```text
http://localhost:5173
```

Adresu je potrebno otvoriti u pregledniku u kojem je instaliran MetaMask.

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
   npm run dev

4. Otvoriti frontend u pregledniku

5. Povezati MetaMask s Hardhat Local mrežom

6. Odabrati odgovarajući blockchain račun
```

> **Važno:** Ponovnim pokretanjem Hardhat nodea od početka resetira se lokalno blockchain stanje. Nakon novog pokretanja nodea potrebno je ponovno izvršiti deployment pametnih ugovora prije korištenja frontend aplikacije.

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

Za osnovnu demonstraciju mogu se koristiti:

```text
Account #0 → Administrator
Account #1 → Korisnik A
Account #2 → Korisnik B
Account #3 → Verifikator
```

Adrese standardnih računa:

```text
Administrator – Account #0
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266


Korisnik A – Account #1
0x70997970C51812dc3A010C7d01b50e0d17dc79C8


Korisnik B – Account #2
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC


Verifikator – Account #3
0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

Account #1 i Account #2 nisu trajno definirani kao Prodavatelj i Kupac.

Oba računa aplikacija prikazuje kao:

```text
Korisnik
```

Primjer:

```text
Korisnik A može prodavati Korisniku B

ali također:

Korisnik B može prodavati Korisniku A
```

I drugi Hardhat računi mogu se koristiti kao obični korisnici.

Ako nemaju posebnu administratorsku ili verifikatorsku blockchain ulogu, frontend ih automatski prikazuje kao:

```text
Korisnik
```

Za korištenje računa potrebno je u MetaMask uvesti odgovarajući privatni ključ koji Hardhat prikaže u Terminalu 1.

> **VAŽNO:** Navedeni računi i privatni ključevi koriste se isključivo na lokalnoj Hardhat razvojnoj mreži. Ne predstavljaju stvarne Ethereum račune i ne smiju se koristiti za pohranu stvarnih sredstava.

---

# Predloženi scenarij testiranja prototipa

Kompletna multi-user simulacija kupoprodaje može se testirati sljedećim redoslijedom.

---

## 1. Registracija nekretnine

U MetaMask odabrati običnog korisnika, primjerice:

```text
Korisnik A – Account #1
```

U aplikaciji otvoriti:

```text
Registracija
```

Unijeti podatke nove nekretnine i odabrati sva tri potrebna dokumenta.

Potrebni dokumenti:

```text
1. Zemljišnoknjižni izvadak
2. Katastarski dokument
3. Dokaz / osnova vlasništva
```

Korisnik zatim potvrđuje potrebne blockchain transakcije u MetaMasku.

Povezani blockchain račun postaje početni:

```text
digitalOwner
```

registrirane nekretnine.

---

## 2. Provjera prije verifikacije

Nakon registracije otvoriti:

```text
Kreiranje prodaje
```

Nekretnina se još ne smije moći ponuditi na prodaju jer dokumentacija još nije potvrđena.

Očekivano stanje:

```text
Dokumenti predani:
3/3

Dokumenti potvrđeni:
0/3

Spremna za prodaju:
NE
```

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

Za registriranu nekretninu trebaju biti prikazana tri dokumenta.

Dokumente potvrđivati jedan po jedan.

Moguće je provjeriti međustanje:

```text
Dokumenti predani:
3/3

Dokumenti potvrđeni:
2/3

Spremna za prodaju:
NE
```

Tek nakon:

```text
3/3 dokumenta predana
3/3 dokumenta potvrđena
```

nekretnina dobiva:

```text
Spremna za prodaju:
DA
```

---

# 4. Kreiranje prodaje

U MetaMask odabrati:

```text
Korisnik A – Account #1
```

Otvoriti:

```text
Kreiranje prodaje
```

Odabrati potvrđenu nekretninu i unijeti prodajnu cijenu.

Primjer:

```text
150000 mEUR
```

Potvrditi blockchain transakciju u MetaMasku.

Korisnik A u toj konkretnoj transakciji nastupa kao:

```text
Prodavatelj
```

Prodaja se nakon toga pojavljuje u:

```text
Aktivne prodaje
```

Njegova vlastita prodaja neće se prikazivati u njegovom panelu:

```text
Kupnja
```

---

# 5. Dodjela MockEUR sredstava

U MetaMask odabrati:

```text
Administrator – Account #0
```

Otvoriti:

```text
MockEUR
```

Unijeti Ethereum adresu korisnika koji će kupiti nekretninu.

Primjer:

```text
Korisnik B – Account #2

0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

Dodijeliti dovoljan iznos MockEUR tokena.

Primjer:

```text
200000 mEUR
```

Administrator može dodijeliti simulirana sredstva bilo kojem korisničkom računu.

---

# 6. Provjera uvjeta kupoprodaje

U MetaMask odabrati:

```text
Korisnik B – Account #2
```

Otvoriti:

```text
Kupnja
```

Korisniku B prikazuje se aktivna prodaja Korisnika A.

U toj konkretnoj transakciji:

```text
Korisnik A = Prodavatelj
Korisnik B = Kupac
```

Frontend prikazuje checklist uvjeta koje vraća smart contract.

Prije odobravanja sredstava očekivano stanje je:

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

Time se pokazuje da samo posjedovanje dovoljne količine MockEUR tokena nije dovoljno za izvršenje transakcije.

---

# 7. Odobravanje sredstava

Korisnik B klikne:

```text
Odobri sredstva
```

i potvrdi transakciju u MetaMasku.

Nakon potvrde očekuje se:

```text
Allowance je dovoljan → Zadovoljeno
```

te:

```text
Spremno za kupoprodaju: DA
```

Svi uvjeti tada moraju biti zadovoljeni.

---

# 8. Izvršenje kupoprodaje

Korisnik B klikne:

```text
Kupi nekretninu
```

i potvrdi blockchain transakciju.

`RealEstateEscrow` automatski izvršava kompletan postupak.

Očekivani rezultat:

```text
MockEUR sredstva Korisnika B se umanjuju

Korisnik A prima prodajnu cijenu

digitalOwner nekretnine prelazi
s Korisnika A na Korisnika B

Prodaja dobiva status:
Completed

Aktivna prodaja nestaje s popisa

Allowance se troši
```

---

# 9. Provjera nakon kupnje

## Korisnik B

Na računu Korisnika B moguće je provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Kupljena nekretnina mora biti prikazana kao nekretnina čiji je:

```text
digitalOwner = Korisnik B
```

---

## Korisnik A

Na računu Korisnika A moguće je provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Korisnik A više ne smije biti digitalni vlasnik prodane nekretnine.

Njegovo stanje MockEUR tokena mora biti uvećano za prodajnu cijenu.

---

## Administrator

Administrator može provjeriti:

```text
ukupan broj nekretnina
broj aktivnih prodaja
broj završenih prodaja
broj otkazanih prodaja
```

---

# Multi-user scenarij – zamjena uloga korisnika

Posebno je testiran scenarij u kojem ista dva korisnika u različitim transakcijama mijenjaju uloge.

Prva kupoprodaja može izgledati ovako:

```text
Korisnik A
→ Prodavatelj

Korisnik B
→ Kupac
```

Nakon uspješne kupnje:

```text
Korisnik B postaje digitalOwner nekretnine.
```

Korisnik B zatim može kupljenu nekretninu ponovno ponuditi na prodaju.

Sljedeća kupoprodaja može izgledati:

```text
Korisnik B
→ Prodavatelj

Korisnik A
→ Kupac
```

Time je potvrđeno da aplikacija nema trajnu podjelu običnih korisnika na Kupca i Prodavatelja.

Uloga proizlazi iz konkretne transakcije.

---

# Testirani scenarij ponovne prodaje

Tijekom E2E testiranja uspješno je izvršena ponovna prodaja već kupljene nekretnine.

Testirana transakcija:

```text
Nekretnina ID:
3

Prodajna cijena:
125000 mEUR

Prodavatelj:
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Kupac:
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

Prije kupnje:

```text
Kupac:
225000 mEUR

Prodavatelj:
275000 mEUR
```

Nakon kupnje:

```text
Kupac:
100000 mEUR

Prodavatelj:
400000 mEUR
```

Matematička provjera:

```text
225000 - 125000 = 100000 mEUR

275000 + 125000 = 400000 mEUR
```

Blockchain je nakon transakcije potvrdio:

```text
digitalOwner =
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

Prodaja je dobila status:

```text
Completed
```

Ovaj scenarij potvrđuje da račun koji je u prethodnoj kupoprodaji bio Kupac kasnije može postati Prodavatelj, dok prethodni Prodavatelj može postati Kupac.

---

# Dodatni scenarij – otkazivanje prodaje

Korisnik koji je kreirao aktivnu prodaju može je otkazati prije kupnje.

Nakon otkazivanja:

```text
status prodaje → Cancelled

digitalOwner ostaje prodavatelj

nekretnina ponovno postaje dostupna
za kreiranje nove prodaje

otkazana prodaja ostaje evidentirana
u blockchain povijesti
```

Samo račun koji odgovara adresi:

```text
sale.seller
```

može otkazati konkretnu prodaju.

---

# Povijest kupoprodaja

Obični Korisnik u istoj povijesti vidi transakcije u kojima je bio:

```text
Prodavatelj
```

i transakcije u kojima je bio:

```text
Kupac
```

Transakcija se korisniku prikazuje ako vrijedi:

```text
sale.seller == povezana adresa
```

ili:

```text
sale.buyer == povezana adresa
```

Povijest prikazuje:

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

Ako je određena nekretnina nakon završene kupoprodaje naknadno ponovno prodana, trenutačni `digitalOwner` može biti različit od kupca evidentiranog u starijoj transakciji.

Time se istodobno čuva povijest pojedinih kupoprodaja i prikazuje aktualno blockchain stanje vlasništva.

---

# Automatizirani testovi pametnih ugovora

Testovi se pokreću iz `blockchain` direktorija:

```bash
cd blockchain
npx hardhat test
```

Trenutna verzija projekta sadrži:

```text
43 passing
```

Testovima su obuhvaćeni pozitivni i negativni scenariji, uključujući:

```text
- dodjelu blockchain uloga
- registraciju nekretnine
- predaju dokumentacije
- provjeru praznih i nepostojećih dokumenata
- pojedinačnu verifikaciju dokumenata
- odbijanje dokumenta
- ponovnu predaju odbijenog dokumenta
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
- provjeru uvjeta kupoprodaje
- provjeru readyForPurchase statusa
```

Posljednja provjera:

```text
43 / 43 passing
```

---

# Production build frontend aplikacije

Production build moguće je provjeriti naredbom:

```bash
cd frontend
npm run build
```

Posljednja provjera multi-user verzije završila je uspješno:

```text
vite v8.1.5

194 modules transformed

Production build:
uspješan
```

Vite može prikazati upozorenje da je pojedini JavaScript chunk veći od 500 kB.

To upozorenje nije build greška i ne utječe na funkcionalnost prototipa.

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
MockEUR stanja testnih računa
```

Na ovaj način moguće je potvrditi da stanje prikazano u frontend aplikaciji odgovara stvarnom stanju pametnih ugovora na blockchainu.

---

# Status testiranja multi-user prototipa

Kompletni ručni E2E multi-user scenarij uspješno je testiran.

```text
1. Administrator se prepoznaje kao poseban profil                 ✅

2. Verifikator se prepoznaje kao poseban profil                   ✅

3. Obični blockchain račun prepoznaje se kao Korisnik             ✅

4. Različiti obični računi dobivaju isti profil Korisnik          ✅

5. Korisnik vidi nekretnine prema digitalOwner adresi             ✅

6. Korisnik može registrirati nekretninu                          ✅

7. Korisnik može predati sva 3 dokumenta                          ✅

8. Prodaja prije potpune verifikacije nije moguća                 ✅

9. Verifikator potvrđuje dokumente pojedinačno                    ✅

10. Nakon 3/3 potvrđenih dokumenata nekretnina je spremna         ✅

11. Korisnik može kreirati prodaju vlastite nekretnine            ✅

12. Vlastita prodaja nije prikazana kao dostupna kupnja           ✅

13. Drugi Korisnik vidi aktivnu prodaju                           ✅

14. Smart contract prikazuje checklist uvjeta                     ✅

15. Prije approve: allowance false / ready false                  ✅

16. Korisnik odobrava sredstva escrow ugovoru                     ✅

17. Nakon approve: svi uvjeti true / ready true                   ✅

18. Korisnik pokreće kupnju                                       ✅

19. Smart contract automatski završava kupoprodaju                ✅

20. MockEUR sredstva prenose se prodavatelju                      ✅

21. Stanje kupca automatski se umanjuje                           ✅

22. Kupac postaje novi digitalOwner                               ✅

23. Prodaja dobiva status Completed                               ✅

24. Završena prodaja nestaje iz aktivnih prodaja                  ✅

25. Kupac vidi novu nekretninu u "Moje nekretnine"               ✅

26. Povijest se prikazuje s obje strane transakcije               ✅

27. Korisnik vidi svoje završene prodaje                          ✅

28. Korisnik vidi svoje završene kupnje                           ✅

29. Prethodni Kupac može naknadno postati Prodavatelj             ✅

30. Prethodni Prodavatelj može naknadno postati Kupac             ✅

31. Ponovna prodaja iste nekretnine uspješno je izvršena          ✅

32. Povijest pravilno čuva starije kupoprodaje                    ✅

33. Aktualni digitalOwner pravilno se prikazuje nakon nove prodaje ✅

34. Frontend radi bez aplikacijskih runtime grešaka               ✅
```

Uz ručni E2E test:

```text
Hardhat testovi:
43 / 43 passing

Frontend production build:
uspješan
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

Pametni ugovor također ne može samostalno utvrditi pravnu valjanost PDF dokumenta ili drugog podatka koji postoji izvan blockchain mreže.

Zbog toga je u prototipu uvedena uloga Verifikatora koja predstavlja pouzdani vanjski izvor informacija.

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
- upravljanja blockchain ključevima
- regulatornih zahtjeva
```

Blockchain se stoga u ovom prototipu promatra kao tehnologija koja može automatizirati određene korake kupoprodaje i povećati transparentnost i sigurnost procesa, a ne kao trenutna pravna zamjena za zemljišne knjige Republike Hrvatske.

---

# Sažetak

Implementirani multi-user prototip demonstrira cjelokupni simulirani proces kupoprodaje nekretnine:

```text
Korisnik registrira nekretninu
        ↓
predaje dokumentaciju
        ↓
Verifikator provjerava dokumentaciju
        ↓
Korisnik kao Prodavatelj kreira prodaju
        ↓
drugi Korisnik vidi dostupnu prodaju
        ↓
provjeravaju se sredstva potencijalnog Kupca
        ↓
Kupac odobrava sredstva escrow ugovoru
        ↓
smart contract provjerava sve uvjete
        ↓
automatsko izvršenje kupoprodaje
        ↓
prijenos MockEUR sredstava
        ↓
prijenos digitalnog vlasništva
        ↓
Kupac postaje novi digitalOwner
        ↓
završena transakcija ostaje evidentirana
        ↓
novi vlasnik može nekretninu ponovno prodavati
```

Glavna karakteristika multi-user verzije jest da obični korisnici nisu trajno određeni kao Kupac ili Prodavatelj.

Umjesto toga:

```text
Korisnik + vlastita nekretnina
        ↓
može nastupati kao Prodavatelj
```

i:

```text
Korisnik + prodaja drugog korisnika
        ↓
može nastupati kao Kupac
```

Isti korisnik tijekom vremena može sudjelovati u više transakcija i mijenjati svoju ulogu ovisno o konkretnoj kupoprodaji.

Time implementacija realnije modelira višekorisnički sustav kupoprodaje nekretnina.

Cilj prototipa je pokazati mogućnost korištenja Ethereum blockchain tehnologije i pametnih ugovora za automatizaciju kupoprodajnog procesa kada su svi unaprijed definirani uvjeti zadovoljeni.

---

## Autor

**Mislav Čačić**

Diplomski rad  
Sveučilište Josipa Jurja Strossmayera u Osijeku  
Fakultet elektrotehnike, računarstva i informacijskih tehnologija Osijek
