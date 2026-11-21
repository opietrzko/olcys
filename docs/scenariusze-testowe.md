# Scenariusze testowe – OŁCyŚ

Scenariusze akceptacyjne wykonywane **na prawdziwym Internecie**, na fikcyjnych kontach testowych założonych przez zespół. Żadne dane nie dotyczą prawdziwych osób.

Każdy scenariusz opisuje: co przygotować na kontach testowych, co wpisać do narzędzia, jaki wynik jest oczekiwany i kiedy scenariusz uznajemy za zaliczony. Pola `⟨…⟩` uzupełnia zespół.

> **Ważne przed przygotowaniem kont**
> - **Wyszukiwarki nie indeksują nowych stron od razu.** Świeżo założone konta mogą nie pojawić się w wynikach SearXNG przez wiele dni. Scenariusze opierają się więc na konektorach bezpośrednich (GitHub, Keybase, Telegram, Gravatar, strony WWW linkowane z profili, ENS), a nie na wyszukiwarce.
> - **Dane blockchain pochodzą z sieci głównych** (Ethereum, Bitcoin, TRON), nie z testnetów. Żeby pokazać wskaźniki wyjścia do fiat, portfel testowy musi mieć prawdziwe transakcje w sieci głównej, np. kilka drobnych przelewów (najtaniej w sieci TRON) lub wysyłkę na adres depozytowy giełdy.
> - Ustaw `GITHUB_TOKEN` w `.env`, inaczej GitHub zablokuje zapytania po limicie 60/h.

---

## 0. Persona testowa i konta

| Element | Wartość | Uwagi |
|---|---|---|
| Imię i nazwisko (fikcyjne) | ⟨np. Adam Testowski⟩ | nie może należeć do prawdziwej, rozpoznawalnej osoby |
| Nick główny | ⟨nick⟩ | ten sam na GitHub, Keybase i w Telegramie |
| E-mail | ⟨adres@…⟩ | podpięty do Gravatara |
| Telefon | ⟨+48 …⟩ | numer zespołu albo z puli testowej; publikowany na stronie WWW |
| Konto GitHub | `https://github.com/⟨nick⟩` | bio + profilowe README (repozytorium `⟨nick⟩/⟨nick⟩`) |
| Konto Keybase | `https://keybase.io/⟨nick⟩` | z dowodem konta GitHub (proof) |
| Kanał Telegram (publiczny) | `https://t.me/⟨kanał⟩` | z włączonym podglądem `t.me/s/⟨kanał⟩` |
| Strona WWW | `⟨https://…⟩` | np. GitHub Pages; link w polu „Website” na GitHubie |
| Gravatar | profil dla ⟨e-mail⟩ | zweryfikowane konto GitHub |
| Portfel ETH (główny) | `⟨0x…⟩` | prawdziwy portfel testowy z historią w sieci głównej |
| Portfel ETH (drugi, do podmiany) | `⟨0x…⟩` | do scenariusza S7 |
| Portfel BTC | `⟨bc1…⟩` | opcjonalnie |
| Portfel TRON (USDT) | `⟨T…⟩` | do wzorca P2P / wypłaty |

---

## Podsumowanie scenariuszy

