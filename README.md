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

Sustav omogućuje:

- registraciju nekretnina
- predaju dokumentacije povezane s nekretninom
- pohranu hash vrijednosti dokumenata na blockchainu
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
| Hardhat | Lokalno blockchain, razvojno i testno okruženje |
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

Transakcije koje mijenjaju blockchain stanje korisnik potvrđuje svojim MetaMask računom.

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

Frontend iz datoteka izračunava hash vrijednosti koje se zatim pohranjuju u pametni ugovor.

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

---

## RealEstateEscrow

`RealEstateEscrow` upravlja procesom kupoprodaje.

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

Frontend prikazuje navedene uvjete kupcu u obliku checkliste.

Tek kada su svi uvjeti zadovoljeni:

```text
readyForPurchase = true
```

kupoprodaja može biti izvršena.

Kupac zatim pokreće kupnju, nakon čega `RealEstateEscrow` automatski:

```text
1. preuzima potreban iznos MockEUR tokena od kupca
2. prenosi MockEUR prodavatelju
3. prenosi digitalno vlasništvo nekretnine na kupca
4. označava prodaju kao završenu
```

Navedene radnje predstavljaju jednu blockchain transakciju.

Ako neki od potrebnih koraka ne može biti izvršen, cijela transakcija se poništava.

---

## MockEUR

`MockEUR` je ERC-20 token razvijen isključivo za potrebe simulacije financijskog dijela kupoprodaje.

Token nema stvarnu novčanu vrijednost.

Administrator može dodijeliti MockEUR sredstva kupcu kako bi se mogao simulirati postupak kupoprodaje.

Kupac prije kupnje mora escrow pametnom ugovoru odobriti korištenje potrebnog iznosa tokena.

---

# Uloge u sustavu

## Administrator

Administrator ima pregled ukupnog stanja sustava i upravlja simuliranim MockEUR sredstvima.

Administrator može:

```text
- pregledavati sve registrirane nekretnine
- pregledavati aktivne prodaje
- pregledavati povijest prodaja
- dodjeljivati MockEUR sredstva korisnicima
```

Administrator ne potvrđuje dokumentaciju i ne izvršava ručni prijenos vlasništva.

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

---

## Prodavatelj

Prodavatelj može:

```text
- registrirati nekretninu
- predati potrebnu dokumentaciju
- pratiti status dokumentacije
- pregledavati vlastite nekretnine
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
- korisnička sučelja za sve uloge
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

---

## Instalacija ovisnosti

Ovisnosti je potrebno instalirati prije prvog pokretanja projekta.

### Blockchain

```bash
cd blockchain
npm install
```

Nakon toga vratiti se u root direktorij:

```bash
cd ..
```

### Frontend

```bash
cd frontend
npm install
```

Nakon toga vratiti se u root direktorij:

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

Dok je Terminal 1 i Hardhat node aktivan, otvoriti novi terminal.

Iz root direktorija projekta:

```bash
cd blockchain

npx hardhat ignition deploy ignition/modules/RealEstateSystem.ts --network localhost --reset
```

Naredba implementira pametne ugovore na lokalnu Hardhat mrežu.

Deployment uključuje potrebne ugovore i dodjelu odgovarajućih blockchain uloga.

---

## Terminal 3 – pokretanje frontend aplikacije

Otvoriti treći terminal.

Iz root direktorija projekta:

```bash
cd frontend
npm run dev
```

Vite će nakon pokretanja prikazati lokalnu adresu aplikacije, primjerice:

```text
http://localhost:5173
```

Adresu je potrebno otvoriti u pregledniku u kojem je instaliran MetaMask.

---

# Redoslijed pokretanja

Kod svakog novog pokretanja sustava koristiti sljedeći redoslijed:

```text
1. Terminal 1
   npx hardhat node

2. Terminal 2
   Hardhat Ignition deployment

3. Terminal 3
   npm run dev

4. Otvoriti frontend u pregledniku

5. Povezati MetaMask s Hardhat Local mrežom

6. Odabrati odgovarajući testni račun
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

Za ovaj prototip koriste se prva četiri Hardhat računa:

```text
Account #0 → Administrator
Account #1 → Prodavatelj
Account #2 → Kupac
Account #3 → Verifikator
```

Adrese standardnih računa korištenih u projektu:

