# Scenariusze testowe – OŁCyŚ

Scenariusze akceptacyjne wykonywane **na prawdziwym Internecie**, na dwóch fikcyjnych personach z kontami testowymi założonymi przez zespół. Żadne dane nie dotyczą prawdziwych osób. Adresy portfeli person (poza portfelem głównym Błażeja) są syntetyczne – nie mają właściciela ani historii.

Każdy scenariusz opisuje: co wpisać do narzędzia, jaki wynik jest oczekiwany i kiedy scenariusz uznajemy za zaliczony. Wartości „wynik na żywo” pochodzą z przebiegów z 21.11.2026.

---

## Mapa scenariuszy na kryteria oceny

| # | Scenariusz | Kryterium z treści zadania | Waga |
|---|---|---|---|
| S1 | Pełny przebieg analizy (Błażej, od nicku) | obowiązkowy scenariusz prezentacji; zgodność z wyzwaniem | 25% |
| S2 | Od e-maila do komunikatora pod innym nickiem (Kordas) | łączenie informacji z różnych źródeł; oryginalność | 25% / 15% |
| S3 | Wskaźnik Pewności – wszystkie przedziały | jakość Wskaźnika Pewności | 25% |
| S4 | Odrzucanie fałszywych trafień | ograniczanie błędnych przypisań | 25% |
| S5 | Otwarta przestrzeń nazw (ENS) – powiązanie słabe | ograniczanie błędnych przypisań | 25% |
| S6 | Aktywność w blockchainie i wyjście do fiat | wykrywanie wzorców aktywności (wymagane) | 25% |
| S7 | Podmiana adresu w czasie (analiza cykliczna) | kryterium opcjonalne; cykliczność, porównanie wyników | 15% |
| S8 | Szukanie po samym adresie krypto | wejście: publiczny adres kryptowalutowy | 25% |
| S9 | Źródła, raport, odtwarzalność | przejrzystość raportu i źródeł | 20% |
| S10 | Bezpieczeństwo ruchu wychodzącego | potencjał wdrożeniowy, wymaganie 5.7 | 15% |
| S11 | Tryb offline (nagranie i odtworzenie) | potencjał wdrożeniowy, odtwarzalność | 15% / 20% |
| – | 40 testów automatycznych (`npm test`) | jakość architektury | 15% |

---

## Persony i konta

### Persona 1 – Błażej Rzepecki (programista, rozliczenia P2P)

| Element | Wartość | Stan |
|---|---|---|
| Nick (wszędzie ten sam) | `blazejrzepdev` | – |
| E-mail | `blazej.rzepecki.dev99@proton.me` | ✅ |
| GitHub | `github.com/blazejrzepdev` – bio `Błażej Rzepecki \| Dev \| TG: @blazejrzepdev \| Konto testowe HackNation 2026`, profilowe README z portfelem | ✅ |
| Telegram | `t.me/blazejrzepdev` – rozliczenie, pułapki USDT i Binance, 2 posty giveaway/airdrop | ✅ |
| dev.to | `dev.to/blazejrzepdev` – post „Sprzedam sprzęt / wymiana P2P” | ⏳ opcjonalnie |
| Reddit | – | ❌ API wymaga zatwierdzonej aplikacji; zastąpiony Telegramem |
| Portfel główny (ETH, prawdziwy) | `0x396343362be2A4dA1cE0C1C210945346fb82Aa49` | ⏳ potrzebne transakcje (S6) |
| Adres szumu (syntetyczny) | `0xD37d9ce749ffD5E9E52b03928815170E501eeBeF` | ✅ |
| Drugi portfel (do S7) | drugie konto MetaMask | ⏳ |

### Persona 2 – Ksawery Kordas (sprzedawca sprzętu IT)

