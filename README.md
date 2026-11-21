# 🦉 OŁCyŚ – Osintowy Łapacz Cyfrowych Śladów

Narzędzie OSINT dla analityków **Krajowej Administracji Skarbowej**. Na podstawie co najmniej jednego identyfikatora (nick, e-mail, telefon, Telegram, imię i nazwisko, URL, adres krypto) automatycznie przeszukuje publiczne źródła, wyodrębnia adresy kryptowalutowe i liczy **Wskaźnik Pewności** powiązania adresu z osobą. Odrzuca fałszywe trafienia (giełdy, kontrakty, miksery, zbiórki). Analizuje aktywność adresów w blockchainie pod kątem **wyjścia do walut tradycyjnych (cash-out)**. Wynik to raport z pełnym łańcuchem dowodowym.

> HackNation 2026 · zadanie Ministerstwa Finansów „OŁCyŚ”. Narzędzie działa na realnych, publicznie dostępnych źródłach Internetu. Scenariusze testowe korzystają z fikcyjnych kont testowych założonych przez zespół, a nie z danych prawdziwych osób.

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

### Źródła w trybie Internet (live) – sprawdzone na żywo

| Źródło | Co daje | Dostęp |
|---|---|---|
| GitHub API + raw | profil, bio, strona, profilowe README (także organizacji), FUNDING.yml | publiczne API; zalecany `GITHUB_TOKEN` (bez uprawnień) |
| Keybase | **kryptograficznie podpisane** adresy krypto i dowody kont (GitHub, X, Reddit, WWW) | publiczne API |
| Gravatar v3 | e-mail (hash) → profil i zweryfikowane konta | publiczne API (portfele tylko z kluczem API) |
| Telegram `t.me/s/` | publiczny podgląd kanału | bez logowania |
| ENS (RPC) | nazwa `.eth` → adres i rekordy tekstowe | publiczny RPC lub własny węzeł |
| SearXNG (self-hosted) | wyszukiwanie nicku, e-maila, telefonu i adresu w otwartym Internecie + pobranie stron wyników (bez eksploratorów blockchain) | własna instancja w `docker compose` |
| Strony WWW | strony linkowane z profili i z wyników | GET z ochroną SSRF |
| Wayback CDX | historyczne wersje profili i stron → podmiana adresu | publiczne API |
| Blockscout / Etherscan | historia ETH i tokenów, **etykiety i nazwy zweryfikowanych kontraktów** (krok 3.1) | Blockscout bez klucza |
| `eth_getCode` | flaga kontraktu (krok 3.2) | publiczny RPC |
| Esplora (Blockstream) | historia BTC (do 100 tx) | bez klucza |
| TronGrid | transfery USDT TRC20 | bez klucza |
| NBP + CoinGecko | kurs USD/PLN (tabela A) i bieżące ceny krypto | bez klucza; przy awarii kurs zapasowy z adnotacją |

**Otwarte przestrzenie nazw (ENS, Keybase):** nazwę `.eth` czy konto Keybase o danej nazwie może zarejestrować każdy. Zgodność z nickiem daje tylko powiązanie **słabe** (−35), dopóki nie ma wzajemnego potwierdzenia. Dla Keybase to zweryfikowany dowód konta o tym nicku, dla ENS inny profil podmiotu wskazujący tę nazwę `.eth` albo adres. Przykład z testu na żywo: `torproject.eth` bez potwierdzenia ma 55% zamiast 90%.

**Wzmianka (MENTION, −20):** strona z wyników wyszukiwania, na której identyfikator podmiotu występuje w tym samym fragmencie co adres. Autor treści pozostaje niepotwierdzony.

**Ograniczenia źródeł na żywo:** wyniki SearXNG zależą od wyszukiwarek, z których korzysta (część ogranicza liczbę zapytań). GitHub bez tokena ma limit 60 zapytań/h na IP. NBP bywa chwilowo niedostępne i wtedy używany jest kurs zapasowy z adnotacją w raporcie. Każdy taki problem trafia do raportu jako błąd konektora, a nie jako cichy „brak wyników”.

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

Polecenie uruchamia API (`:4000`) i UI (`:5173`). Otwórz http://localhost:5173, wpisz identyfikator i kliknij **Uruchom analizę**.

Do wyszukiwania w otwartym Internecie uruchom własną instancję SearXNG i skopiuj konfigurację (domyślne wartości działają bez kluczy):
```bash
docker compose up -d searxng
```
```bash
cp .env.example .env
```
**Ustaw `GITHUB_TOKEN`** (token bez uprawnień, tylko dane publiczne). Bez niego GitHub pozwala na 60 zapytań/h na adres IP, a we wspólnej sieci limit bywa wyczerpany od razu. Narzędzie zgłasza to wtedy jako błąd konektora w raporcie i pobiera tylko pliki raw (README, FUNDING.yml).

### Docker (PostgreSQL, tryb docelowy)
```bash
docker compose up --build
```
UI i API: http://localhost:4000. Opcjonalny lokalny model AI: `docker compose --profile ai up`, a w `.env` ustaw `LLM_BASE_URL=http://ollama:11434/v1`.

### Analiza z linii poleceń
```bash
npm run cli -- nick=<login_testowy> email=<adres> phone=<numer> --html raport.html
```

### Analiza cykliczna (zmiana w czasie)
Ustaw harmonogram analizy (np. co 5 min) i zmień coś na koncie testowym, np. podmień adres w bio. Kolejny przebieg pokaże kartę **Zmiany względem poprzedniego przebiegu**.

## 7. Testy i scenariusze testowe

```bash
npm test
```

28 testów automatycznych, działających bez sieci:
- walidacja i ekstrakcja adresów (sumy kontrolne, zaciemnione zapisy, znaki niewidoczne);
- Wskaźnik Pewności (przedziały, synergia, bramki, homonim, adres cudzy, adres u wielu autorów);
- wskaźniki cash-out (swap na stablecoiny, wnioskowany adres depozytowy giełdy);
- numer telefonu;
- bezpieczeństwo trybu live (ochrona SSRF, allowlista API, protokoły, wzajemne potwierdzenie ENS/Keybase, filtr eksploratorów).

**Scenariusze akceptacyjne** wykonuje się na prawdziwym Internecie, na fikcyjnych kontach testowych zespołu (GitHub, Keybase, Telegram, strona WWW, …) z opublikowanymi adresami portfeli testowych. Każdy scenariusz opisuje, co wpisać do narzędzia i jaki wynik jest oczekiwany. Opis scenariuszy: `docs/scenariusze-testowe.md` (do uzupełnienia przez zespół).

## 8. Architektura (monorepo, npm workspaces)

| Katalog | Zawartość |
|---|---|
| `packages/core` | czysta logika bez I/O: walidacja adresów (BTC/LTC Base58Check + Bech32/Bech32m, ETH EIP-55, TRON, SOL), ekstrakcja i deobfuskacja, kontekst, etykiety, Wskaźnik Pewności, analiza cash-out, diff |
| `packages/engine` | konektory Web2, dostawcy blockchain, kontrolowany `fetch` (allowlista), pipeline, raport HTML, opcjonalny klient LLM |
| `apps/api` | Fastify + PostgreSQL / pamięć: analizy, przebiegi, harmonogram, diff, dowody, eksport, dziennik audytu |
| `apps/web` | React + Vite: formularz, etapy scenariusza, graf powiązań (Cytoscape), rozpisanie wyniku regułami, chronologia przepływów, fakty / obliczenia / wnioski, źródła |
| `data/labels` | zbiory etykiet adresów (JSON, z opisem pochodzenia i licencji) |

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
