# OŁCyŚ – sprawdzenie w 2 minuty

Przygotowaliśmy dwie **fikcyjne osoby** z prawdziwymi, publicznymi kontami w Internecie (GitHub, Gravatar, strona WWW, Telegram). Opublikowały one adresy portfeli w różnych kontekstach: na własnym profilu, w ogłoszeniu, w giveawayu, jako adres giełdy albo ostrzeżenie przed oszustem. Wystarczy wpisać jeden identyfikator, a OŁCyŚ sam przejdzie po śladach i oceni każdy adres.

Żadne dane nie dotyczą prawdziwych osób. Adresy portfeli person są syntetyczne, z wyjątkiem portfela głównego Błażeja, który pokazuje aktywność w blockchainie.

---

## Uruchomienie (jednorazowo, ok. 3 min)

Wymagany Node.js 20+.

```sh
npm install
cp .env.example .env
npm run dev
```

Otwórzcie **http://localhost:5173**.

Zalecane: wpiszcie w `.env` dowolny token GitHub bez uprawnień (`GITHUB_TOKEN=…`). Bez niego GitHub pozwala na 60 zapytań na godzinę z jednego adresu IP, a w sieci hackathonu ten limit bywa już wyczerpany.

---

## Ścieżka na 2 minuty

**Najpierw uruchomcie trzy analizy jedną po drugiej** (Analizy → Nowa analiza → wpisz → **Uruchom analizę**). Ustawienia zostawcie domyślne. Każda analiza trwa 10–60 s, więc zanim otworzycie pierwszą, pozostałe zdążą się policzyć.

| # | Wpisz | Kto to |
|---|---|---|
| 1 | E-mail: `ksawery.kordas.dev@proton.me` | Ksawery Kordas, sprzedawca sprzętu IT |
| 2 | Nick: `blazejrzepdev` | Błażej Rzepecki, programista |
| 3 | Nick: `torproject` | prawdziwa, publiczna organizacja (Tor Project) |

### 1. Kordas – z jednego e-maila do komunikatora (ok. 45 s)

Otwórzcie analizę Kordasa. Zakładka **Graf powiązań** pokazuje drogę, którą narzędzie przeszło samo:

**e-mail** → Gravatar → konto GitHub `kordas-dev` → strona `kordas-dev.github.io` → kanał Telegram `kordas_sprzedaz`

Nazwa kanału nie pojawiła się ani na wejściu, ani na GitHubie. Narzędzie znalazło ją na stronie WWW. Kliknijcie romby w grafie, a obok pojawi się wynik i jego uzasadnienie.

| Adres | Gdzie | Wynik | Dlaczego |
|---|---|---|---|
| ETH `0xd3e7…E61C` | GitHub i Telegram | **100%** | profil autorski i drugie, niezależne źródło (premia za synergię) |
| BTC `bc1qj2…mtqz` | strona WWW | **85%** | własna strona osoby |
| TRON `TPL5…bZoc` | Telegram | **70%** | ogłoszenie sprzedaży z prośbą o płatność |
| ETH `0x5b20…0435` | Telegram | **10%** | „Uważajcie, to scam” – adres cudzy |
| ETH `0x165C…5e14` | strona WWW | **0%** | znana zbiórka – nie jest portfelem osoby |

Jeśli publiczne API Bitcoina (Blockstream) ogranicza zapytania z Waszej sieci, BTC dostanie 75% z regułą „Brak weryfikacji adresu w blockchainie”. Narzędzie nie przemilcza braku danych, tylko obniża za to pewność.

### 2. Błażej – pełny przebieg i odrzucanie pułapek (ok. 45 s)

Otwórzcie analizę Błażeja i zakładkę **Adresy**. Przy każdym adresie jest tabela „Jak powstał wynik” z regułami, które sumują się do wyniku.