| Element | Wartość | Stan |
|---|---|---|
| E-mail (punkt wejścia) | `ksawery.kordas.dev@proton.me` | ✅ |
| Gravatar | profil „Ksawery Kordas” ze zweryfikowanym kontem GitHub | ✅ |
| GitHub | `github.com/kordas-dev` – bio, Website, profilowe README z ETH | ✅ |
| Strona WWW | `kordas-dev.github.io` – BTC, pułapka zbiórki, link do Telegrama | ✅ |
| Telegram (inny nick!) | `t.me/kordas_sprzedaz` – ogłoszenie z TRON, rozliczenie ETH, ostrzeżenie „scam” | ✅ |
| ETH / BTC / TRON (syntetyczne) | `0xd3e785eFf14Af8454Af1DCe3bA63321123bCE61C` / `bc1qj2xp3cuqeuldce3h36q3d2q7d5jrt474q8mtqz` / `TPL5VC5b8Nt7Kvhq2VvvJq5nTp6y9zbZoc` | ✅ |
| Adres „scam” (syntetyczny) | `0x5b2095eC0EA6484C2BF656d861E163971e240435` | ✅ |

### Przygotowanie środowiska

1. `.env`: `GITHUB_TOKEN` (token bez uprawnień, tylko dane publiczne) – **wymagany**.
2. `.env`: `OLCYS_REDDIT=false` (bez zatwierdzonej aplikacji Reddit zwraca 403).
3. Bez własnej instancji SearXNG: zakomentuj `SEARXNG_URL` albo wyłącz konektor `search` w analizie.
4. `npm run dev` → http://localhost:5173.

---

## S1 – Pełny przebieg analizy (obowiązkowy)

**Cel:** wszystkie etapy wymaganego scenariusza: dane wejściowe → ślady OSINT → wykrycie i weryfikacja adresu → Wskaźnik Pewności → odrzucenie błędnych przypisań → aktywność blockchain → źródła i wynik.

**Wejście:** `nick = blazejrzepdev`, głębokość pivotowania 2.

**Oczekiwany wynik:**

| Adres | Wynik | Reguły | Wynik na żywo |
|---|---|---|---|
| `0x3963…Aa49` (portfel główny) | **100%** | `BASE_OFFICIAL_PROFILE +85`, `OWNERSHIP_CLAIM +5` („wesprzyj”), `SYNERGY +15` (github + telegram), ograniczenie do 100 | 100% ✅ |
| `0xD37d…eBeF` (giveaway) | **25%** | `BASE_MASS_COMMENT +20`, `OWNERSHIP_CLAIM +5`, bez synergii | 25% ✅ |
| `0xdAC1…1ec7` (USDT) | **0%** | `GATE_TOKEN_CONTRACT` | 0% ✅ |
| `0x28C6…1d60` (Binance) | **0%** | `GATE_CEX` | 0% ✅ |

Tożsamości odkryte pivotem: `name: Błażej Rzepecki`, `telegram: blazejrzepdev`, `email: blazej.rzepecki.dev99@proton.me`. Pasek etapów pokazuje 7 etapów; etap „Blockchain” jest ukończony dopiero po S6 (patrz niżej).

**Kryterium zaliczenia:** wszystkie etapy widoczne w jednym przebiegu, portfel główny ≥ 80% z regułą `SYNERGY`, pułapki 0%, a po S6 – co najmniej jeden wskaźnik aktywności dla portfela głównego.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| 21.11.2026 | `run_e4914b072e4f` | 100 / 25 / 0 / 0 | brak aktywności blockchain – portfel bez transakcji |

---

## S2 – Od e-maila do komunikatora pod innym nickiem

**Cel:** narzędzie samo łączy kropki: z jednego e-maila dochodzi do kanału Telegram, którego nazwy nie było na wejściu ani na GitHubie.

**Wejście:** wyłącznie `email = ksawery.kordas.dev@proton.me`, głębokość pivotowania 3.

**Oczekiwana ścieżka** (Przebieg i parametry → Tożsamości, graf powiązań):
`email` → Gravatar (zweryfikowane konto) → `nick: kordas-dev` → `url: https://kordas-dev.github.io` → `telegram: kordas_sprzedaz` – wszystkie ze statusem **PIVOT** i źródłem odkrycia.

**Oczekiwany wynik:**

