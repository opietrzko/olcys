# KryptoTrop – instrukcja testowania dla jury

Ta instrukcja prowadzi przez pełny scenariusz z treści zadania: od wpisania identyfikatora, przez ślady OSINT i Wskaźnik Pewności, po aktywność w blockchainie i raport. Każdy krok podaje, co wpisać i jaki wynik powinien się pojawić.

## Dane testowe

Przygotowaliśmy dwie **fikcyjne osoby** z prawdziwymi, publicznymi kontami w Internecie (GitHub, Gravatar, strona WWW, Telegram). Na tych kontach opublikowały adresy portfeli w różnych kontekstach: na własnym profilu, w ogłoszeniu sprzedaży, w giveawayu, jako adres giełdy, kontrakt tokena albo ostrzeżenie przed oszustem.

- Osoby i ich konta są fikcyjne.
- Adresy portfeli Kordasa i adres z giveawayu Błażeja są syntetyczne i nie mają historii.
- Portfel „główny” Błażeja (`0x3963…Aa49`) to prawdziwy, publiczny adres Ethereum bez etykiety. Dzięki niemu widać analizę aktywności w blockchainie. Użyliśmy go po uzgodnieniu z mentorem MF.
- Adresy Binance, kontraktu USDT i zbiórki to znane, publiczne adresy instytucji. Służą jako pułapki.
- Scenariusz C używa publicznej organizacji (Tor Project), żeby pokazać przypadek z prawdziwego Internetu.

## Co sprawdzicie i gdzie

| Etap scenariusza z treści zadania | Gdzie to widać |
|---|---|
| Wprowadzenie danych wejściowych | formularz **Nowa analiza** |
| Wyszukanie śladów OSINT | zakładka **Graf powiązań** (scenariusz A) |
| Wykrycie i weryfikacja adresu | zakładka **Adresy**: sieć, walidacja, kod kontraktu, etykiety |
| Wyliczenie Wskaźnika Pewności | przy każdym adresie tabela **Jak powstał wynik** |
| Odrzucenie błędnych przypisań | giełda, kontrakt, zbiórka, adres cudzy (scenariusze A i B) |
| Analiza aktywności w blockchainie | sekcja **Aktywność w blockchainie** (scenariusz B) |
| Źródła i wynik końcowy | zakładki **Źródła** i **Fakty, obliczenia, wnioski**, **Raport PDF**, **Pakiet dowodowy** |

---

## Uruchomienie

Scenariusze można przejść na dwa sposoby:

