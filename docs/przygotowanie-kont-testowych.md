# Konta testowe – notatki zespołu

Wewnętrzna lista dla zespołu: co jest opublikowane na kontach person i co zrobić przed oddaniem projektu. Przewodnik dla jury: [`scenariusze-testowe.md`](scenariusze-testowe.md).

## Persona 1 – Błażej Rzepecki

| Element | Wartość |
|---|---|
| Nick | `blazejrzepdev` (GitHub, Telegram, dev.to) |
| E-mail | `blazej.rzepecki.dev99@proton.me` |
| GitHub bio | `Błażej Rzepecki \| Dev \| TG: @blazejrzepdev \| Konto testowe HackNation 2026` |
| GitHub README | `Wesprzyj moje projekty (ETH/ERC-20): 0x396343362be2A4dA1cE0C1C210945346fb82Aa49`, e-mail kontaktowy |
| Telegram `t.me/blazejrzepdev` | rozliczenie z portfelem głównym, pytanie o kontrakt USDT `0xdAC1…1ec7`, wypłata z Binance `0x28C6…1d60`, giveaway i airdrop z adresem szumu |
| Portfel główny (prawdziwy) | `0x396343362be2A4dA1cE0C1C210945346fb82Aa49` |
| Adres szumu (syntetyczny) | `0xD37d9ce749ffD5E9E52b03928815170E501eeBeF` |
| dev.to | nie założone (opcjonalne; konektor gotowy) |
| Reddit | odpuszczony: API wymaga zatwierdzonej aplikacji; konektor gotowy (`REDDIT_CLIENT_ID/SECRET`) |

## Persona 2 – Ksawery Kordas

| Element | Wartość |
|---|---|
| E-mail (wejście) | `ksawery.kordas.dev@proton.me` |
| Gravatar | „Ksawery Kordas”, zweryfikowane konto GitHub `kordas-dev` |
| GitHub `kordas-dev` | bio, Website `https://kordas-dev.github.io`, README z ETH `0xd3e785eFf14Af8454Af1DCe3bA63321123bCE61C` |
| Strona `kordas-dev.github.io` | BTC `bc1qj2xp3cuqeuldce3h36q3d2q7d5jrt474q8mtqz`, zbiórka `0x165C…5e14`, link do Telegrama |
| Telegram `t.me/kordas_sprzedaz` | ogłoszenie z TRON `TPL5VC5b8Nt7Kvhq2VvvJq5nTp6y9zbZoc`, rozliczenie ETH, ostrzeżenie „scam” `0x5b2095eC0EA6484C2BF656d861E163971e240435` |

## Wyniki na żywo (21.11.2026, silnik po commicie 152f236)

| Wejście | Wynik | Czas |
|---|---|---|
| `email=ksawery.kordas.dev@proton.me` | ETH 100, BTC 75 (Blockstream 429 → −10), TRON 70, scam 10, zbiórka 0 | 10 s |
| `nick=blazejrzepdev` | portfel główny 100, szum 25, USDT 0, Binance 0 | 58 s |
| `nick=torproject` | `torproject.eth` 55 (`IDENTITY_WEAK`) | 31 s |

## Do zrobienia przed oddaniem

1. **Transakcje na portfelu głównym** `0x3963…Aa49` (sieć główna Ethereum). Bez nich sekcja „Aktywność w blockchainie”, opisana w przewodniku dla jury, jest pusta, a to obowiązkowy etap scenariusza. Najprościej: wypłata drobnej kwoty z giełdy na portfel i odesłanie części na własny adres depozytowy tej giełdy.
2. **Nagranie offline**, na które powołuje się przewodnik: w `.env` ustaw `OLCYS_RECORD_DIR=data/recordings/demo`, wykonaj trzy analizy z przewodnika (oraz wejście `address=0x3963…`), potem zacommituj katalog `data/recordings/demo`.
3. **Sprawdź szukanie po adresie** (`address=0x3963…Aa49`), gdy GitHub zaindeksuje README.
4. **Test zmiany w czasie** do filmu: harmonogram co 5 minut, zmiana portfela w README Błażeja, karta „Zmiany względem poprzedniego przebiegu”; potem przywróć README.
5. Opcjonalnie: link `http://169.254.169.254/latest/meta-data` na stronie Kordasa, żeby pokazać blokadę SSRF na żywo (wpis „ZABLOKOWANO” w ruchu wychodzącym).
6. Przed filmem: powtórz trzy analizy z przewodnika i porównaj z tabelą wyników powyżej.