```text
Administrator
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

Prodavatelj
0x70997970C51812dc3A010C7d01b50e0d17dc79C8

Kupac
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Verifikator
0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

Za korištenje računa potrebno je u MetaMask uvesti odgovarajući privatni ključ koji Hardhat prikaže u Terminalu 1.

> **VAŽNO:** Navedeni računi i privatni ključevi koriste se isključivo na lokalnoj Hardhat razvojnoj mreži. Ne predstavljaju stvarne Ethereum račune i ne smiju se koristiti za pohranu stvarnih sredstava.

---

# Predloženi scenarij testiranja prototipa

Kompletna simulacija kupoprodaje može se testirati sljedećim redoslijedom.

## 1. Registracija nekretnine

U MetaMask odabrati račun:

```text
Prodavatelj – Account #1
```

U aplikaciji otvoriti:

```text
Registracija
```

Unijeti podatke nove nekretnine i odabrati sva tri potrebna dokumenta.

Prodavatelj zatim potvrđuje potrebne blockchain transakcije u MetaMasku.

---

## 2. Provjera stanja prije verifikacije

Nakon registracije otvoriti:

```text
Kreiranje prodaje
```

Nekretnina se još ne smije moći ponuditi na prodaju jer dokumentacija još nije potvrđena.

---

## 3. Verifikacija dokumentacije

U MetaMask odabrati:

```text
Verifikator – Account #3
```

Otvoriti panel za verifikaciju.

Za registriranu nekretninu trebaju biti prikazana tri dokumenta.

Dokumente potvrđivati jedan po jedan.

Moguće je provjeriti i međustanje, primjerice:

```text
2/3 dokumenta potvrđena
```

U tom stanju nekretnina još uvijek nije spremna za prodaju.

Tek nakon:

```text
3/3 dokumenta predana
3/3 dokumenta potvrđena
```

nekretnina dobiva status:

```text
Spremna za prodaju: DA
```

---

## 4. Kreiranje prodaje

U MetaMask vratiti:

```text
Prodavatelj – Account #1
```

Otvoriti:

```text
Kreiranje prodaje
```

Odabrati potvrđenu nekretninu i unijeti prodajnu cijenu.

Potvrditi blockchain transakciju u MetaMasku.

Prodaja se nakon toga pojavljuje među aktivnim prodajama.

---

## 5. Dodjela MockEUR sredstava

U MetaMask odabrati:

```text
Administrator – Account #0
```

Otvoriti:

```text
MockEUR
```

Unijeti adresu kupca:

```text
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

Dodijeliti kupcu dovoljan iznos MockEUR tokena za kupnju nekretnine.

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

Frontend prikazuje checklist uvjeta pametnog ugovora.

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

Time se pokazuje da samo posjedovanje dovoljnog broja MockEUR tokena nije dovoljno za izvršenje transakcije.

---

## 7. Odobravanje sredstava

Kupac klikne:

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

## 8. Izvršenje kupoprodaje

Kupac klikne:

```text
Kupi nekretninu
```

i potvrdi blockchain transakciju.

Smart contract automatski izvršava kompletan postupak.

Očekivani rezultat:

```text
MockEUR sredstva kupca se umanjuju
Prodavatelj prima prodajnu cijenu
Digitalno vlasništvo prelazi na kupca
Prodaja dobiva status Completed
Aktivna prodaja nestaje s popisa
Allowance se troši
```

---

## 9. Provjera nakon kupnje

### Kupac

Na korisničkom računu Kupca moguće je provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Kupljena nekretnina mora biti prikazana kao nekretnina čiji je trenutni digitalni vlasnik Kupac.

---

### Prodavatelj

Na korisničkom računu Prodavatelja moguće je provjeriti:

```text
Moje nekretnine
Povijest
Stanje MockEUR računa
```

Prodavatelj više ne smije biti vlasnik prodane nekretnine i mora imati uvećano stanje MockEUR tokena.

---

### Administrator

Administrator u sažetku sustava može provjeriti broj:

```text
ukupnih nekretnina
aktivnih prodaja
završenih prodaja
otkazanih prodaja
```

---

# Dodatni scenarij – otkazivanje prodaje

Prodavatelj može otkazati aktivnu prodaju prije nego je kupljena.

Nakon otkazivanja:

```text
status prodaje → Cancelled
digitalni vlasnik nekretnine ostaje prodavatelj
nekretnina ponovno postaje dostupna za kreiranje nove prodaje
otkazana prodaja ostaje zabilježena u povijesti
```

---

# Automatizirani testovi pametnih ugovora

Testovi se pokreću iz `blockchain` direktorija.

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
```

---

# Production build frontend aplikacije

Production build moguće je provjeriti naredbom:

```bash
cd frontend
npm run build
```

Build mora završiti bez grešaka.

---

# Neovisna provjera blockchain stanja

Frontend sadrži skriptu:

```text
check-state.mjs
```

koja omogućuje direktno očitavanje blockchain stanja neovisno o korisničkom sučelju.

Nakon provedene simulacije pokrenuti:

```bash
cd frontend
node check-state.mjs
```

Skripta prikazuje:

```text
Chain ID
broj registriranih nekretnina
broj evidentiranih prodaja
podatke o nekretninama
trenutnog digitalnog vlasnika
status nekretnine
prodavatelja
kupca
prodajnu cijenu
status prodaje
MockEUR stanje kupca
MockEUR stanje prodavatelja
```

Na ovaj način moguće je potvrditi da stanje prikazano u frontend aplikaciji odgovara stvarnom stanju pametnih ugovora na blockchainu.

---

# Primjer završnog rezultata simulacije

Jedan od testiranih scenarija koristio je:

```text
Kupac prije kupnje:
200000 mEUR

Cijena nekretnine:
150000 mEUR

Kupac nakon kupnje:
50000 mEUR

Prodavatelj nakon kupnje:
150000 mEUR
```

Blockchain stanje nakon transakcije potvrđuje:

```text
Sale status:
Completed

Novi digitalni vlasnik:
Kupac

Aktivna prodaja:
uklonjena

MockEUR sredstva:
automatski prenesena prodavatelju
```

---

# Status testiranja prototipa

Kompletni ručni E2E scenarij testiran je sljedećim redoslijedom:

```text
1. Prodavatelj registrira novu nekretninu                  ✅
2. Prodavatelj predaje sva 3 dokumenta                     ✅
3. Prodaja prije verifikacije nije moguća                  ✅
4. Verifikator potvrđuje dokumente pojedinačno             ✅
5. Nakon 3/3 nekretnina postaje spremna                    ✅
6. Prodavatelj kreira prodaju                              ✅
7. Administrator dodjeljuje MockEUR kupcu                  ✅
8. Kupac vidi checklist uvjeta                             ✅
9. Prije approve: allowance false / ready false            ✅
10. Kupac odobrava sredstva                                ✅
11. Nakon approve: svi uvjeti true / ready true            ✅
12. Kupac pokreće kupnju                                   ✅
13. Smart contract automatski završava transakciju         ✅
14. Kupac postaje novi digitalOwner                        ✅
15. Prodavatelj prima MockEUR                              ✅
16. Kupcu ostaje umanjeni saldo                            ✅
17. Prodaja dobiva status Completed                        ✅
18. Aktivna prodaja nestaje                                ✅
19. Povijest se prikazuje prodavatelju i kupcu             ✅
20. check-state.mjs potvrđuje isto blockchain stanje       ✅
21. Frontend radi bez aplikacijskih runtime grešaka        ✅
```

Uz ručni E2E scenarij:

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

Implementirani prototip demonstrira cjelokupni simulirani proces kupoprodaje nekretnine:

```text
registracija nekretnine
        ↓
predaja dokumentacije
        ↓
provjera dokumentacije
        ↓
kreiranje prodaje
        ↓
provjera sredstava kupca
        ↓
odobravanje escrow ugovoru
        ↓
provjera svih uvjeta
        ↓
automatsko izvršenje kupoprodaje
        ↓
prijenos MockEUR sredstava
        ↓
prijenos digitalnog vlasništva
        ↓
evidentiranje završene transakcije na blockchainu
```

Cilj prototipa je pokazati mogućnost korištenja Ethereum blockchain tehnologije i pametnih ugovora za automatizaciju kupoprodajnog procesa kada su svi unaprijed definirani uvjeti zadovoljeni.

---

## Autor

**Mislav Čačić**

Diplomski rad  
Sveučilište Josipa Jurja Strossmayera u Osijeku  
Fakultet elektrotehnike, računarstva i informacijskih tehnologija Osijek