| Adres | Źródło | Wynik | Reguły | Wynik na żywo |
|---|---|---|---|---|
| ETH `0xd3e7…E61C` | GitHub + Telegram | **100%** | `+85 −5 (pivot) +5 +15 (synergia)` | 100% ✅ |
| BTC `bc1qj2…mtqz` | strona WWW | **85%** | `+85 −5 +5` | 75% ⚠️ (Blockstream niedostępne → `UNVERIFIED_ON_CHAIN −10`; powtórzyć) |
| TRON `TPL5…bZoc` | Telegram | **70%** | `BASE_SALE_OR_SETTLEMENT +70 −5 +5` | 70% ✅ |
| `0x5b20…0435` („scam”) | Telegram | **10%** | `BASE_THIRD_PARTY_REFERENCE +15 −5` | 10% ✅ |
| `0x165C…5e14` (zbiórka) | strona WWW | **0%** | `GATE_CHARITY` | 0% ✅ |

**Kryterium zaliczenia:** kanał `kordas_sprzedaz` odkryty bez podawania go na wejściu; adresy z różnych źródeł przypisane z różną pewnością zgodnie z kontekstem.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| 21.11.2026 | `run_b8a052243462` | 100 / 75 / 70 / 10 / 0 | BTC −10 przez chwilową niedostępność Esplora |

---

## S3 – Wskaźnik Pewności: wszystkie przedziały

**Cel:** pokazać, że algorytm różnicuje przesłanki, a każdy wynik da się rozpisać na reguły (zakładka Adresy → „Jak powstał wynik”).

**Wejście:** wyniki z S1, S2 i S5 (bez nowych przebiegów).

| Przedział | Przykład | Wynik | Przesłanka |
|---|---|---|---|
| 80–100% bardzo wysokie | portfel Błażeja / ETH Kordasa | 100% | autorski profil + drugie niezależne źródło |
| 80–100% bardzo wysokie | BTC Kordasa | 85% | własna strona WWW, jedno źródło |
| 60–79% prawdopodobne | TRON Kordasa | 70% | ogłoszenie sprzedaży w komunikatorze |
| 40–59% średnie | `torproject.eth` (S5) | 55% | otwarta przestrzeń nazw bez potwierdzenia |
| 1–39% niskie / szum | giveaway Błażeja | 25% | masowy komentarz / konkurs |
| 1–39% niskie / szum | „scam” u Kordasa | 10% | autor wskazuje adres cudzy |
| 0% wykluczone | USDT, Binance, zbiórka | 0% | bramka etykiet / bytecode |

**Kryterium zaliczenia:** każdy przedział reprezentowany; dla każdego adresu tabela reguł sumuje się do wyniku; wynik deterministyczny (ten sam przy ponownym przebiegu, poza zmianą danych źródłowych).

---

## S4 – Odrzucanie fałszywych trafień

**Cel:** adresy, których nie wolno przypisać osobie, dostają 0%, ale interakcja jest odnotowana.

| Adres | Gdzie opublikowany | Jak rozpoznany | Reguła |
|---|---|---|---|
| `0xdAC17F958D2ee523a2206206994597C13D831ec7` | Telegram Błażeja („sprawdzał ktoś ten kontrakt”) | etykieta kontraktu tokena + słowo „kontrakt” | `GATE_TOKEN_CONTRACT` |
| `0x28C6c06298d514Db089934071355E5743bf21d60` | Telegram Błażeja („wypłacałem z Binance”) | etykieta giełdy (Binance) | `GATE_CEX` |
| `0x165CD37b4C644C2921454429E7F9358d18A45e14` | strona Kordasa („wpłaciłem na zbiórkę”) | etykieta zbiórki | `GATE_CHARITY` |
| `0x5b2095eC…0435` | Telegram Kordasa („uważajcie, to scam”) | kontekst: adres cudzy | `BASE_THIRD_PARTY_REFERENCE` (10%) |
| `0xD37d…eBeF` | Telegram Błażeja, 2× giveaway | kontekst: masowy komentarz, jeden serwis | 25%, brak `SYNERGY` |

**Kryterium zaliczenia:** trzy adresy instytucjonalne = 0%, adres cudzy i szum < 40%, a adresy główne person nie są obniżone przez sąsiedztwo pułapek.

---

## S5 – Otwarta przestrzeń nazw (ENS): powiązanie słabe

