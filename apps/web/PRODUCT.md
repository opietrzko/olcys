# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Analitycy Krajowej Administracji Skarbowej (KAS):** docelowi użytkownicy. Przy biurku, w długich sesjach, przygotowują materiał do czynności sprawdzających: wpisują identyfikatory podatnika, oceniają, które adresy krypto są z nim powiązane, i sprawdzają, czy środki wychodzą do walut tradycyjnych.
- **Jury HackNation 2026 (zadanie Ministerstwa Finansów „OŁCyŚ”):** odbiorcy na teraz. Oglądają pokaz na ekranie lub projektorze i oceniają narzędzie na podstawie jednego przejścia scenariusza.

## Product Purpose

KryptoTrop na podstawie co najmniej jednego identyfikatora (nick, e-mail, telefon, Telegram, imię i nazwisko, URL, adres krypto) przeszukuje publiczne źródła, wyodrębnia adresy kryptowalutowe, liczy Wskaźnik Pewności powiązania adresu z osobą, odrzuca fałszywe trafienia (giełdy, kontrakty, miksery, zbiórki) i analizuje aktywność adresów pod kątem wyjścia do fiat (cash-out). Sukces: analityk szybko widzi, które adresy należą do podmiotu i czy jest cash-out, i może ten wynik obronić dowodami.

## Positioning

Wynik i cash-out są na pierwszym planie, a uzasadnienie zawsze o jedno kliknięcie dalej. Wskaźnik Pewności liczą jawne, wersjonowane, deterministyczne reguły (nie „czarna skrzynka”), a każdy wynik ma pełny łańcuch dowodowy: URL, czas pobrania, SHA-256 i kopię zasobu. AI pełni tylko rolę pomocniczą.

## Operating Context

- Przebieg analizy: identyfikatory → konektory Web2 → dowody → pivot → ekstrakcja adresów → klasyfikacja i bramka 0% → Wskaźnik Pewności → aktywność blockchain → raport (fakty / obliczenia / wnioski do weryfikacji).
- Analizy jednorazowe i cykliczne (5 min, godzina, dzień, tydzień) z porównaniem przebiegów.
- Raport HTML do druku / PDF trafia do akt sprawy; pakiet dowodowy eksportowany jako JSON.
- Dziennik audytu (kto, kiedy, co); nagłówek `x-olcys-user` jako miejsce na SSO/RBAC KAS.

## Capabilities and Constraints

- Ekrany: lista analiz i formularz nowej analizy, widok analizy z przebiegami (adresy, graf powiązań, fakty/obliczenia/wnioski, źródła, przebieg i parametry), Metodyka, Źródła i zgodność, Audyt.
- Stos: React 18 + Vite, Cytoscape.js do grafu, API Fastify (`/api/*`), routing po hashu.
- **On-prem, bez zewnętrznych CDN:** fonty, ikony i inne zasoby muszą być w paczce aplikacji; żadnych Google Fonts ani usług zewnętrznych w przeglądarce.
- **Druk / PDF:** raport musi poprawnie wyglądać wydrukowany i jako PDF.
- **Motyw jasny i ciemny:** oba wymagane.
- Język interfejsu: polski. Terminologia: Wskaźnik Pewności, przedziały (bardzo wysokie / prawdopodobne / średnie / niskie / wykluczone), powiązanie DIRECT / PIVOT / MENTION / WEAK, bramka 0%, cash-out, fakt / obliczenie / wniosek do weryfikacji.

## Brand Commitments

- Nazwa „KryptoTrop” (trop prowadzący od śladów w sieci do portfeli krypto). Odpowiedź na zadanie Ministerstwa Finansów „OŁCyŚ”.
- Narzędzie dla administracji publicznej (KAS / Ministerstwo Finansów); stały komunikat: wyłącznie źródła publiczne, Wskaźnik Pewności nie przesądza o własności adresu i wymaga weryfikacji analityka.
- Wybór świadomy (2026-11-21): standard kategorii, czyli jasny dashboard analityczny wykonany bez ironii i bez przemycanych ozdobników. Poprzeczka jakości: Vercel (Geist) oraz Chainalysis Reactor. Unikać estetyki „hakerskiej” (neon, terminal, cyber) i nadmiaru kolorów: kolor niesie wyłącznie znaczenie.

## Evidence on Hand

- Scenariusze testowe na fikcyjnych kontach zespołu; opis w `docs/scenariusze-testowe.md` jeszcze nie istnieje.
- Treść zadania i regulamin: `docs/zadanie/*.pdf`.
- Brak prawdziwych danych osób, opinii użytkowników ani wyników wdrożeń; nie wolno ich zmyślać.

## Product Principles

1. Wynik najpierw, uzasadnienie o jedno kliknięcie: każda liczba prowadzi do reguł i dowodów, które ją dały.
2. Rozróżniaj fakt, obliczenie i wniosek: interfejs nigdy nie przedstawia wniosku jako faktu.
3. Odrzucenie to też wynik: fałszywe trafienia są widoczne i wyjaśnione, nie ukryte.
4. Odtwarzalność: wersje reguł, parametry i dowody są zawsze dostępne do wglądu i eksportu.
5. Czytelne zarówno na projektorze dla jury, jak i w długiej pracy analityka.

## Accessibility & Inclusion

WCAG 2.1 AA (wymóg dostępności cyfrowej administracji publicznej): kontrast, pełna obsługa klawiaturą, czytniki ekranu; znaczenie nie może opierać się wyłącznie na kolorze (przedziały pewności, wskaźniki).
