# 🦉 OŁCyŚ – Osintowy Łapacz Cyfrowych Śladów

Narzędzie OSINT dla analityków **Krajowej Administracji Skarbowej**. Na podstawie co najmniej jednego identyfikatora (nick, e-mail, telefon, Telegram, imię i nazwisko, URL, adres krypto) automatycznie przeszukuje publiczne źródła, wyodrębnia adresy kryptowalutowe i liczy **Wskaźnik Pewności** powiązania adresu z osobą. Odrzuca fałszywe trafienia (giełdy, kontrakty, miksery, zbiórki). Analizuje aktywność adresów w blockchainie pod kątem **wyjścia do walut tradycyjnych (cash-out)**. Wynik to raport z pełnym łańcuchem dowodowym.

> HackNation 2026 · zadanie Ministerstwa Finansów „OŁCyŚ”. Repozytorium zawiera wyłącznie dane **syntetyczne** – fikcyjna persona „Jan Testowy” i wygenerowane adresy.

---

## 1. Problem i rozwiązanie

Podatnicy publikują adresy portfeli na forach, w ogłoszeniach P2P, na profilach programistycznych i w komunikatorach. Ręczne łączenie tych śladów z historią transakcji jest czasochłonne i trudne do powtórzenia. OŁCyŚ automatyzuje ten proces:

```
Identyfikatory ──► Konektory Web2 ──► Dowody (URL, czas, SHA-256, kopia) ──► Pivot (nowe identyfikatory)
                                                │
                                                ▼
                    Ekstrakcja + walidacja adresów (sumy kontrolne, deobfuskacja)
                                                │
                     Autor ↔ tożsamość podmiotu (DIRECT / PIVOT / WEAK) + kontekst
                                                │
               Klasyfikacja: etykiety, bytecode ──► BRAMKA 0% (CEX, DEX, kontrakt, mikser, zbiórka)
                                                │
                       Wskaźnik Pewności (reguły, wersjonowane) ──► Aktywność blockchain
                                                │                 (swap→stablecoin, depozyt giełdy,
                                                ▼                  off-ramp, P2P, mikser, wolumen PLN)
                     Raport: FAKTY · OBLICZENIA · WNIOSKI DO WERYFIKACJI + diff przebiegów
```

## 2. Założenia projektu

- **Tylko źródła publiczne**: bez logowania, bez obchodzenia zabezpieczeń, bez wycieków danych. Każdy konektor opisuje swoją podstawę zgodności (zakładka *Źródła i zgodność*).
- **Wyjaśnialność ponad „czarną skrzynkę”**: Wskaźnik Pewności liczą deterministyczne reguły. Każda reguła zapisuje wartość, przesłankę i wystąpienia, na których się opiera. AI pełni tylko rolę pomocniczą.
- **Odtwarzalność**: każdy przebieg zapisuje surowe kopie dowodów z SHA-256, czasem pobrania i URL. Zapisuje też parametry wyszukiwania, wersję silnika i wersję reguł, a całość można wyeksportować jako pakiet JSON.
- **Kontrola ruchu wychodzącego**: allowlista hostów. Żądania poza listą są blokowane i logowane, więc dane nie trafiają do niezatwierdzonych usług.
- **On-prem**: wszystkie komponenty działają lokalnie (Docker Compose). Model AI jest lokalny i wymienny przez API zgodne z OpenAI. Dostawcę danych blockchain można zastąpić własnym węzłem KAS.
- **Rozszerzalność**: nowe źródło Web2 to klasa `SourceConnector`, nowa sieć to `ChainProvider` i walidator adresu, nowe zbiory etykiet to plik JSON w `data/labels/`.

## 3. Parametry wyszukiwania