| # | Scenariusz | Etap obowiązkowego przebiegu | Oczekiwany wynik | Status |
|---|---|---|---|---|
| S1 | Adres na profilu autorskim + synergia źródeł | wykrycie adresu, Wskaźnik Pewności | ≥ 80%, reguła `SYNERGY` | ⟨⟩ |
| S2 | Pivot: GitHub → WWW → Telegram | ślady OSINT, łączenie źródeł | nowe identyfikatory `PIVOT`, adres z kanału 60–79% | ⟨⟩ |
| S3 | E-mail → Gravatar → GitHub | wejście danych, ślady OSINT | analiza z samego e-maila dociera do adresu z GitHuba | ⟨⟩ |
| S4 | Odrzucanie fałszywych trafień | odrzucenie błędnych przypisań | giełda, kontrakt, zbiórka = 0% | ⟨⟩ |
| S5 | Wzajemne potwierdzenie (Keybase) | Wskaźnik Pewności, odrzucenie | z dowodem: siła pełna; bez dowodu: `IDENTITY_WEAK` | ⟨⟩ |
| S6 | Masowy komentarz / giveaway | Wskaźnik Pewności | 10–39% | ⟨⟩ |
| S7 | Podmiana adresu w czasie | analizy cykliczne, porównanie | karta zmian: nowy adres | ⟨⟩ |
| S8 | Aktywność w blockchainie | analiza wskaźników aktywności | wskaźniki `CEX_*` / `STABLECOIN_SWAP` / `P2P_PATTERN` | ⟨⟩ |
| S9 | Źródła, raport i odtwarzalność | przedstawienie źródeł i wyniku | URL, czas, SHA-256 każdego dowodu; fakty / obliczenia / wnioski | ⟨⟩ |
| S10 | Bezpieczeństwo ruchu wychodzącego | zgodność z wymaganiami | link do adresu wewnętrznego zablokowany | ⟨⟩ |

---

## S1 – Adres na profilu autorskim + synergia źródeł

**Cel:** adres opublikowany przez podmiot w dwóch niezależnych serwisach dostaje bardzo wysoką pewność.

**Przygotowanie:**
- GitHub, bio: `Wesprzyj moje projekty: ETH ⟨0x… główny⟩`
- Strona WWW: `Mój portfel ETH: ⟨0x… główny⟩`, link do strony w polu „Website” na GitHubie.
- Opcjonalnie: na stronie zapisz adres ze spacjami (`0x1a04d94f 740Ec502 …`), żeby pokazać odtwarzanie zapisów zaciemnionych.

**Wejście:** `nick = ⟨nick⟩`

**Oczekiwany wynik:**
- adres `⟨0x… główny⟩` – kategoria *Portfel prywatny (kandydat)*, **≥ 80%**
- reguły: `BASE_OFFICIAL_PROFILE (+85)`, `OWNERSHIP_CLAIM (+5)`, `SYNERGY (+15)` (źródła: `github.com`, `⟨domena strony⟩`)
- przy zapisie zaciemnionym: znacznik „zapis zaciemniony” przy wystąpieniu

**Kryterium zaliczenia:** wynik ≥ 80% i reguła `SYNERGY` z dwiema różnymi domenami.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨run_…⟩ | ⟨%⟩ | ⟨⟩ |

---

## S2 – Pivot: GitHub → strona WWW → Telegram

**Cel:** narzędzie samo odkrywa kolejne identyfikatory na profilach podmiotu i przeszukuje kolejne źródła.

**Przygotowanie:**
- Strona WWW: `Kontakt: Telegram @⟨kanał⟩, tel. ⟨numer⟩`
- Kanał Telegram, wpis: `Rozliczenie za dzisiejsze transakcje – przelej na ⟨0x… lub T…⟩`

**Wejście:** `nick = ⟨nick⟩` (głębokość pivotowania 3)

**Oczekiwany wynik:**
- w „Przebieg i parametry” → Tożsamości: `url` strony, `telegram=⟨kanał⟩` i `phone=+48…` ze statusem **PIVOT** oraz źródłem odkrycia
- adres z kanału: kontekst *rozliczenie*, **60–79%** (`BASE_SALE_OR_SETTLEMENT (+70)`, `IDENTITY_PIVOT (−5)`)
- graf powiązań: podmiot → nick → url → telegram → adres

**Kryterium zaliczenia:** adres z Telegrama znaleziony bez podawania kanału na wejściu.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S3 – E-mail → Gravatar → GitHub

**Cel:** analiza startująca od samego adresu e-mail.

**Przygotowanie:** profil Gravatar dla ⟨e-mail⟩ ze zweryfikowanym kontem GitHub `⟨nick⟩`.

**Wejście:** `email = ⟨adres@…⟩`

**Oczekiwany wynik:**
- dowód z Gravatara (e-mail wysłany do API tylko jako hash SHA-256)
- pivot do `nick=⟨nick⟩`, a dalej jak w S1
- adres główny ≥ 60% (powiązanie przez pivot)

