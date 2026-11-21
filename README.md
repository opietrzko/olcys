<a id="readme-top"></a>

[![TypeScript][typescript-shield]][typescript-url]
[![Node.js][node-shield]][node-url]
[![Fastify][fastify-shield]][fastify-url]
[![React][react-shield]][react-url]
[![PostgreSQL][postgres-shield]][postgres-url]
[![Docker][docker-shield]][docker-url]
[![HackNation][hacknation-shield]][hacknation-url]

<br />
<div align="center">
  <h2 align="center">🦉 OŁCyŚ – Osintowy Łapacz Cyfrowych Śladów</h2>
  <p align="center">
    Narzędzie OSINT łączące publiczne ślady cyfrowe (Web2) z adresami kryptowalutowymi (Web3) – z wyjaśnialnym Wskaźnikiem Pewności i wykrywaniem wyjścia do walut tradycyjnych.
    <br />
    HackNation 2026 · zadanie Ministerstwa Finansów / KAS
    <br />
    <a href="https://github.com/opietrzko/olcys/issues">Zgłoś błąd</a>
    &middot;
    <a href="https://github.com/opietrzko/olcys/issues">Zaproponuj funkcję</a>
  </p>
</div>

---

<details>
  <summary>Spis treści</summary>
  <ol>
    <li><a href="#o-projekcie">O projekcie</a></li>
    <li><a href="#założenia">Założenia</a></li>
    <li><a href="#architektura">Architektura</a></li>
    <li><a href="#zbudowane-z">Zbudowane z</a></li>
    <li>
      <a href="#pierwsze-kroki">Pierwsze kroki</a>
      <ul>
        <li><a href="#wymagania">Wymagania</a></li>
        <li><a href="#instalacja">Instalacja</a></li>
      </ul>
    </li>
    <li><a href="#użycie">Użycie</a></li>
    <li><a href="#parametry-wyszukiwania">Parametry wyszukiwania</a></li>
    <li><a href="#źródła-danych">Źródła danych</a></li>
    <li><a href="#wskaźnik-pewności">Wskaźnik Pewności</a></li>
    <li><a href="#wskaźniki-wyjścia-do-fiat">Wskaźniki wyjścia do fiat</a></li>
    <li><a href="#testy">Testy</a></li>
    <li><a href="#zmienne-środowiskowe">Zmienne środowiskowe</a></li>
    <li><a href="#bezpieczeństwo-i-zgodność">Bezpieczeństwo i zgodność</a></li>
    <li><a href="#licencje-komponentów">Licencje komponentów</a></li>
    <li><a href="#dalszy-rozwój">Dalszy rozwój</a></li>
    <li><a href="#licencja">Licencja</a></li>
    <li><a href="#kontakt">Kontakt</a></li>
  </ol>
</details>

---

> **Dla jury: sprawdzenie w 2 minuty.** Dwie fikcyjne osoby z prawdziwymi, publicznymi kontami, trzy identyfikatory do wpisania i to, co zobaczycie w wynikach: [`docs/scenariusze-testowe.md`](docs/scenariusze-testowe.md).

## O projekcie

Podatnicy publikują adresy portfeli na forach, w ogłoszeniach P2P, na profilach programistycznych i w komunikatorach. Ręczne łączenie tych śladów z historią transakcji jest czasochłonne i trudne do powtórzenia.

OŁCyŚ automatyzuje tę pracę dla analityków **Krajowej Administracji Skarbowej**. Na podstawie co najmniej jednego identyfikatora (nick, e-mail, telefon, Telegram, imię i nazwisko, URL, adres krypto) przeszukuje publiczne źródła Internetu, wyodrębnia adresy kryptowalutowe i liczy, jak bardzo prawdopodobne jest, że adres należy do badanej osoby. Wynikiem jest raport z pełnym łańcuchem dowodowym.

**Kluczowe możliwości:**

- **Łączenie śladów OSINT** – konektory Web2 (GitHub, dev.to, Reddit, Keybase, Gravatar, Telegram, ENS, strony WWW, wyszukiwarka, wyszukiwanie adresu w kodzie GitHuba) i pivotowanie po odkrytych identyfikatorach (np. GitHub → strona WWW → telefon → konto-alias; strona `<login>.github.io` → konto GitHub `<login>`)
- **Ekstrakcja adresów** – BTC, ETH/EVM, TRON, LTC, SOL z walidacją sum kontrolnych i odtwarzaniem zapisów celowo zaciemnionych
- **Wskaźnik Pewności** – deterministyczne, wersjonowane reguły; każdy punkt ma przesłankę i źródło
- **Odrzucanie fałszywych trafień** – giełdy, kontrakty (Ethereum i TRON), miksery, zbiórki, homonimy, adresy cudze, adresy publikowane przez wiele osób, nazwy ENS/Keybase bez wzajemnego potwierdzenia, adresy o aktywności instytucjonalnej bez etykiety, fałszywe tokeny („USDT” z nieznanego kontraktu)
- **Wskaźniki wyjścia do fiat** – wysyłki na giełdy (etykiety także dla kontrahentów), wnioskowane adresy depozytowe, wymiana na stablecoiny, bramki fiat, wzorce P2P, miksery, wolumen w PLN; Ethereum + opcjonalnie Polygon, Arbitrum, BSC, Base, OP (ten sam adres 0x)
- **Wycena pod PIT-38** – cena krypto z dnia transakcji i kurs średni NBP z ostatniego dnia roboczego przed transakcją (art. 11a ust. 1 ustawy o PIT), z numerem tabeli NBP przy każdej pozycji
- **Analizy cykliczne** – harmonogram, porównanie przebiegów, wykrywanie podmiany adresu w czasie (także z archiwum Internetu)
- **Raport** – rozdzielenie **faktów źródłowych**, **wyników obliczeń** i **wniosków do weryfikacji**, kopie dowodów z SHA-256, chronologia przepływu środków