| Parametr | Opis | Domyślnie |
|---|---|---|
| Identyfikatory | `nick`, `email`, `phone`, `telegram`, `name`, `url`, `address` (min. 1). Telefon normalizowany do E.164 (domyślnie +48); numer w treści ogłoszenia wiąże autora z podmiotem także przy innym nicku | – |
| Głębokość pivotowania | Ile „skoków” po identyfikatorach odkrytych na profilach podmiotu (GitHub → WWW → telefon → konto-alias…) | 3 |
| Historia (archiwum) | Pobiera wersje archiwalne profili i stron (Wayback CDX), żeby wykryć podmianę adresu | wł. |
| Harmonogram | Analiza cykliczna (5 min / 1 h / dzień / tydzień) z porównaniem wyników | brak |
| Konektory | Lista źródeł; można wyłączyć wybrane | wszystkie aktywne |

Pivot jest dozwolony **tylko** z dokumentów należących do podmiotu (silne powiązanie). Wyniki wyszukiwania po samym imieniu i nazwisku nie rozszerzają poszukiwań.

**Źródła Web2:** GitHub (profil, README, FUNDING.yml), Gravatar (e-mail → hash → portfele krypto i zweryfikowane konta), strony WWW (linki `rel=me`), publiczny podgląd kanałów Telegram (`t.me/s/`), forum branżowe, portal ogłoszeń P2P, ENS (`.eth` → adres i rekordy tekstowe; przez JSON-RPC) oraz archiwum Internetu (Wayback CDX).
**Web3:** Etherscan API v2 (EVM), Esplora (BTC – możliwy self-hosting, np. mempool), TronGrid (USDT TRC20). Do demo i testów służą fixtures.

## 4. Wskaźnik Pewności (`olcys-score/1.0.0`)

`wynik = min(100, max(0, BAZA(najlepsze wystąpienie) + Σ korekt))`, a adres z kategorii wykluczonej dostaje **0%**.

| Reguła | Wartość |
|---|---|
| Baza: autorski profil / strona (GitHub, WWW, zweryfikowane konto) | 85 |
| Baza: ogłoszenie sprzedaży, rozliczenie w komunikatorze | 70 |
| Baza: dyskusja na forum | 50 |
| Baza: masowe komentarze (giveaway, konkurs) | 20 |
| Baza: autor wskazuje adres cudzy („wpłaciłem na…”, „adres giełdy”, „scam”) | 15 |
| Powiązanie pośrednie (identyfikator z pivotu) | −5 |
| Powiązanie słabe – zgodne tylko imię i nazwisko (możliwy homonim) | −35 |
| Deklaracja własności („mój portfel”, „przelej na”, „wesprzyj”) | +5 |
| **Synergia** – ≥2 niezależne rodziny źródeł (wielokrotność w jednym serwisie się nie liczy) | +15 |
| Ten sam adres publikuje ≥3 obcych autorów (zbiórka / giveaway / scam) | −30 |
| Adres tylko w archiwalnej wersji zasobu | −5 |
| Brak weryfikacji w blockchainie | −10 |
| **Bramka:** etykieta CEX / custodial / DEX / kontrakt tokena / mikser / zbiórka / bramka fiat / sankcje, albo `eth_getCode ≠ 0x` | **0%** |

Przedziały: 80–100 bardzo wysokie · 60–79 prawdopodobne · 40–59 średnie (wymaga drugiego śladu) · 1–39 niskie/szum · 0 wykluczone.

## 5. Wskaźniki wyjścia do fiat (cash-out)

| Wskaźnik | Logika | Charakter |
|---|---|---|
| `CEX_DIRECT` | wysyłka na adres z etykietą giełdy / custodial | obliczenie |
| `CEX_DEPOSIT_INFERRED` | adres pośredni przekazał ≥90% otrzymanych środków do giełdy w ≤72 h (wzorzec „sweep” konta depozytowego) | wniosek |
| `STABLECOIN_SWAP` | wymiana przez DEX z wpływem stablecoinów ≥1000 USD | obliczenie |
| `OFFRAMP` | interakcja z bramką krypto-fiat, kantorem, kartą krypto | obliczenie |
| `P2P_PATTERN` | ≥4 okrągłe wpłaty stablecoin od różnych nieoznaczonych adresów lub kontakt z usługą P2P | wniosek |
| `MIXER_EXPOSURE` | kontakt z mikserem / podmiotem sankcjonowanym | obliczenie |
| `HIGH_VOLUME` | łączny wolumen ≥20 000 USD (z przeliczeniem na PLN) | obliczenie |