**Cel:** nazwa `.eth` zgodna z nickiem nie wystarcza do przypisania – każdy może ją zarejestrować. Scenariusz na prawdziwych danych publicznej organizacji, bez kont testowych.

**Wejście:** `nick = torproject`, głębokość 1.

**Oczekiwany wynik:** adres z rekordu `torproject.eth` – **55%**: `BASE_OFFICIAL_PROFILE +85`, `IDENTITY_WEAK −35`, `OWNERSHIP_CLAIM +5`; w przebiegu wpis „brak wzajemnego potwierdzenia – powiązanie słabe”.

**Kryterium zaliczenia:** wynik w przedziale 40–59% wyłącznie z powodu reguły `IDENTITY_WEAK`.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| 21.11.2026 | `run_e3262860296a` | 55% | ✅ |

---

## S6 – Aktywność w blockchainie i wyjście do fiat (wymagane)

**Cel:** analiza historii przypisanego adresu i wskazanie potencjalnego wyjścia do walut tradycyjnych.

**Przygotowanie (sieć główna Ethereum, drobne kwoty):**
1. Wypłać niewielką kwotę z giełdy na portfel główny Błażeja `0x3963…Aa49`.
2. Odeślij część z portfela na **swój adres depozytowy** na tej samej giełdzie.
3. Odczekaj, aż giełda przeniesie środki z adresu depozytowego do swojego portfela zbiorczego (zwykle minuty–godziny).

**Wejście:** jak w S1 (`nick = blazejrzepdev`).

**Oczekiwany wynik** (Adresy → portfel główny → Aktywność w blockchainie):
- liczba transakcji, wpływy i wypływy w PLN (kurs NBP), okres aktywności;
- wskaźnik `CEX_DEPOSIT_INFERRED` (*wniosek do weryfikacji*: adres pośredni przekazał ≥ 90% środków do giełdy w ≤ 72 h) lub `CEX_DIRECT` (*obliczenie*), gdy odbiorca ma etykietę giełdy;
- chronologia przepływu środków z kontrahentami;
- w pasku etapów: „Blockchain” i „Cash-out” ukończone.

**Kryterium zaliczenia:** co najmniej jeden wskaźnik wyjścia do fiat z rozróżnieniem *obliczenie* / *wniosek do weryfikacji*.

| Data | ID przebiegu | Wskaźniki | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | czeka na transakcje |

---

## S7 – Podmiana adresu w czasie (analiza cykliczna)

**Cel:** narzędzie samo wykrywa zmianę portfela publikowanego na tym samym profilu.

**Kroki:**
1. Otwórz sprawę z S1 i ustaw harmonogram **co 5 minut**.
2. Po zakończonym przebiegu zmień w README `blazejrzepdev/blazejrzepdev` adres na drugi portfel (MetaMask, konto 2).
3. Poczekaj na kolejny przebieg (oznaczony ⟳) albo kliknij „Uruchom ponownie”.

**Oczekiwany wynik:** karta **„Zmiany względem poprzedniego przebiegu”**: nowy adres (drugi portfel) i zmiana wyniku portfela głównego (zostaje tylko na Telegramie: 100% → ok. 70%, bez synergii z GitHubem).

**Kryterium zaliczenia:** zmiana widoczna bez ręcznego porównywania wyników. Po teście przywróć README.

| Data | ID przebiegu 1 | ID przebiegu 2 | Wykryta zmiana |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S8 – Szukanie po samym adresie krypto

**Cel:** wejście = tylko publiczny adres; narzędzie znajduje, kto go opublikował.

**Wejście:** `address = 0x396343362be2A4dA1cE0C1C210945346fb82Aa49`, głębokość 1. Wymaga `GITHUB_TOKEN` i zaindeksowania README przez GitHub (kilka godzin po utworzeniu).

**Oczekiwany wynik:** wystąpienie z profilowego README `blazejrzepdev`; nowa tożsamość `nick: blazejrzepdev` (PIVOT, źródło: wyszukiwanie kodu GitHub); dalej profil i Telegram jak w S1; wynik adresu ≥ 80%.

**Kryterium zaliczenia:** z samego adresu narzędzie dochodzi do konta osoby.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S9 – Źródła, raport i odtwarzalność