**Kryterium zaliczenia:** z samego e-maila narzędzie dociera do adresu opublikowanego na GitHubie.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S4 – Odrzucanie fałszywych trafień

**Cel:** adresy, których nie wolno przypisać osobie, dostają 0%, a interakcja jest tylko odnotowana.

**Przygotowanie (profilowe README na GitHubie):**
```
Wpłaciłem na Binance: 0x28C6c06298d514Db089934071355E5743bf21d60
Moje boty używają routera Uniswap: 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
Wspieram zbiórkę: 0x165CD37b4C644C2921454429E7F9358d18A45e14
Mój portfel: ⟨0x… główny⟩
```

**Wejście:** `nick = ⟨nick⟩`

**Oczekiwany wynik:**

| Adres | Oczekiwana kategoria | Wynik | Reguła |
|---|---|---|---|
| `0x28C6…1d60` | CEX (Binance) | 0% | `GATE_CEX` |
| `0x7a25…488D` | DEX / kontrakt | 0% | `GATE_DEX` lub `GATE_SMART_CONTRACT` (etykieta lub bytecode ≠ 0x) |
| `0x165C…5e14` | Zbiórka | 0% | `GATE_CHARITY` |
| `⟨0x… główny⟩` | Portfel prywatny | ≥ 80% | – |

**Kryterium zaliczenia:** wszystkie trzy adresy instytucjonalne mają 0%, a adres główny nie jest obniżony przez sąsiedztwo.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S5 – Wzajemne potwierdzenie (Keybase)

**Cel:** konto o tej samej nazwie w otwartej przestrzeni nazw nie wystarcza do przypisania; potrzebny jest dowód.

**Przygotowanie – wariant A (z dowodem):** konto Keybase `⟨nick⟩` z dowodem konta GitHub `⟨nick⟩` oraz adresem BTC dodanym w Keybase (adres podpisany; narzędzie rozpoznaje BTC, ETH, TRON, LTC, SOL).
**Przygotowanie – wariant B (bez dowodu):** drugie konto Keybase `⟨nick2⟩` z adresem, ale **bez** dowodu GitHub; na wejściu podaj `nick=⟨nick2⟩`.

**Oczekiwany wynik:**
- A: adres z Keybase z siłą powiązania DIRECT, ≥ 80%
- B: ten sam typ dowodu, ale reguła `IDENTITY_WEAK (−35)`, wynik 40–59%; w przebiegu wpis „brak wzajemnego potwierdzenia”

**Kryterium zaliczenia:** różnica wyniku A i B wynika wyłącznie z reguły `IDENTITY_WEAK`.

| Wariant | Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|---|
| A | ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |
| B | ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S6 – Masowy komentarz / giveaway

**Cel:** adres rzucony w kontekście konkursu lub giveaway traktujemy jako szum.

**Przygotowanie:** wpis na kanale Telegram: `🎁 GIVEAWAY – zostaw adres w komentarzu! Mój adres do udziału: ⟨0x… inny⟩`

**Wejście:** `telegram = ⟨kanał⟩`

**Oczekiwany wynik:** adres `⟨0x… inny⟩` – `BASE_MASS_COMMENT (+20)`, wynik **10–39%**.

**Kryterium zaliczenia:** wynik w przedziale niskim mimo autorstwa podmiotu.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S7 – Podmiana adresu w czasie (analiza cykliczna)

**Cel:** wykrycie zmiany adresu publikowanego na tym samym profilu między przebiegami.

**Kroki:**
1. Utwórz analizę `nick=⟨nick⟩` z harmonogramem **co 5 min**.
2. Po pierwszym przebiegu zmień bio GitHub: `⟨0x… główny⟩` → `⟨0x… drugi⟩`.
3. Poczekaj na kolejny przebieg (albo kliknij „Uruchom ponownie”).

**Oczekiwany wynik:** karta **„Zmiany względem poprzedniego przebiegu”** z nowym adresem `⟨0x… drugi⟩` (i ewentualnie zmianą wyniku adresu głównego), oznaczenie przebiegu ⟳.