```
Identyfikatory ──► Konektory Web2 ──► Dowody (URL, czas, SHA-256, kopia) ──► Pivot (nowe identyfikatory)
                                                │
                                                ▼
                    Ekstrakcja + walidacja adresów (sumy kontrolne, deobfuskacja)
                                                │
              Autor ↔ tożsamość podmiotu (DIRECT / PIVOT / MENTION / WEAK) + kontekst
                                                │
       Klasyfikacja: etykiety lokalne i z API, bytecode ──► BRAMKA 0% (CEX, DEX, kontrakt, mikser, zbiórka)
                                                │
                       Wskaźnik Pewności (reguły, wersjonowane) ──► Aktywność blockchain
                                                │                 (swap→stablecoin, depozyt giełdy,
                                                ▼                  off-ramp, P2P, mikser, wolumen PLN)
                     Raport: FAKTY · OBLICZENIA · WNIOSKI DO WERYFIKACJI + diff przebiegów
```

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Założenia

- **Tylko źródła publiczne** – bez logowania, bez obchodzenia zabezpieczeń, bez wycieków danych. Każdy konektor opisuje swoją podstawę zgodności (zakładka *Źródła i zgodność*).
- **Wyjaśnialność ponad „czarną skrzynkę”** – wynik liczą reguły, a AI pełni tylko rolę pomocniczą.
- **Odtwarzalność** – każdy przebieg zapisuje surowe kopie dowodów, parametry wyszukiwania, wersję silnika i wersję reguł; całość można wyeksportować jako pakiet JSON.
- **Kontrola ruchu wychodzącego** – identyfikatory trafiają tylko do zatwierdzonych hostów (allowlista).
- **On-prem** – wszystkie komponenty działają lokalnie (Docker Compose), model AI jest lokalny i wymienny, dostawców danych blockchain można zastąpić własnymi węzłami KAS.
- **Rozszerzalność** – nowe źródło Web2 to `SourceConnector`, nowa sieć to `ChainProvider` z walidatorem adresu, nowe etykiety to plik JSON w `data/labels/`.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Architektura

Monorepo (npm workspaces). Logika domenowa jest oddzielona od wejścia/wyjścia: `core` nie wykonuje żadnych zapytań sieciowych i jest w pełni testowalny offline.

```
packages/
├── core/           # walidacja adresów, ekstrakcja, kontekst, etykiety, Wskaźnik Pewności, cash-out, diff
└── engine/         # konektory Web2, dostawcy blockchain, kontrolowany fetch, pipeline, raport HTML, klient LLM
apps/
├── api/            # Fastify + PostgreSQL: analizy, przebiegi, harmonogram, dowody, eksport, audyt
└── web/            # React + Vite: formularz, etapy analizy, graf powiązań, reguły, chronologia, źródła
data/labels/        # zbiory etykiet adresów (JSON, z pochodzeniem i licencją)
infra/searxng/      # konfiguracja self-hosted wyszukiwarki
scripts/            # CLI analizy, generator adresów do testów walidacji
```

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Zbudowane z

### Backend

[![TypeScript][typescript-shield]][typescript-url]
[![Node.js][node-shield]][node-url]
[![Fastify][fastify-shield]][fastify-url]
[![PostgreSQL][postgres-shield]][postgres-url]

### Frontend

[![React][react-shield]][react-url]
[![Vite][vite-shield]][vite-url]
[![Cytoscape][cytoscape-shield]][cytoscape-url]

### Infrastruktura

[![Docker][docker-shield]][docker-url]
[![SearXNG][searxng-shield]][searxng-url]
[![Ollama][ollama-shield]][ollama-url]

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Pierwsze kroki

### Wymagania

- [Node.js](https://nodejs.org) ≥ 20.11
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/) v2
- Token GitHub (fine-grained, **bez uprawnień** – tylko dane publiczne); zalecany, bo bez niego limit to 60 zapytań/h na IP

### Instalacja

1. Sklonuj repozytorium
   ```sh
   git clone git@github.com:opietrzko/olcys.git
   cd olcys
   ```