## 6. Uruchomienie

### Szybki start (bez Dockera, magazyn w pamięci)
Wymagany Node.js ≥ 20.11.

```bash
npm install
```

```bash
npm run dev
```

Polecenie uruchamia mini-internet (`:4100`), API (`:4000`) i UI (`:5173`). Otwórz http://localhost:5173, kliknij **Wczytaj scenariusz demo**, a potem **Uruchom analizę**.

### Docker (PostgreSQL, tryb docelowy)
```bash
docker compose up --build
```
UI i API: http://localhost:4000. Opcjonalny lokalny model AI: `docker compose --profile ai up`, a w `.env` ustaw `LLM_BASE_URL=http://ollama:11434/v1`.

### Tryb live (realne źródła)
Skopiuj `.env.example` do `.env`, ustaw `OLCYS_MODE=live` i `CHAIN_PROVIDER=live`, dopisz zatwierdzone hosty do `EGRESS_ALLOWLIST` oraz klucze API. **Ustaw `GITHUB_TOKEN`**: bez niego GitHub pozwala na 60 zapytań/h na adres IP, a we wspólnej sieci limit bywa wyczerpany od razu. Narzędzie zgłasza to wtedy jako błąd konektora w raporcie i pobiera tylko pliki raw (README, FUNDING.yml).

```bash
OLCYS_MODE=live EGRESS_ALLOWLIST=api.github.com,raw.githubusercontent.com,web.archive.org npm run demo:cli -- nick=<konto_testowe>
```

### Analiza z linii poleceń
```bash
npm run demo:cli -- nick=krypto_janek email=jan.testowy@example.com --html raport.html
```

### Demo analizy cyklicznej (zmiana w czasie)
Utwórz analizę z harmonogramem i przełącz mini-internet w stan „po zmianie”:
```bash
curl "localhost:4100/__scenario?v=2"
```
W stanie v2 nowy adres pojawia się w bio GitHub i na kanale Telegram. Kolejny przebieg pokaże kartę **Zmiany względem poprzedniego przebiegu**. Powrót do stanu początkowego: `?v=1`.

## 7. Scenariusze testowe (dane syntetyczne)

```bash
npm test
```

38 testów jednostkowych i akceptacyjnych. Scenariusze akceptacyjne (`packages/engine/test/scenario.test.ts`) przechodzą pełny przebieg wymagany w zadaniu na mini-internecie:

| # | Sprawdza | Oczekiwany wynik |
|---|---|---|
| S1 | odnajdywanie adresów i łączenie źródeł | portfel ETH z GitHub + Gravatar + WWW (zapis zaciemniony) → 100%; pivot GitHub → Telegram; TRON z P2P i kanału → 85% |
| S2 | odrzucanie fałszywych trafień | Binance (etykieta), router Uniswap, kontrakt NFT (bytecode), zbiórka → 0%; adres organizatora giveaway → 0%; giveaway → <40%; homonim → <40% |
| S3 | aktywność blockchain | swap ETH → USDT, wysyłka na Krakena, wnioskowany depozyt Binance; mikser na starym adresie |
| S5 | telefon łączy konto alias | strona WWW → telefon → ogłoszenie P2P innego konta (`jt_handel`) → forum → adres 85% z synergią |
| S4 | źródła i odtwarzalność | podmiana adresu na stronie WWW (archiwum 2024 → 2025); każdy dowód ma URL, czas i SHA-256; raport rozróżnia fakty, obliczenia i wnioski; host spoza allowlisty jest zablokowany |