**Kryterium zaliczenia:** zmiana widoczna w porównaniu przebiegów bez ręcznego zestawiania wyników.

| Data | ID przebiegu 1 | ID przebiegu 2 | Wykryta zmiana | Uwagi |
|---|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S8 – Aktywność w blockchainie (wyjście do fiat)

**Cel:** analiza historii przypisanego adresu i wskazanie potencjalnego wyjścia do walut tradycyjnych.

**Przygotowanie (sieć główna, drobne kwoty):** wykonaj z portfela testowego co najmniej jedno z poniższych:
- wysyłka na adres depozytowy giełdy → `CEX_DEPOSIT_INFERRED` (giełda przekazuje środki dalej do hot walleta) lub `CEX_DIRECT`;
- zamiana ETH → USDT/USDC przez Uniswap → `STABLECOIN_SWAP` (próg 1000 USD – przy mniejszych kwotach wskaźnik się nie pojawi; obniż próg w konfiguracji na czas demo lub pomiń);
- ≥ 4 wpłaty USDT w okrągłych kwotach z różnych adresów w sieci TRON → `P2P_PATTERN`.

**Wejście:** jak w S1 (adres przypisany ≥ 60%).

**Oczekiwany wynik:** w szczegółach adresu: liczba transakcji, wpływy i wypływy w PLN (kurs NBP), wskaźniki z rozróżnieniem *obliczenie* / *wniosek do weryfikacji*, chronologia przepływu środków.

**Kryterium zaliczenia:** co najmniej jeden wskaźnik wyjścia do fiat z hashami transakcji.

| Data | ID przebiegu | Wskaźniki | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S9 – Źródła, raport i odtwarzalność

**Cel:** każdy wynik da się prześledzić do źródła i odtworzyć.

**Kroki:** dla dowolnego przebiegu z S1–S8:
1. Zakładka **Źródła** – każdy dowód ma URL, datę i czas pobrania (UTC), SHA-256, konektor.
2. Link **kopia** – surowa treść zapisana w chwili pobrania.
3. **Raport (druk / PDF)** – sekcje: podsumowanie, parametry wyszukiwania, tożsamości, uzasadnienie wyniku regułami, chronologia, fakty / obliczenia / wnioski, łańcuch dowodowy, metodyka.
4. **Pakiet dowodowy JSON** – wynik + surowe dowody + parametry.

**Kryterium zaliczenia:** w raporcie są wyraźnie oddzielone *fakty źródłowe*, *wyniki obliczeń* i *wnioski do weryfikacji*; suma SHA-256 kopii zgadza się z wartością w tabeli źródeł.

| Data | ID przebiegu | Sprawdził | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## S10 – Bezpieczeństwo ruchu wychodzącego

**Cel:** narzędzie nie odwołuje się do zasobów wewnętrznych ani niezatwierdzonych usług.

**Przygotowanie:** na stronie WWW dodaj link: `http://169.254.169.254/latest/meta-data` (adres wewnętrzny chmury) albo `http://localhost:5432`.

**Wejście:** `nick = ⟨nick⟩`

**Oczekiwany wynik:** w „Przebieg i parametry” → Ruch wychodzący: wpis **⛔ ZABLOKOWANO** z powodem „ochrona SSRF”; analiza kończy się poprawnie.

**Kryterium zaliczenia:** żadne żądanie nie trafiło pod adres wewnętrzny.

| Data | ID przebiegu | Wynik | Uwagi |
|---|---|---|---|
| ⟨⟩ | ⟨⟩ | ⟨⟩ | ⟨⟩ |

---

## Testy automatyczne (offline)

Uzupełniają scenariusze powyżej i nie wymagają sieci:

```sh
npm test
```

Obejmują walidację i ekstrakcję adresów, reguły Wskaźnika Pewności, wskaźniki cash-out, numer telefonu oraz zabezpieczenia (SSRF, allowlista, wzajemne potwierdzenie, filtr eksploratorów).