2. Zainstaluj zależności
   ```sh
   npm install
   ```

3. Skopiuj konfigurację i ustaw `GITHUB_TOKEN`
   ```sh
   cp .env.example .env
   ```
   Pozostałe wartości domyślne działają bez kluczy. Pełna lista: [Zmienne środowiskowe](#zmienne-środowiskowe).

4. Opcjonalnie: uruchom self-hosted wyszukiwarkę i odkomentuj `SEARXNG_URL` w `.env`. Scenariusze testowe działają bez niej.
   ```sh
   docker compose up -d searxng
   ```

5. Uruchom środowisko deweloperskie
   ```sh
   npm run dev
   ```

6. Usługi będą dostępne pod adresami:

   | Usługa | URL |
   |---|---|
   | Interfejs analityka | http://localhost:5173 |
   | API | http://localhost:4000/api |
   | SearXNG | http://localhost:8888 |

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Użycie

### Analiza w interfejsie

Otwórz http://localhost:5173, wpisz co najmniej jeden identyfikator i kliknij **Uruchom analizę**. Widok przebiegu pokazuje etapy analizy, adresy z rozpisaniem wyniku na reguły, graf powiązań, fakty/obliczenia/wnioski oraz źródła z sumami SHA-256. Raport do druku / PDF i pakiet dowodowy JSON są dostępne z widoku przebiegu.

### Przykład: przebieg na personie testowej

Wejście: tylko adres strony `https://kordas-dev.github.io/` (fikcyjna persona zespołu „Ksawery Kordas”). Fragment zakładki *Przebieg i parametry*:

```text
15:58:00 input    Identyfikatory wejściowe: url=https://kordas-dev.github.io; maks. głębokość pivotowania 6
15:58:00 web      https://kordas-dev.github.io: strona hostowana na GitHub Pages – właściciel konta GitHub „kordas-dev”
15:58:00 pivot    Nowy identyfikator nick=kordas-dev (głębokość 1, źródło: https://kordas-dev.github.io)
15:58:00 pivot    Nowy identyfikator telegram=kordas_sprzedaz (głębokość 1, źródło: https://kordas-dev.github.io)
15:58:02 github   nick=kordas-dev: 2 dokument(ów), nowych 2
15:58:05 telegram telegram=kordas_sprzedaz: 1 dokument(ów), nowych 1
15:58:08 pivot    Tropy wyczerpane – 5 identyfikator(ów), najgłębszy poziom 2 z 6
15:58:13 score    BTC:bc1qj2xp3cuqeuldce3h36q3d2q7d5jrt474q8mtqz: UNHOSTED → 90% (BARDZO_WYSOKIE)
15:58:13 score    ETH:0x165cd37b4c644c2921454429e7f9358d18a45e14: CHARITY → 0% (WYKLUCZONE)
15:58:16 score    ETH:0xd3e785eff14af8454af1dce3ba63321123bce61c: UNHOSTED → 100% (BARDZO_WYSOKIE)
15:58:17 score    TRON:TPL5VC5b8Nt7Kvhq2VvvJq5nTp6y9zbZoc: UNHOSTED → 70% (PRAWDOPODOBNE)
15:58:20 score    ETH:0x5b2095ec0ea6484c2bf656d861e163971e240435: UNHOSTED → 10% (NISKIE)
15:58:20 done     Zakończono: 3 adres(ów) ≥60%, 1 odrzuconych
```

| Adres | Wynik | Uzasadnienie (reguły) |
|---|---|---|
| `0xd3e7…E61C` (ETH) | **100%** | profil autorski +85, pivot −5, deklaracja własności +5, synergia GitHub + Telegram +15 |
| `bc1qj2…mtqz` (BTC) | **90%** | strona autorska +85, deklaracja własności +5 |
| `TPL5…Zoc` (TRON) | **70%** | ogłoszenie sprzedaży na Telegramie +70, pivot −5, „wpłać na” +5 |
| `0x5b20…0435` (ETH) | **10%** | autor ostrzega przed scamem – adres cudzy +15, pivot −5 |
| `0x165C…5e14` (ETH) | **0%** | bramka: adres zbiórki (etykieta) |

Pełny opis scenariuszy i wyników: [`docs/scenariusze-testowe.md`](docs/scenariusze-testowe.md).

### Analiza z linii poleceń

```sh
npm run cli -- nick=<login> email=<adres> phone=<numer> --html raport.html --json wynik.json
```

### Analiza cykliczna

Ustaw harmonogram analizy (np. co 5 min) i zmień coś na koncie testowym, np. podmień adres w bio. Kolejny przebieg pokaże kartę **Zmiany względem poprzedniego przebiegu**.

### Produkcja (Docker, PostgreSQL)

```sh
docker compose up -d --build
```

UI i API: http://localhost:4000. Opcjonalny lokalny model AI:

```sh
docker compose --profile ai up -d
```

i w `.env`: `LLM_BASE_URL=http://ollama:11434/v1`.

### Jakość kodu

```sh
npm test            # testy (offline)
npm run typecheck   # TypeScript we wszystkich pakietach
npm run licenses    # raport licencji zależności
```

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Parametry wyszukiwania

| Parametr | Opis | Domyślnie |
|---|---|---|
| Identyfikatory | `nick`, `email`, `phone`, `telegram`, `name`, `url`, `address` (min. 1). Telefon normalizowany do E.164 (domyślnie +48) | – |
| Głębokość pivotowania | Liczba „skoków” po identyfikatorach odkrytych na profilach podmiotu (limit bezpieczeństwa: 60 identyfikatorów na przebieg) | 6 |
| Historia (archiwum) | Wersje archiwalne profili i stron (Wayback CDX) do wykrycia podmiany adresu | wł. |
| Harmonogram | Analiza cykliczna (5 min / 1 h / dzień / tydzień) z porównaniem wyników | brak |
| Konektory | Lista źródeł; można wyłączyć wybrane | wszystkie aktywne |

Pivot jest dozwolony **tylko** z dokumentów należących do podmiotu (silne powiązanie). Wyniki wyszukiwania po samym imieniu i nazwisku nie rozszerzają poszukiwań.

**Hosting przypisany do konta:** stronę `<login>.github.io` (także `<login>.gitlab.io`, `<login>.codeberg.page`) może opublikować tylko właściciel konta o tym loginie, więc taka strona prowadzi do profilu GitHub jako powiązanie pośrednie (`PIVOT`). Dla reguły synergii strona GitHub Pages i profil GitHub to **ta sama usługa** – adres opublikowany w obu miejscach nie dostaje premii +15.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Źródła danych

| Źródło | Co daje | Dostęp |
|---|---|---|
| GitHub API + raw | profil, bio, strona, profilowe README (także organizacji), FUNDING.yml | publiczne API; zalecany `GITHUB_TOKEN` |
| GitHub – wyszukiwanie kodu | adres krypto → publiczne pliki, w których występuje, i ich właściciel (pivot do nicku) | publiczne API; wymaga `GITHUB_TOKEN` |
| DEV (dev.to) | artykuły użytkownika (np. ogłoszenia sprzedaży) | publiczne API Forem, bez klucza |
| Reddit | posty i komentarze na profilu użytkownika | oficjalne API OAuth z kluczem zarejestrowanej aplikacji (`REDDIT_CLIENT_ID/SECRET`); bez klucza anonimowe listingi `.json`, których Reddit zwykle odmawia (403) – raportowane, nie obchodzone |
| Keybase | **kryptograficznie podpisane** adresy krypto i dowody kont (GitHub, X, Reddit, WWW) | publiczne API |
| Gravatar v3 | e-mail (hash) → profil i zweryfikowane konta | publiczne API |
| Telegram `t.me/s/` | publiczny podgląd kanału | bez logowania |
| ENS (RPC) | nazwa `.eth` → adres i rekordy tekstowe | publiczny RPC lub własny węzeł |
| SearXNG (self-hosted) | wyszukiwanie identyfikatorów i adresów w otwartym Internecie, pobranie stron wyników (bez eksploratorów blockchain) | własna instancja |
| Strony WWW | strony linkowane z profili i z wyników | GET z ochroną SSRF |
| Wayback CDX | historyczne wersje profili i stron | publiczne API |
| Blockscout / Etherscan | historia ETH i tokenów, **nazwy zweryfikowanych kontraktów** (także kontrahentów transakcji), liczba transakcji adresu | Blockscout bez klucza |
| Etherscan v2 (wiele sieci) | ten sam adres 0x w sieciach Polygon, Arbitrum, BSC, Base, OP | wymaga `ETHERSCAN_API_KEY` (publiczne instancje Blockscout L2 blokują ruch automatyczny) |
| `eth_getCode` | flaga kontraktu (bytecode ≠ `0x`) | publiczny RPC |
| Esplora (Blockstream, zapasowo mempool.space) | historia BTC (do 100 tx), łączna liczba transakcji | bez klucza; ponowienie przy limicie 429 |
| TronGrid | transfery TRC20 i natywne TRX, flaga kontraktu (`/wallet/getcontract`) | bez klucza |
| NBP | kurs USD/PLN: bieżący i **historyczny** (tabele A z okresu transakcji) | bez klucza; przy awarii kurs zapasowy z adnotacją |
| CoinGecko | ceny krypto: bieżące i dzienne z ostatnich 365 dni | bez klucza |

> **Ograniczenia:** wyniki SearXNG zależą od wyszukiwarek, z których korzysta (część ogranicza liczbę zapytań). GitHub bez tokena ma limit 60 zapytań/h na IP, a wyszukiwanie kodu działa tylko z tokenem i obejmuje pliki dopiero po zaindeksowaniu przez GitHub. Reddit odmawia zapytań anonimowych z wielu sieci (403) – do scenariuszy z Redditem potrzebna jest zarejestrowana aplikacja tylko do odczytu (`REDDIT_CLIENT_ID/SECRET`), a wdrożenie w KAS – zgody wynikającej z Reddit Data API Terms. NBP bywa chwilowo niedostępne. Każdy taki problem trafia do raportu jako błąd konektora, a nie jako cichy „brak wyników”.

**Warianty nicku między serwisami:** GitHub nie dopuszcza znaku `_` w loginie, więc nick `jan_kowal` jest sprawdzany na GitHubie także jako `jan-kowal` (a na dev.to odwrotnie). Konto wariantowe liczy się jako konto podmiotu tylko wtedy, gdy jego treść wymienia oryginalny nick (np. `TG: @jan_kowal` w bio). W przeciwnym razie dostaje powiązanie słabe (−35), bo taki login mógł założyć ktokolwiek.

### Tryb offline (nagrywanie i odtwarzanie)

Zabezpieczenie na prezentację bez sieci. Najpierw nagraj przebieg na żywo, potem odtwórz go bez dostępu do Internetu:

```sh
OLCYS_RECORD_DIR=data/recordings/demo npm run dev     # przebieg na żywo, każda odpowiedź źródła zapisana na dysku
OLCYS_REPLAY_DIR=data/recordings/demo npm run dev     # te same analizy bez sieci
```

W trybie odtwarzania żadne żądanie nie wychodzi z komputera. Zapytanie bez nagrania kończy się jawnym błędem konektora, a nie cichym wyjściem do sieci. Przebieg i raport oznaczają tryb offline. Nagrania nie zawierają nagłówków (np. tokena GitHub).

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Wskaźnik Pewności

Wersja reguł: `olcys-score/1.0.0`.

`wynik = min(100, max(0, BAZA(najlepsze wystąpienie) + Σ korekt))`, a adres z kategorii wykluczonej dostaje **0%**.

| Reguła | Wartość |
|---|---|
| Baza: autorski profil / strona (GitHub, WWW, zweryfikowane konto) | 85 |
| Baza: ogłoszenie sprzedaży, rozliczenie w komunikatorze | 70 |
| Baza: dyskusja na forum | 50 |
| Baza: masowe komentarze (giveaway, konkurs) | 20 |
| Baza: autor wskazuje adres cudzy („wpłaciłem na…”, „adres giełdy”, „scam”) | 15 |
| Powiązanie pośrednie (identyfikator z pivotu) | −5 |
| Wzmianka – identyfikator obok adresu, autor treści niepotwierdzony | −20 |
| Powiązanie słabe – tylko imię i nazwisko, nazwa ENS/Keybase bez wzajemnego potwierdzenia lub plik w cudzym repozytorium | −35 |
| Deklaracja własności („mój portfel”, „przelej na”, „wesprzyj”) | +5 |
| **Synergia** – ≥2 niezależne źródła Web2 (wielokrotność w jednym serwisie się nie liczy) | +15 |
| Ten sam adres publikuje ≥3 obcych autorów (zbiórka / giveaway / scam) | −30 |
| Adres tylko w archiwalnej wersji zasobu | −5 |
| Brak weryfikacji w blockchainie | −10 |
| Adres wnioskowany jako instytucjonalny (bez etykiety, ≥5000 transakcji lub ≥300 kontrahentów) | −40 |
| Nie sprawdzono skali aktywności adresu (brak liczby transakcji i historii, np. limit zapytań) | −10 |
| **Bramka:** etykieta CEX / custodial / DEX / kontrakt tokena / mikser / zbiórka / bramka fiat / sankcje, albo kod kontraktu (Ethereum: `eth_getCode ≠ 0x`, TRON: `/wallet/getcontract`) | **0%** |

| Przedział | Znaczenie |
|---|---|
| 80–100% | bardzo wysokie prawdopodobieństwo |
| 60–79% | prawdopodobne |
| 40–59% | średnie – wymaga drugiego śladu |
| 1–39% | niskie / szum |
| 0% | wykluczone (fałszywe trafienie) |

**Synergia a „niezależne źródło”:** źródła grupowane są po usłudze, a nie po adresie strony: subdomeny jednej domeny, profil GitHub, `raw.githubusercontent.com` i strona `*.github.io` to jedno źródło (zgodnie z załącznikiem: *wielokrotne wystąpienie adresu w ramach jednej usługi nie stanowi dodatkowego potwierdzenia*).

**Adres instytucjonalny bez etykiety:** etykiet nie da się mieć dla wszystkich adresów giełd. Gdy adres ma aktywność typową dla giełdy lub usługi (≥5000 transakcji w historii albo ≥300 różnych kontrahentów w pobranym fragmencie), dostaje karę −40 i kategorię *custodial (wniosek)*. To wniosek do weryfikacji, a nie bramka 0%. Gdy dostawca nie zwróci ani liczby transakcji, ani historii, heurystyka nie może się wykonać, więc wynik dostaje karę −10 („Nie sprawdzono skali aktywności adresu”) zamiast pełnej pewności.

**Otwarte przestrzenie nazw (ENS, Keybase):** nazwę `.eth` czy konto Keybase o danej nazwie może zarejestrować każdy. Zgodność z nickiem daje tylko powiązanie słabe, dopóki nie ma **wzajemnego potwierdzenia**: dla Keybase zweryfikowanego dowodu konta o tym nicku, dla ENS innego profilu podmiotu wskazującego tę nazwę lub adres. Przykład z testu na żywo: `torproject.eth` bez potwierdzenia ma 55% zamiast 90%.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Wskaźniki wyjścia do fiat

| Wskaźnik | Logika | Charakter |
|---|---|---|
| `CEX_DIRECT` | wysyłka na adres z etykietą giełdy / custodial | obliczenie |
| `CEX_DEPOSIT_INFERRED` | adres pośredni przekazał ≥90% otrzymanych środków do giełdy w ≤72 h (wzorzec „sweep” konta depozytowego) | wniosek |
| `STABLECOIN_SWAP` | wymiana przez DEX z wpływem stablecoinów ≥1000 USD | obliczenie |
| `OFFRAMP` | interakcja z bramką krypto-fiat, kantorem, kartą krypto | obliczenie |
| `P2P_PATTERN` | ≥4 okrągłe wpłaty stablecoin od różnych nieoznaczonych adresów lub kontakt z usługą P2P | wniosek |
| `MIXER_EXPOSURE` | kontakt z mikserem / podmiotem sankcjonowanym | obliczenie |
| `HIGH_VOLUME` | łączny wolumen ≥20 000 USD (z przeliczeniem na PLN) | obliczenie |

**Fałszywe tokeny:** symbol tokena może nadać każdy, a historie portfeli są pełne spamowych „USDT”. Do wyceny i wskaźników liczą się tylko tokeny z **rejestru zweryfikowanych kontraktów** (`packages/core/src/tokens.ts`: USDT, USDC, DAI, PYUSD, FDUSD, BUSD, EURC, WETH w 6 sieciach EVM i w TRON; każdy kontrakt sprawdzony wywołaniem `symbol()` w publicznym RPC). Pozostałe transfery są pokazywane z adnotacją „niezweryfikowany token – pominięty”.

**Etykiety kontrahentów:** dla 12 najczęstszych kontrahentów adresu narzędzie pobiera z eksploratora nazwę zweryfikowanego kontraktu (router DEX, pula Tornado Cash). Giełdy rozpoznaje lokalny zbiór etykiet (`data/labels`), bo publiczne API eksploratorów nie udostępniają tagów giełd bez klucza. Etykiety kont EOA (np. portfeli giełd) obowiązują we wszystkich sieciach EVM, bo ten sam adres oznacza ten sam klucz prywatny. Etykiety kontraktów obowiązują tylko w sieci, w której kontrakt wdrożono.

**Wycena (PIT-38):** każda pozycja chronologii ma cenę krypto w USD **z dnia transakcji** (CoinGecko, ostatnie 365 dni; stablecoiny dolarowe – parytet 1 USD) i przeliczenie na PLN po **kursie średnim NBP z ostatniego dnia roboczego poprzedzającego transakcję** (art. 11a ust. 1 ustawy o PIT) – z datą i numerem tabeli NBP. Starsze transakcje bez notowania dziennego są oznaczone gwiazdką (cena bieżąca). Wynik pozostaje **obliczeniem pomocniczym** – nie zastępuje ustalenia przychodu przez analityka.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Testy

```sh
npm test
```

57 testów automatycznych, działających bez dostępu do sieci:

- walidacja i ekstrakcja adresów (sumy kontrolne, zaciemnione zapisy, znaki niewidoczne)
- Wskaźnik Pewności (przedziały, synergia, bramki, homonim, adres cudzy, adres u wielu autorów)
- wskaźniki cash-out (swap na stablecoiny, wnioskowany adres depozytowy giełdy, fałszywe „USDT” pominięte)
- kurs NBP z dnia poprzedzającego transakcję, wycena z ceną z dnia transakcji
- heurystyka adresu instytucjonalnego, synergia GitHub + GitHub Pages (bez premii)
- poprawność sum kontrolnych wszystkich adresów w zbiorze etykiet
- numer telefonu
- bezpieczeństwo (ochrona SSRF, allowlista API, protokoły, wzajemne potwierdzenie ENS/Keybase, filtr eksploratorów), trop GitHub Pages → konto GitHub, konwersja adresów TRON hex → Base58
- plan kont testowych zespołu (GitHub + dev.to + Reddit) od wejścia do wyniku, odtworzony z nagrań: synergia GitHub + dev.to, pułapki USDT i Binance = 0%, giveaway na Reddicie = szum bez synergii, wyszukiwanie po samym adresie, warianty nicku

**Scenariusze akceptacyjne** wykonuje się na prawdziwym Internecie, na dwóch fikcyjnych personach z kontami w GitHub, Gravatar, na stronie WWW i w Telegramie: [`docs/scenariusze-testowe.md`](docs/scenariusze-testowe.md) – co wpisać i co zobaczyć, w 2 minuty.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Zmienne środowiskowe

Skopiuj `.env.example` do `.env` i uzupełnij wartości.

| Zmienna | Wymagana | Domyślnie | Opis |
|---|---|---|---|
| `GITHUB_TOKEN` | zalecana | | Token GitHub bez uprawnień – podnosi limit z 60 do 5000 zapytań/h |
| `SEARXNG_URL` | | | Adres własnej instancji SearXNG; bez niej wyszukiwarka jest wyłączona |
| `DATABASE_URL` | | | PostgreSQL; bez niej wyniki są trzymane w pamięci |
| `EGRESS_ALLOWLIST` | | | Dodatkowe zatwierdzone hosty API (lista domyślna: `DEFAULT_LIVE_SOURCES`) |
| `OLCYS_WEB_FETCH` | | `public` | `public` – dowolna publiczna strona z ochroną SSRF; `allowlist` – tylko allowlista |
| `BLOCKSCOUT_URL` | | `https://eth.blockscout.com` | Blockscout (bez klucza; możliwa własna instancja) |
| `ETHERSCAN_API_KEY` | | | Gdy ustawiony – Etherscan v2 zamiast Blockscout i dodatkowe sieci EVM |
| `EVM_NETWORKS` | | `polygon,arbitrum` (z kluczem) | Dodatkowe sieci EVM: `polygon`, `arbitrum`, `bsc`, `base`, `optimism` |
| `ETH_RPC_URL` | | `https://ethereum-rpc.publicnode.com` | RPC Ethereum (bytecode, ENS); może być własny węzeł |
| `ESPLORA_URL` | | `https://blockstream.info/api` | Esplora dla BTC |
| `ESPLORA_FALLBACK_URLS` | | `https://mempool.space/api` | Zapasowe instancje Esplora (przy limicie 429 lub awarii) |
| `TRONGRID_URL` | | `https://api.trongrid.io` | TronGrid dla TRON |
| `OLCYS_MAX_DEPTH` | | `6` | Domyślna głębokość pivotowania |
| `OLCYS_PIVOT_BUDGET_MS` | | `180000` | Budżet czasu na zbieranie i pivotowanie w jednym przebiegu; po przekroczeniu analiza ocenia zebrane dowody |
| `OLCYS_MAX_PIVOTS_PER_DOC` | | `12` | Maks. liczba nowych tropów z jednego dokumentu (najpierw nicki, komunikatory, e-maile, na końcu strony WWW) |
| `OLCYS_SEARCH_RESULTS` | | `8` | Liczba wyników wyszukiwarki pobieranych na zapytanie |
| `OLCYS_LIVE_RATES` | | `true` | Kursy z NBP i CoinGecko |
| `OLCYS_REDDIT` | | `true` | `false` wyłącza konektor Reddit (w `.env.example` wyłączony, dopóki nie podasz kluczy aplikacji) |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | do Reddita | | Klucze zarejestrowanej aplikacji Reddit typu „script” (tylko odczyt) – oficjalne API OAuth |
| `OLCYS_RECORD_DIR` | | | Katalog, do którego zapisywane są odpowiedzi źródeł (do odtworzenia offline) |
| `OLCYS_REPLAY_DIR` | | | Katalog z nagraniem – analizy bez sieci (ma pierwszeństwo przed `OLCYS_RECORD_DIR`) |
| `LLM_BASE_URL` | | | API zgodne z OpenAI (Ollama, vLLM, LocalAI, LiteLLM) |
| `LLM_MODEL` | | `llama3.1` | Model do klasyfikacji kontekstu |
| `SEARXNG_SECRET` | w produkcji | | Sekret instancji SearXNG (docker compose) |

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Bezpieczeństwo i zgodność

- Zapytania API zawierające identyfikatory trafiają **wyłącznie** do zatwierdzonych hostów; pozostałe są blokowane i logowane.
- Pobieranie stron odkrytych w dowodach blokuje adresy prywatne, pętli zwrotnej i link-local (ochrona SSRF w sieci wewnętrznej); każde przekierowanie jest sprawdzane **przed** wykonaniem.
- Kopie dowodów serwowane są jako `text/plain` z CSP `sandbox` – żaden skrypt ze źródła się nie wykona.
- Każda operacja (utworzenie analizy, przebieg, podgląd, raport, eksport) trafia do dziennika audytu; nagłówek `x-olcys-user` to miejsce na integrację z SSO/RBAC KAS.
- Wyszukiwarka SearXNG przekazuje zapytania **wyłącznie** do zatwierdzonej listy silników (`infra/searxng/settings.yml`: DuckDuckGo, Bing, Brave, Wikipedia), z adresu serwera, bez cookies i danych analityka. Obraz SearXNG jest przypięty do konkretnej wersji, a jego sekret pochodzi ze zmiennej `SEARXNG_SECRET`.
- Brak telemetrii i zależności od chmury publicznej.

### Ochrona danych osobowych (RODO)

Narzędzie przetwarza dane osobowe osób, których dotyczy analiza (identyfikatory, treści publicznych wpisów, adresy portfeli). Założenia dla wdrożenia w KAS:

- **Podstawa prawna:** art. 6 ust. 1 lit. c i e RODO w związku z przepisami o zadaniach KAS (ustawa o Krajowej Administracji Skarbowej, Ordynacja podatkowa – czynności sprawdzające i analityczne). Przy wdrożeniu wymagana jest ocena skutków dla ochrony danych (DPIA, art. 35 RODO).
- **Minimalizacja:** zbierane są tylko publiczne dokumenty, w których wystąpił adres lub identyfikator podmiotu; e-mail trafia do Gravatara wyłącznie jako hash; pivot tylko z dokumentów należących do podmiotu; limit 60 identyfikatorów na przebieg.
- **Ograniczenie celu i rozliczalność:** każda operacja (utworzenie analizy, przebieg, podgląd, raport, eksport) trafia do dziennika audytu z identyfikatorem analityka (miejsce na integrację z SSO/RBAC KAS).
- **Okres przechowywania:** do ustalenia w polityce KAS; przebiegi i kopie dowodów są przechowywane w PostgreSQL, więc retencję realizuje się zadaniem usuwającym przebiegi starsze niż ustalony okres.
- **Prawa osób:** raport oddziela fakty źródłowe od wniosków, a każdy wniosek wskazuje źródło – ułatwia to weryfikację i sprostowanie.
- **Brak przekazywania danych:** identyfikatory trafiają tylko do zatwierdzonych hostów (allowlista), bez telemetrii i usług chmurowych; model AI działa lokalnie.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Licencje komponentów

Wszystkie zależności są Open Source. Bezpośrednie zależności:

| Komponent | Licencja | | Komponent | Licencja |
|---|---|---|---|---|
| React, React DOM | MIT | | Fastify, @fastify/cors, @fastify/static | MIT |
| Vite, @vitejs/plugin-react | MIT | | node-postgres (`pg`) | MIT |
| Cytoscape.js | MIT | | Zod | MIT |
| cheerio | MIT | | @noble/hashes, @scure/base | MIT |
| TypeScript | Apache-2.0 | | tsx, Vitest, concurrently | MIT |
| PostgreSQL (obraz Docker) | PostgreSQL License | | SearXNG (obraz Docker) | AGPL-3.0 |
| Ollama (opcjonalnie) | MIT | | | |

Zależności przechodnie: MIT, ISC, BSD-2/3-Clause, Apache-2.0, BlueOak-1.0.0, 0BSD, CC-BY-4.0 (dane). Pełny raport: `npm run licenses`.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Dalszy rozwój

- Kolejne konektory: X/Bluesky, Nostr (NIP-05), OLX/Allegro, Bitcointalk
- Dekodowanie kodów QR z obrazów (adresy publikowane jako grafika)
- Pełne zbiory etykiet (OFAC SDN, etykiety giełd z licencjonowanych źródeł, polskie giełdy i kantory) i ich automatyczna aktualizacja
- Klastrowanie adresów BTC (common-input-ownership), ceny historyczne krypto starsze niż 365 dni (własne archiwum notowań)
- Eksport raportu do PDF po stronie serwera, podpis elektroniczny pakietu dowodowego

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Licencja

Do ustalenia przez zespół. Zgodnie z regulaminem zadania (§5) autorskie prawa majątkowe do nagrodzonego rozwiązania przechodzą na Skarb Państwa – Ministerstwo Finansów w chwili wypłaty nagrody.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Kontakt

Projekt: [github.com/opietrzko/olcys](https://github.com/opietrzko/olcys)

Wydarzenie: [HackNation 2026](https://hacknation.pl)

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

<!-- MARKDOWN LINKS & BADGES -->
[typescript-shield]: https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org

[node-shield]: https://img.shields.io/badge/Node.js-22-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org

[fastify-shield]: https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify&logoColor=white
[fastify-url]: https://fastify.dev

[react-shield]: https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://react.dev

[vite-shield]: https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vite.dev

[cytoscape-shield]: https://img.shields.io/badge/Cytoscape.js-3.35-F7DF1E?style=for-the-badge&logoColor=black
[cytoscape-url]: https://js.cytoscape.org

[postgres-shield]: https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[postgres-url]: https://postgresql.org

[docker-shield]: https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white
[docker-url]: https://docker.com

[searxng-shield]: https://img.shields.io/badge/SearXNG-self--hosted-3050FF?style=for-the-badge&logo=searxng&logoColor=white
[searxng-url]: https://docs.searxng.org

[ollama-shield]: https://img.shields.io/badge/Ollama-optional-000000?style=for-the-badge&logo=ollama&logoColor=white
[ollama-url]: https://ollama.com

[hacknation-shield]: https://img.shields.io/badge/HackNation-2026-C0392B?style=for-the-badge
[hacknation-url]: https://hacknation.pl