**Cel:** każdy wynik da się prześledzić do źródła i odtworzyć (wymagania: źródło, URL, data i czas pozyskania, metadane).

**Kroki** (dowolny przebieg S1–S8):
1. Zakładka **Źródła** – każdy dowód: URL, czas pobrania, SHA-256, konektor.
2. Link **Kopia** – surowa treść zapisana w chwili pobrania (serwowana jako tekst, bez wykonywania skryptów).
3. **Raport PDF** – podsumowanie, parametry wyszukiwania, tożsamości, uzasadnienie reguł, chronologia, fakty / obliczenia / wnioski, łańcuch dowodowy, metodyka.
4. **Pakiet dowodowy** (JSON) – wynik, surowe dowody, parametry, wersje silnika i reguł.
5. Zakładka **Fakty, obliczenia, wnioski** – trzy rodzaje twierdzeń wyraźnie rozdzielone.

**Kryterium zaliczenia:** SHA-256 kopii zgadza się z tabelą źródeł; raport czytelny dla osoby bez wiedzy technicznej.

---

## S10 – Bezpieczeństwo ruchu wychodzącego

**Cel:** narzędzie nie odwołuje się do zasobów wewnętrznych ani niezatwierdzonych usług (wymaganie techniczne 5.7).

**Przygotowanie:** dopisz na stronie Kordasa (`index.html`) link `<a href="http://169.254.169.254/latest/meta-data">status</a>`.

**Wejście:** jak w S2.

**Oczekiwany wynik:** Przebieg i parametry → Ruch wychodzący: wpis **ZABLOKOWANO** dla `169.254.169.254` (ochrona SSRF); analiza kończy się poprawnie; wszystkie zapytania API tylko do hostów z allowlisty (zakładka Źródła i zgodność).

**Kryterium zaliczenia:** żadne żądanie nie trafiło pod adres wewnętrzny. Uzupełnienie: testy automatyczne SSRF i allowlisty (`npm test`).

---

## S11 – Tryb offline (zabezpieczenie prezentacji)

**Cel:** prezentacja nie zależy od Wi-Fi ani limitów źródeł; przebieg da się odtworzyć 1:1.

**Kroki:**
1. W `.env` ustaw `OLCYS_RECORD_DIR=data/recordings/demo`, uruchom aplikację, wykonaj S1, S2, S5 (i S6, gdy gotowe).
2. Zamień na `OLCYS_REPLAY_DIR=data/recordings/demo`, odłącz sieć, powtórz analizy.

**Oczekiwany wynik:** identyczne adresy i wyniki; w przebiegu wpis „Tryb offline: odpowiedzi źródeł odtwarzane z nagrania”; w ruchu wychodzącym wyłącznie odpowiedzi z nagrania.

**Kryterium zaliczenia:** komplet wyników bez dostępu do sieci.

---

## Kolejność na pokazie dla jury (ok. 3 min)

1. **S2 (60 s)** – wpisz sam e-mail; graf powiązań pokazuje ścieżkę e-mail → Gravatar → GitHub → WWW → Telegram pod innym nickiem; kliknij ETH 100%, potem TRON 70% i „scam” 10%.
2. **S1 + S6 (60 s)** – Błażej: 100% z synergią, pułapki USDT i Binance 0%, giveaway 25%; karta aktywności z wyjściem do fiat.
3. **S9 (30 s)** – Raport PDF: fakty / obliczenia / wnioski, łańcuch dowodowy z SHA-256.
4. **S7 (20 s)** – karta „Zmiany względem poprzedniego przebiegu” (przebieg przygotowany wcześniej).
5. **Domknięcie (10 s)** – Źródła i zgodność: allowlista, tylko dane publiczne, tryb offline, 40 testów.

---

## Testy automatyczne (offline)

```sh
npm test
```

40 testów bez dostępu do sieci: walidacja i ekstrakcja adresów, reguły Wskaźnika Pewności, wskaźniki cash-out, numer telefonu, bezpieczeństwo (SSRF, allowlista, wzajemne potwierdzenie, filtr eksploratorów) oraz plan kont testowych odtworzony z nagrań (synergia, pułapki, szum, wyszukiwanie po adresie, warianty nicku, Reddit OAuth).
