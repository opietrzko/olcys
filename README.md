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

## O projekcie

Podatnicy publikują adresy portfeli na forach, w ogłoszeniach P2P, na profilach programistycznych i w komunikatorach. Ręczne łączenie tych śladów z historią transakcji jest czasochłonne i trudne do powtórzenia.

OŁCyŚ automatyzuje tę pracę dla analityków **Krajowej Administracji Skarbowej**. Na podstawie co najmniej jednego identyfikatora (nick, e-mail, telefon, Telegram, imię i nazwisko, URL, adres krypto) przeszukuje publiczne źródła Internetu, wyodrębnia adresy kryptowalutowe i liczy, jak bardzo prawdopodobne jest, że adres należy do badanej osoby. Wynikiem jest raport z pełnym łańcuchem dowodowym.

**Kluczowe możliwości:**

- **Łączenie śladów OSINT** – konektory Web2 (GitHub, Keybase, Gravatar, Telegram, ENS, strony WWW, wyszukiwarka) i pivotowanie po odkrytych identyfikatorach (np. GitHub → strona WWW → telefon → konto-alias)
- **Ekstrakcja adresów** – BTC, ETH/EVM, TRON, LTC, SOL z walidacją sum kontrolnych i odtwarzaniem zapisów celowo zaciemnionych
- **Wskaźnik Pewności** – deterministyczne, wersjonowane reguły; każdy punkt ma przesłankę i źródło
- **Odrzucanie fałszywych trafień** – giełdy, kontrakty, miksery, zbiórki, homonimy, adresy cudze, adresy publikowane przez wiele osób, nazwy ENS/Keybase bez wzajemnego potwierdzenia
- **Wskaźniki wyjścia do fiat** – wysyłki na giełdy, wnioskowane adresy depozytowe, wymiana na stablecoiny, bramki fiat, wzorce P2P, miksery, wolumen w PLN
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

4. Uruchom self-hosted wyszukiwarkę
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
| Głębokość pivotowania | Liczba „skoków” po identyfikatorach odkrytych na profilach podmiotu | 3 |
| Historia (archiwum) | Wersje archiwalne profili i stron (Wayback CDX) do wykrycia podmiany adresu | wł. |
| Harmonogram | Analiza cykliczna (5 min / 1 h / dzień / tydzień) z porównaniem wyników | brak |
| Konektory | Lista źródeł; można wyłączyć wybrane | wszystkie aktywne |

Pivot jest dozwolony **tylko** z dokumentów należących do podmiotu (silne powiązanie). Wyniki wyszukiwania po samym imieniu i nazwisku nie rozszerzają poszukiwań.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Źródła danych

| Źródło | Co daje | Dostęp |
|---|---|---|
| GitHub API + raw | profil, bio, strona, profilowe README (także organizacji), FUNDING.yml | publiczne API; zalecany `GITHUB_TOKEN` |
| Keybase | **kryptograficznie podpisane** adresy krypto i dowody kont (GitHub, X, Reddit, WWW) | publiczne API |
| Gravatar v3 | e-mail (hash) → profil i zweryfikowane konta | publiczne API |
| Telegram `t.me/s/` | publiczny podgląd kanału | bez logowania |
| ENS (RPC) | nazwa `.eth` → adres i rekordy tekstowe | publiczny RPC lub własny węzeł |
| SearXNG (self-hosted) | wyszukiwanie identyfikatorów i adresów w otwartym Internecie, pobranie stron wyników (bez eksploratorów blockchain) | własna instancja |
| Strony WWW | strony linkowane z profili i z wyników | GET z ochroną SSRF |
| Wayback CDX | historyczne wersje profili i stron | publiczne API |
| Blockscout / Etherscan | historia ETH i tokenów, **etykiety i nazwy zweryfikowanych kontraktów** | Blockscout bez klucza |
| `eth_getCode` | flaga kontraktu (bytecode ≠ `0x`) | publiczny RPC |
| Esplora (Blockstream) | historia BTC (do 100 tx) | bez klucza |
| TronGrid | transfery USDT TRC20 | bez klucza |
| NBP + CoinGecko | kurs USD/PLN (tabela A) i bieżące ceny krypto | bez klucza; przy awarii kurs zapasowy z adnotacją |