- **Online, bez instalacji:** otwórzcie **[olcys.haloware.pl](https://olcys.haloware.pl)** i przejdźcie od razu do części [Jak uruchomić analizę](#jak-uruchomić-analizę).
- **Lokalnie:** zainstalujcie i uruchomcie projekt według [README, sekcja „Pierwsze kroki”](../README.md#pierwsze-kroki), a potem otwórzcie **http://localhost:5173**. Ustawcie w `.env` zalecane klucze `GITHUB_TOKEN` i `ETHERSCAN_API_KEY`: bez nich publiczne API szybko odrzucają zapytania (skutki opisuje część [Gdy wynik różni się od opisanego](#gdy-wynik-różni-się-od-opisanego)).

## Jak uruchomić analizę

1. Na stronie startowej kliknijcie **Rozpocznij analizę**. Otworzy się panel analiz (później wrócicie do niego przez **Analizy** w menu po lewej).
2. W formularzu **Nowa analiza** wybierzcie z listy rodzaj identyfikatora (np. *E-mail*, *Nick / login*) i wpiszcie wartość.
3. Pozostałe ustawienia zostawcie domyślne.
4. Kliknijcie **Uruchom analizę**.

Aplikacja przejdzie do widoku sprawy. Wynik pojawi się sam, gdy przebieg dostanie status *Zakończony*. Scenariusze uruchamiajcie po kolei, jeden po drugim.

---

## Scenariusz A – Kordas: z jednego e-maila do komunikatora

**Wpiszcie:** rodzaj *E-mail*, wartość `ksawery.kordas.dev@proton.me`

**Sprawdźcie w zakładce Graf powiązań:** narzędzie samo przeszło drogę

**e-mail** → Gravatar → konto GitHub `kordas-dev` → strona `kordas-dev.github.io` → kanał Telegram `kordas_sprzedaz`

Nazwy kanału Telegram nie było ani na wejściu, ani na GitHubie. Narzędzie znalazło ją na stronie WWW. Wybierzcie węzeł *Telegram* (kliknięciem w grafie albo z listy nad grafem): panel obok pokaże **Skąd pochodzi** (`kordas-dev.github.io`) i adresy znalezione w tej gałęzi.

**Sprawdźcie w zakładce Adresy:**

| Adres | Gdzie opublikowany | Oczekiwany wynik | Dlaczego |
|---|---|---|---|
| ETH `0xd3e785eFf14Af8454Af1DCe3bA63321123bCE61C` | GitHub i Telegram | **100%** | profil autorski i drugie, niezależne źródło (premia za synergię) |
| BTC `bc1qj2xp3cuqeuldce3h36q3d2q7d5jrt474q8mtqz` | strona WWW | **85%** | własna strona osoby |
| TRON `TPL5VC5b8Nt7Kvhq2VvvJq5nTp6y9zbZoc` | Telegram | **70%** | ogłoszenie sprzedaży z prośbą o płatność |
| ETH `0x5b2095eC0EA6484C2BF656d861E163971e240435` | Telegram | **10%** | „Uważajcie, to scam”: adres cudzy |
| ETH `0x165CD37b4C644C2921454429E7F9358d18A45e14` | strona WWW | **0%** | znana zbiórka, nie portfel osoby |

Adresy Kordasa są syntetyczne i nie mają transakcji, więc etap *Blockchain* pokazuje „nie sprawdzano”. Aktywność w blockchainie pokazuje scenariusz B.

## Scenariusz B – Błażej: pułapki, adres instytucjonalny i aktywność w blockchainie

**Wpiszcie:** rodzaj *Nick / login*, wartość `blazejrzepdev`

**Sprawdźcie w zakładce Adresy:**

| Adres | Oczekiwany wynik | Dlaczego |
|---|---|---|
| ETH `0x396343362be2A4dA1cE0C1C210945346fb82Aa49` | **65%** | profil GitHub („Wesprzyj moje projekty”) i rozliczenie na Telegramie: 85 + 5 + 15. Adres ma jednak ponad milion transakcji: kara −40 „Adres wnioskowany jako instytucjonalny” |
| ETH `0xD37d9ce749ffD5E9E52b03928815170E501eeBeF` | **25%** | dwa wpisy typu giveaway / airdrop w jednym serwisie: szum, bez premii za synergię |
| `0xdAC17F958D2ee523a2206206994597C13D831ec7` | **0%** | kontrakt tokena USDT, a nie portfel osoby |
| `0x28C6c06298d514Db089934071355E5743bf21d60` | **0%** | portfel giełdy Binance |

Na co zwrócić uwagę:

- **Pułapki nie psują wyniku.** USDT i Binance opublikowała ta sama osoba, obok swojego portfela. Narzędzie je odrzuca i nie obniża przez nie wyniku portfela.
- **Silne ślady Web2 to jeszcze nie portfel osoby.** Adres `0x3963…Aa49` nie ma etykiety giełdy, ale ponad milion transakcji to profil buildera bloków albo usługi, a nie prywatnej osoby. Narzędzie nie zeruje go jak giełdy z rejestru, tylko obniża pewność do 65% i opisuje to jako *wniosek do weryfikacji*.
- **Jak powstał wynik.** Kliknijcie adres: tabela pokazuje każdą regułę z przesłanką i źródłem, a reguły sumują się do wyniku. Link **Jak liczony jest wynik?** prowadzi do pełnej metodyki.
- **Aktywność w blockchainie.** W szczegółach portfela `0x3963…Aa49` sekcja **Aktywność w blockchainie** pokazuje transakcje, wpływy i wypływy w PLN (kurs NBP) oraz wskaźniki wyjścia do walut tradycyjnych, np. „Znaczny łączny wolumen”. Każdy wskaźnik jest oznaczony jako *obliczenie* albo *wniosek do weryfikacji*.

## Scenariusz C – Tor Project: ta sama nazwa to jeszcze nie ta sama osoba

**Wpiszcie:** rodzaj *Nick / login*, wartość `torproject`

**Oczekiwany wynik:** adres ETH `0x000f16ca1e73a0b6b10e1ed4cc5F8232336c1482` z nazwy ENS `torproject.eth` dostaje **55%** z regułą „Powiązanie słabe”.

Nazwa w ENS pasuje do nicku, ale taką nazwę może zarejestrować każdy. W zakładce **Przebieg i parametry** widać wpis „ENS torproject.eth: brak wzajemnego potwierdzenia – powiązanie słabe”.

## Scenariusz D – dowody i raport

W dowolnej z powyższych analiz:

- **Źródła:** każdy pobrany zasób z adresem URL, czasem pobrania i sumą SHA-256. Przycisk **Kopia** otwiera dokładnie tę treść, którą narzędzie wtedy pobrało.
- **Fakty, obliczenia, wnioski:** ustalenia rozdzielone na fakty źródłowe, wyniki obliczeń i wnioski wymagające weryfikacji.
- **Przebieg i parametry:** parametry wyszukiwania, lista zatwierdzonych hostów, każdy krok analizy i każde zapytanie wychodzące.
- **Raport PDF:** raport do akt, czytelny także bez wiedzy technicznej. Otwiera się w nowej karcie i można go wydrukować do PDF.
- **Pakiet dowodowy:** wynik, surowe dowody i parametry w jednym pliku JSON, potrzebnym do odtworzenia analizy.

---

## Gdy wynik różni się od opisanego

Publiczne API ograniczają liczbę zapytań. Narzędzie nie ukrywa braku danych, tylko pokazuje go w wyniku:

| Co widzicie | Przyczyna | Co zrobić |
|---|---|---|
| BTC Kordasa: **75%** z regułą „Brak weryfikacji adresu w blockchainie” | limit zapytań API Bitcoina (Blockstream) | nic, wynik jest poprawny dla braku danych |
| `0x3963…Aa49`: **95%** z regułą „Nie sprawdzono skali aktywności adresu” | limit Blockscout: nie pobrano liczby transakcji | ustawcie `ETHERSCAN_API_KEY` i kliknijcie **Uruchom ponownie** |
| Brak sekcji „Aktywność w blockchainie” przy `0x3963…Aa49` | limit Blockscout: nie pobrano historii transakcji | jak wyżej |
| Żółty komunikat „Nie znaleziono śladów, ale część źródeł nie odpowiedziała poprawnie” | błąd sieci albo limit GitHub | ustawcie `GITHUB_TOKEN` i kliknijcie **Uruchom ponownie** |

Szczegóły każdego zapytania i błędu są w zakładce **Przebieg i parametry**, w sekcji *Ruch wychodzący*.

## Sprawdźcie źródła sami

Wszystko, z czego korzysta narzędzie, jest publiczne:

| Osoba | Źródło | Adres |
|---|---|---|
| Kordas | profil GitHub | https://github.com/kordas-dev |
| Kordas | strona WWW | https://kordas-dev.github.io |
| Kordas | kanał Telegram | https://t.me/s/kordas_sprzedaz |
| Błażej | profil GitHub | https://github.com/blazejrzepdev |
| Błażej | kanał Telegram | https://t.me/s/blazejrzepdev |

## Dodatkowo

- **Szukanie po samym adresie** (wymaga `GITHUB_TOKEN`). Wpiszcie rodzaj *Adres krypto* i adres Kordasa `0xd3e785eFf14Af8454Af1DCe3bA63321123bCE61C`. Narzędzie wyszuka plik na GitHubie, w którym opublikowano adres, i dojdzie do konta `kordas-dev`. Działa to po zaindeksowaniu pliku przez wyszukiwarkę kodu GitHub; dopóki to nie nastąpi, w zakładce **Przebieg i parametry** widać zero trafień. Dla porównania wpiszcie adres Błażeja `0x396343362be2A4dA1cE0C1C210945346fb82Aa49`: występuje w ponad 1800 cudzych plikach, więc narzędzie traktuje go jako adres szeroko publikowany i nie przypisuje go autorom tych plików.
- **Zmiana w czasie.** W widoku sprawy ustawcie harmonogram *Co 5 minut*. Gdy na profilu zmieni się portfel, kolejny przebieg pokaże kartę **Zmiany względem poprzedniego przebiegu**. Najłatwiej sprawdzić to na własnym koncie GitHub: wpiszcie swój nick, a potem dopiszcie adres portfela w bio.
- **Źródła i zgodność** (menu po lewej): lista źródeł, podstawa korzystania z każdego z nich i lista zatwierdzonych hostów. Zapytania do innych usług są blokowane i logowane.
- **Audyt** (menu po lewej): kto, kiedy i co zrobił: utworzenie analizy, przebieg, podgląd, raport i eksport.
- **Testy automatyczne:** `npm test`. 61 testów bez dostępu do sieci, m.in. cały plan kont testowych odtworzony z nagrań, ochrona przed żądaniami do sieci wewnętrznej (SSRF), reguły punktacji i ponawianie zapytań po błędzie sieci.