Przykładowy wynik (`npm run demo:cli`):
```
100%  BARDZO_WYSOKIE  ETH  0x1a04d94f740Ec5024E8Fb48b96b9e8792CcD1531  UNHOSTED
      BASE_OFFICIAL_PROFILE(+85) OWNERSHIP_CLAIM(+5) SYNERGY(+15) CAP_100(-5)
      ⚑ CEX_DIRECT / CEX_DEPOSIT_INFERRED / STABLECOIN_SWAP / HIGH_VOLUME
 85%  BARDZO_WYSOKIE  TRON TURVC3w6WpExTAAggpTV7DbFuURQsJPtrd  UNHOSTED
      BASE_SALE_OR_SETTLEMENT(+70) SYNERGY(+15)       ⚑ OFFRAMP / P2P_PATTERN
 35%  NISKIE          ETH  0xad3A…76Bf (homonim)       BASE_SALE_OR_SETTLEMENT(+70) IDENTITY_WEAK(-35)
  0%  WYKLUCZONE      ETH  0x28C6…1d60  CEX – Binance 14 (hot wallet)   GATE_CEX
  0%  WYKLUCZONE      ETH  0x24cC…346b  SMART_CONTRACT                  GATE_SMART_CONTRACT
```

## 8. Architektura (monorepo, npm workspaces)

| Katalog | Zawartość |
|---|---|
| `packages/core` | czysta logika bez I/O: walidacja adresów (BTC/LTC Base58Check + Bech32/Bech32m, ETH EIP-55, TRON, SOL), ekstrakcja i deobfuskacja, kontekst, etykiety, Wskaźnik Pewności, analiza cash-out, diff |
| `packages/engine` | konektory Web2, dostawcy blockchain, kontrolowany `fetch` (allowlista), pipeline, raport HTML, opcjonalny klient LLM |
| `apps/api` | Fastify + PostgreSQL / pamięć: analizy, przebiegi, harmonogram, diff, dowody, eksport, dziennik audytu |
| `apps/web` | React + Vite: formularz, etapy scenariusza, graf powiązań (Cytoscape), rozpisanie wyniku regułami, chronologia przepływów, fakty / obliczenia / wnioski, źródła |
| `apps/mock-web` | syntetyczny mini-internet o kształcie realnych API (GitHub API, Gravatar v3, `t.me/s`, Wayback CDX) |
| `data/labels` | zbiory etykiet adresów (JSON, z opisem pochodzenia i licencji) |
| `fixtures` | syntetyczne transakcje i kursy (`scripts/build-demo-fixtures.ts`) |

Bezpieczeństwo: kopie dowodów serwowane są jako `text/plain` z CSP `sandbox` (żaden skrypt ze źródła się nie wykona). Każda operacja trafia do dziennika audytu. Nagłówek `x-olcys-user` to miejsce na integrację z SSO/RBAC KAS. Brak telemetrii.

## 9. Licencje komponentów

Wszystkie zależności są Open Source. Bezpośrednie zależności:

| Komponent | Licencja | | Komponent | Licencja |
|---|---|---|---|---|
| React, React DOM | MIT | | Fastify, @fastify/cors, @fastify/static | MIT |
| Vite, @vitejs/plugin-react | MIT | | node-postgres (`pg`) | MIT |
| Cytoscape.js | MIT | | Zod | MIT |
| cheerio | MIT | | @noble/hashes, @scure/base | MIT |
| TypeScript | Apache-2.0 | | tsx, Vitest, concurrently | MIT |
| PostgreSQL (obraz Docker) | PostgreSQL License | | Ollama (opcjonalnie) | MIT |

Zależności przechodnie: MIT, ISC, BSD-2/3-Clause, Apache-2.0, BlueOak-1.0.0, 0BSD, CC-BY-4.0 (dane). Pełny raport: `npm run licenses`.

## 10. Dalszy rozwój

- Kolejne konektory: Reddit, X/Bluesky, Nostr (NIP-05), Keybase, OLX/Allegro, wyszukiwarka SearXNG self-hosted.
- Dekodowanie kodów QR z obrazów (adresy publikowane jako grafika).
- Pełne zbiory etykiet (OFAC SDN, otwarte repozytoria etykiet) i ich automatyczna aktualizacja.
- Klastrowanie adresów BTC (common-input-ownership), kursy historyczne NBP do wyceny w PLN na dzień transakcji.
- Eksport raportu do PDF po stronie serwera, podpis elektroniczny pakietu dowodowego.