> **Ograniczenia:** wyniki SearXNG zależą od wyszukiwarek, z których korzysta (część ogranicza liczbę zapytań). GitHub bez tokena ma limit 60 zapytań/h na IP. NBP bywa chwilowo niedostępne. Każdy taki problem trafia do raportu jako błąd konektora, a nie jako cichy „brak wyników”.

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
| Powiązanie słabe – tylko imię i nazwisko lub nazwa ENS/Keybase bez wzajemnego potwierdzenia | −35 |
| Deklaracja własności („mój portfel”, „przelej na”, „wesprzyj”) | +5 |
| **Synergia** – ≥2 niezależne źródła Web2 (wielokrotność w jednym serwisie się nie liczy) | +15 |
| Ten sam adres publikuje ≥3 obcych autorów (zbiórka / giveaway / scam) | −30 |
| Adres tylko w archiwalnej wersji zasobu | −5 |
| Brak weryfikacji w blockchainie | −10 |
| **Bramka:** etykieta CEX / custodial / DEX / kontrakt tokena / mikser / zbiórka / bramka fiat / sankcje, albo `eth_getCode ≠ 0x` | **0%** |

| Przedział | Znaczenie |
|---|---|
| 80–100% | bardzo wysokie prawdopodobieństwo |
| 60–79% | prawdopodobne |
| 40–59% | średnie – wymaga drugiego śladu |
| 1–39% | niskie / szum |
| 0% | wykluczone (fałszywe trafienie) |

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

Wycena odbywa się według kursu bieżącego. Do rozliczeń PIT-38 wymagany jest kurs z dnia transakcji, dlatego raport oznacza wartości w PLN jako do weryfikacji.

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Testy

```sh
npm test
```

28 testów automatycznych, działających bez dostępu do sieci:

- walidacja i ekstrakcja adresów (sumy kontrolne, zaciemnione zapisy, znaki niewidoczne)
- Wskaźnik Pewności (przedziały, synergia, bramki, homonim, adres cudzy, adres u wielu autorów)
- wskaźniki cash-out (swap na stablecoiny, wnioskowany adres depozytowy giełdy)
- numer telefonu
- bezpieczeństwo (ochrona SSRF, allowlista API, protokoły, wzajemne potwierdzenie ENS/Keybase, filtr eksploratorów)

**Scenariusze akceptacyjne** wykonuje się na prawdziwym Internecie, na fikcyjnych kontach testowych zespołu (GitHub, Keybase, Telegram, strona WWW, …) z opublikowanymi adresami portfeli testowych. Każdy scenariusz opisuje, co wpisać do narzędzia i jaki wynik jest oczekiwany: [`docs/scenariusze-testowe.md`](docs/scenariusze-testowe.md).

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
| `ETHERSCAN_API_KEY` | | | Gdy ustawiony – Etherscan v2 zamiast Blockscout |
| `ETH_RPC_URL` | | `https://ethereum-rpc.publicnode.com` | RPC Ethereum (bytecode, ENS); może być własny węzeł |
| `ESPLORA_URL` | | `https://blockstream.info/api` | Esplora dla BTC |
| `TRONGRID_URL` | | `https://api.trongrid.io` | TronGrid dla TRON |
| `OLCYS_MAX_DEPTH` | | `3` | Domyślna głębokość pivotowania |
| `OLCYS_SEARCH_RESULTS` | | `8` | Liczba wyników wyszukiwarki pobieranych na zapytanie |
| `OLCYS_LIVE_RATES` | | `true` | Kursy z NBP i CoinGecko |
| `LLM_BASE_URL` | | | API zgodne z OpenAI (Ollama, vLLM, LocalAI, LiteLLM) |
| `LLM_MODEL` | | `llama3.1` | Model do klasyfikacji kontekstu |

<p align="right">(<a href="#readme-top">powrót na górę</a>)</p>

---

## Bezpieczeństwo i zgodność

- Zapytania API zawierające identyfikatory trafiają **wyłącznie** do zatwierdzonych hostów; pozostałe są blokowane i logowane.
- Pobieranie stron odkrytych w dowodach blokuje adresy prywatne, pętli zwrotnej i link-local (ochrona SSRF w sieci wewnętrznej); każde przekierowanie jest sprawdzane **przed** wykonaniem.
- Kopie dowodów serwowane są jako `text/plain` z CSP `sandbox` – żaden skrypt ze źródła się nie wykona.
- Każda operacja (utworzenie analizy, przebieg, podgląd, raport, eksport) trafia do dziennika audytu; nagłówek `x-olcys-user` to miejsce na integrację z SSO/RBAC KAS.
- Brak telemetrii i zależności od chmury publicznej.

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

- Kolejne konektory: Reddit, X/Bluesky, Nostr (NIP-05), OLX/Allegro, Bitcointalk
- Dekodowanie kodów QR z obrazów (adresy publikowane jako grafika)
- Pełne zbiory etykiet (OFAC SDN, otwarte repozytoria etykiet) i ich automatyczna aktualizacja
- Klastrowanie adresów BTC (common-input-ownership), kursy historyczne NBP na dzień transakcji
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