| Adres | Wynik | Dlaczego |
|---|---|---|
| ETH `0x3963…Aa49` | **100%** | profil GitHub („Wesprzyj moje projekty”) i rozliczenie na Telegramie |
| ETH `0xD37d…eBeF` | **25%** | dwa wpisy typu giveaway / airdrop w jednym serwisie: szum, bez premii za synergię |
| `0xdAC1…1ec7` | **0%** | kontrakt tokena USDT, a nie portfel osoby |
| `0x28C6…1d60` | **0%** | portfel giełdy Binance |

Pułapki są opublikowane przez tę samą osobę, obok jej prawdziwego portfela, a mimo to nie obniżają jego wyniku.

Kliknijcie portfel `0x3963…Aa49`. Sekcja **Aktywność w blockchainie** pokazuje transakcje, wpływy i wypływy w PLN oraz wskaźniki wyjścia do walut tradycyjnych, każdy oznaczony jako *obliczenie* albo *wniosek do weryfikacji*.

### 3. Tor Project – ta sama nazwa to jeszcze nie ta sama osoba (ok. 15 s)

Nazwa `torproject.eth` w systemie ENS pasuje do nicku, ale taką nazwę może zarejestrować każdy. Adres z ENS dostaje **55%** z regułą „Powiązanie słabe”, a w zakładce **Przebieg i parametry** widać wpis „brak wzajemnego potwierdzenia”.

### 4. Dowody i raport (ok. 15 s)

W dowolnej analizie:

- **Źródła** – każdy pobrany zasób z adresem URL, czasem pobrania i sumą SHA-256. Link **Kopia** pokazuje dokładnie tę treść, którą narzędzie wtedy pobrało.
- **Fakty, obliczenia, wnioski** – ustalenia rozdzielone na fakty ze źródeł, wyniki obliczeń i wnioski wymagające weryfikacji.
- **Raport PDF** – gotowy raport do akt, czytelny także bez wiedzy technicznej.
- **Pakiet dowodowy** – wynik, surowe dowody i parametry w jednym pliku JSON, do odtworzenia analizy.

---

## Sprawdźcie źródła sami

Wszystko, z czego korzysta narzędzie, jest publiczne:

| Persona | Źródło | Adres |
|---|---|---|
| Kordas | profil GitHub | https://github.com/kordas-dev |
| Kordas | strona WWW | https://kordas-dev.github.io |
| Kordas | kanał Telegram | https://t.me/s/kordas_sprzedaz |
| Błażej | profil GitHub | https://github.com/blazejrzepdev |
| Błażej | kanał Telegram | https://t.me/s/blazejrzepdev |

---

## Jeśli macie więcej czasu

- **Szukanie po samym adresie.** Wpiszcie adres krypto `0x396343362be2A4dA1cE0C1C210945346fb82Aa49` (wymaga `GITHUB_TOKEN`). Narzędzie znajdzie plik na GitHubie, w którym go opublikowano, i dojdzie do konta `blazejrzepdev`.
- **Zmiana w czasie.** Przy analizie ustawcie harmonogram „Co 5 minut”. Gdy na profilu zmieni się portfel, kolejny przebieg pokaże kartę **„Zmiany względem poprzedniego przebiegu”**. Najłatwiej sprawdzić to na własnym koncie GitHub: wpiszcie swój nick, a potem dopiszcie adres w bio.
- **Bez Internetu.** Ustawcie w `.env` `OLCYS_REPLAY_DIR=data/recordings/demo` i uruchomcie aplikację ponownie. Analizy z nagrania działają bez sieci, a przebieg jest oznaczony jako tryb offline.
- **Źródła i zgodność** (menu po lewej). Lista źródeł, podstawa korzystania z każdego z nich i lista zatwierdzonych hostów. Zapytania do innych usług są blokowane i logowane.
- **Metodyka** (link przy wyniku adresu). Wszystkie reguły Wskaźnika Pewności i progi wskaźników wyjścia do fiat.
- **Testy automatyczne:** `npm test`. 56 testów bez dostępu do sieci, w tym cały plan kont testowych odtworzony z nagrań, ochrona przed żądaniami do sieci wewnętrznej (SSRF) i reguły punktacji.
