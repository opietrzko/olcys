---
name: OŁCyŚ
description: Spokojny, jasny dashboard śledczy OSINT, w którym graf powiązań jest głównym narzędziem.
colors:
  accent: "#0062d1"
  accent-hover: "#0052b0"
  accent-text: "#ffffff"
  accent-soft: "#eaf2fd"
  accent-border: "#b9d3f6"
  confidence-4: "#0b4fa8"
  confidence-3: "#2f6fcf"
  confidence-2: "#a9c7f0"
  confidence-1: "#e1ebf9"
  confidence-0: "#efefef"
  confidence-0-border: "#bdbdbd"
  danger: "#c4291c"
  danger-soft: "#fdeceb"
  danger-border: "#f3c1bc"
  warn: "#9a4d00"
  warn-soft: "#fff4e2"
  warn-border: "#f2d29f"
  bg: "#fafafa"
  surface: "#ffffff"
  surface-2: "#f5f5f5"
  surface-3: "#ededed"
  border: "#e5e5e5"
  border-strong: "#d1d1d1"
  text: "#171717"
  text-2: "#4d4d4d"
  text-3: "#666666"
typography:
  display:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  metric:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  body:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Geist Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    fontFeature: "'zero' 1"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-default-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "34px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
  button-sm:
    height: "28px"
    padding: "0 9px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  tag:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  tag-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
  tag-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
  tag-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
  band-very-high:
    backgroundColor: "{colors.confidence-4}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "22px"
  band-likely:
    backgroundColor: "{colors.confidence-3}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "22px"
  band-medium:
    backgroundColor: "{colors.confidence-2}"
    textColor: "#0d2a52"
    rounded: "{rounded.pill}"
    height: "22px"
  band-low:
    backgroundColor: "{colors.confidence-1}"
    textColor: "#1f3a63"
    rounded: "{rounded.pill}"
    height: "22px"
  band-excluded:
    backgroundColor: "{colors.confidence-0}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    height: "22px"
  chain-badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    height: "20px"
  nav-item:
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
---

# Design System: OŁCyŚ

## Overview

**Creative North Star: "Stół analityka"**

Narzędzie śledcze w standardzie kategorii (poziom Vercel/Geist i Chainalysis Reactor): jasne, spokojne, gęste tam, gdzie analityk czyta liczby, i ciche wszędzie indziej. Powierzchnie to neutralna skala szarości oddzielona obramowaniami 1px; kolor pojawia się tylko wtedy, gdy coś znaczy. Jeden niebieski akcent prowadzi akcję, zaznaczenie i fokus, a ta sama rodzina niebieskiego, rozpisana na rampę, niesie Wskaźnik Pewności.

Graf powiązań jest narzędziem, nie ilustracją: deterministyczne kolumny (podmiot → identyfikatory według głębokości pivotu → adresy według pewności), panel inspektora po prawej, a wybór adresu podświetla ścieżkę dowodową akcentem i przygasza resztę. Wszystkie barwy grafu są czytane z tych samych zmiennych CSS co interfejs, więc motyw ciemny działa także na płótnie.

Świat odrzuca kostium „hakerski” (ciemny neon, terminal, zielone cyfry) i tęczę kolorowych pigułek. Motyw ciemny nie jest osobną estetyką, tylko tymi samymi tokenami w innych wartościach.

**Key Characteristics:**
- Geist i Geist Mono (lokalnie, @fontsource), cyfry tabelaryczne globalnie.
- Neutralne szarości, obramowania 1px, płaskie powierzchnie, prawie bez cieni.
- Jeden akcent niebieski; pewność jako sekwencyjna rampa tego samego odcienia zawsze z etykietą słowną.
- Czerwień wyłącznie dla cash-out i błędów, bursztyn dla ostrzeżeń i niepewności.
- Ikony lucide w jednej grubości kreski, rozmiary 12–16px.
- Motyw jasny, ciemny i systemowy z jednego zestawu tokenów.

## Colors

Neutralna, chłodno-obojętna szarość z jednym niebieskim głosem i dwoma kolorami stanów, które pojawiają się wyłącznie przy znaczeniu.

### Primary
- **Niebieski Śledczy** (accent): przycisk główny, linki, fokus (obrys 2px), aktywny wiersz adresu, zaznaczenie w rankingu, `mark` w cytatach dowodów, podświetlona ścieżka w grafie, wartość „Pewność ≥60%” w pasku etapów. Hover ciemnieje do accent-hover.
- **Mgła Akcentu** (accent-soft z accent-border): tło zaznaczenia, tagów akcentowych, pola fokusu (pierścień 3px) i paneli `tone-accent`.

### Rampa Pewności (sekwencyjna, jeden odcień)
- **Pewność 4 – Bardzo wysokie** (confidence-4), **3 – Prawdopodobne** (confidence-3), **2 – Średnie** (confidence-2), **1 – Niskie / szum** (confidence-1): wypełnienie segmentów miernika, pigułek pasma i węzłów adresów w grafie. Jaśniejsze stopnie dostają obrys stopnia wyżej, by nie znikały na bieli.
- **Wykluczone** (confidence-0 z confidence-0-border): szare, a w pigułce i grafie przerywane. Nigdy niebieskie.

### Stany
- **Czerwień Cash-out** (danger, danger-soft, danger-border): wskaźniki wyjścia do fiat, licznik flag, wartość „Cash-out” w pasku etapów, błędy formularza i banery błędu.
- **Bursztyn Ostrzeżenia** (warn, warn-soft, warn-border): ostrzeżenia, słabe powiązania (homonim, linia kropkowana), zapis zaciemniony, nieudane przebiegi, wnioski analityczne (ramka przerywana).

### Neutral
- **Papier** (bg): tło aplikacji. **Karta** (surface): panele, pola, graf. **Szarość 2 / 3** (surface-2, surface-3): pasek boczny, nagłówki tabel, hover; tor miernika, tagi, segmentowane przełączniki.
- **Linia** (border) i **Linia mocna** (border-strong): podziały 1px; obramowanie przycisków, pól i krawędzi grafu.
- **Tusz** (text), **Tusz 2** (text-2), **Tusz 3** (text-3): treść, opisy, etykiety i metadane.

Wartości ciemne (bg #0a0a0a, surface #111111, accent #4d9cff, rampa odwrócona jasnością) są zapisane w `.impeccable/design.json` i w `src/styles.css`; nazwy tokenów są te same.

### Named Rules
**The One Voice Rule.** Akcent niebieski oznacza wyłącznie akcję, zaznaczenie, fokus i pewność. Nie używa się go do dekoracji, nagłówków ani ikon ozdobnych.

**The Meaning Never Rides on Color Alone Rule.** Pewność zawsze idzie trójką: liczba, 4-segmentowy miernik i etykieta słowna (lub pigułka z nazwą pasma). Wykluczone dostaje dodatkowo kreskę przerywaną.

**The Red Is Cash-out Rule.** Czerwień jest zarezerwowana dla wskaźników cash-out i błędów. Liczby dodatnie i ujemne są neutralne (Tusz / Tusz 2), nie zielone i nie czerwone.

## Typography

**Display Font:** Geist Variable (z Segoe UI, system-ui)
**Body Font:** Geist Variable
**Label/Mono Font:** Geist Mono Variable (z ui-monospace, Consolas) dla adresów, hashy, sieci i egress

**Character:** Rzeczowa, geometryczna para jednego rodu. Sans niesie interfejs, mono niesie dane, które analityk kopiuje i porównuje znak po znaku (zero przekreślone).

### Hierarchy
- **Display** (600, 44px, 1, -0.03em): wielki Wskaźnik Pewności w inspektorze i szczególe adresu. Tylko liczby.
- **Headline** (600, 24px, 1.25, -0.02em): tytuł strony / sprawy, `text-wrap: balance`.
- **Title** (600, 18px, 1.3): sekcje strony. Nagłówki paneli są mniejsze (14px, 600).
- **Metric** (600, 20px, 1.25, -0.02em): wartości w pasku etapów; wariant kompaktowy 16px.
- **Body** (400, 14px, 1.5): treść; leady do 72ch, puste stany do 46ch. Gęste wiersze 13–13.5px.
- **Label** (500, 12.5px): nagłówki tabel (Tusz 3, bez wersalików), etykiety etapów, podpisy; pigułki 12px.
- **Mono** (400, 12.5px; w tagach i rankingu 11.5px): adresy, identyfikatory, odznaki sieci (11px, 600).

### Named Rules
**The Tabular Everywhere Rule.** `font-feature-settings: 'tnum' 1` jest ustawione na `:root`; kolumny liczbowe wyrównuje się do prawej (`.num`). Żadnych cyfr proporcjonalnych w danych.

**The No Shouting Rule.** Nie ma wersalików, etykiet nad tytułami ani rozstrzelonych liter. Hierarchię robi waga 600 i rozmiar, nie dekoracja.

## Layout

Powłoka to siatka: lewy pasek boczny 232px (Szarość 2, obramowanie 1px) i treść `minmax(0, 1fr)`; `main` ma padding 22px 32px 48px i max-width 1480px. Pasek boczny jest przyklejony na pełną wysokość: marka, nawigacja, a na dole notka OSINT i trójstanowy przełącznik motywu.

Rytm odstępów: 4 / 6 / 8 / 12 / 16 / 20 / 32px. Panele są oddzielone 16px, kolumny siatek 20px, wewnętrzny padding paneli 16px, nagłówek panelu 12px 16px (min. 49px).

Widok sprawy: nagłówek, pasek etapów (siedem równych komórek z podziałami 1px, scalający etapy i kluczowe liczby), pasek zakładek (podkreślenie 2px w kolorze Tuszu), domyślnie Graf. Powłoka grafu: płótno `minmax(0,1fr)` + inspektor 340px, wysokość płótna `max(440px, 100vh − 440px)`, tło z kropkową siatką 20px. Lista adresów i szczegół: 380px + reszta.

Responsywność: przy 1200px pasek etapów 4 kolumny; przy 1100px siatki, split i graf składają się do jednej kolumny (inspektor pod grafem); przy 900px pasek boczny staje się poziomym paskiem z przewijaną nawigacją, `main` 20px 16px; przy 640px pasek etapów to jeden przewijany poziomo pasek (min. 140px na etap); poniżej 600px szerokości kontenera kolumny grafu stają się wierszami.

## Elevation & Depth

System jest płaski: głębię dają tonalne warstwy (Papier → Szarość 2 → Karta) i obramowania 1px, nie cienie. Jedyny używany cień, `shadow-sm`, podnosi wybrany element w zestawie przełączników (aktywny link nawigacji, aktywny segment, aktywny motyw), by odczytywał się jako „wciśnięty na wierzch”.

### Shadow Vocabulary
- **Wybór w zestawie** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`; ciemny 0.4): aktywna pozycja nawigacji, segmentu i przełącznika motywu.
- **Pierścień fokusu pola** (`box-shadow: 0 0 0 3px var(--accent-soft)`): fokus inputów i selectów razem z obramowaniem w akcencie.
- **Obrys zaznaczenia wiersza** (`box-shadow: inset 0 0 0 1px var(--accent-border)`): wybrany adres na liście.

### Named Rules
**The Flat By Default Rule.** Panele, karty, tabele i graf nie mają cienia. Cień oznacza tylko stan wyboru w grupie.

## Shapes

Łagodne, techniczne narożniki: 8px dla kontenerów (panele, pasek etapów, powłoka grafu), 6px dla kontrolek (przyciski, pola, banery, ranking, segmenty), 4px dla drobnych elementów (odznaka sieci, rodzaj ustalenia, przyciski wewnątrz segmentów, obrys fokusu), pigułka 999px dla tagów, pasm i chipów przebiegu. Obramowania zawsze 1px; kreska przerywana jest znaczeniowa (wykluczone, wzmianka, wniosek, wskaźnik wywnioskowany), kropkowana oznacza słabe powiązanie. W grafie kształt koduje typ: podmiot koło, identyfikator zaokrąglony kwadrat, adres romb.

## Components

### Buttons
Rzeczowe i ciche; jedyny kolorowy to główny.
- **Shape:** łagodny narożnik (6px), wysokość 34px, padding 0 12px, 13.5px / 500, ikona 14–15px z odstępem 6px.
- **Primary:** Niebieski Śledczy z białym tekstem, waga 600; hover accent-hover. Jeden na widok (uruchom analizę).
- **Default:** Karta z obramowaniem Linia mocna; hover Szarość 2, active Szarość 3; disabled opacity 0.55.
- **Ghost:** przezroczysty, Tusz 2; hover Szarość 3 i Tusz. Akcje drugorzędne w nagłówkach paneli, kopiowanie.
- **Small / icon-only:** 28px (padding 0 9px, 12.5px); kwadraty 34 / 28px dla przybliżenia grafu i kopiowania.
- **Link:** bez ramki, kolor akcentu, podkreślenie na hover.

### Chips / Tags
- **Style:** pigułka 22px, 12px / 500, Szarość 3 i Tusz 2; `outline` z Linią mocną dla identyfikatorów (ikona typu + wartość); wariant mono 11.5px.
- **State:** akcentowy (aktywne / ustawione), ostrzegawczy, błędu; typ powiązania: bezpośrednie akcentowe, pivot neutralny, wzmianka przerywana, słabe bursztynowe przerywane.
- **Chip przebiegu:** pigułka 28px z obramowaniem; aktywny dostaje ramkę w Tuszu i wagę 600, nieudany bursztyn.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Karta; tony `danger` i `accent` zmieniają tło na wersję soft i ramkę na border tonu.
- **Shadow Strategy:** brak (zob. Elevation & Depth).
- **Border:** 1px Linia; nagłówek oddzielony linią.
- **Internal Padding:** 16px; wariant `flush` bez paddingu dla list i tabel.

### Inputs / Fields
- **Style:** 34px, obramowanie 1px Linia mocna, 6px, Karta, 13.5px; placeholder Tusz 3; hover ramka Tusz 3.
- **Focus:** ramka w akcencie i pierścień 3px Mgły Akcentu, bez outline.
- **Error / Disabled:** błąd formularza to wiersz z ikoną w czerwieni pod polem; wiersz identyfikatora to siatka typ 150px / wartość / przycisk 34px.

### Navigation
- **Style:** pionowa lista w pasku bocznym, ikona 16px + etykieta 500, padding 7px 10px, 6px narożnik, Tusz 2.
- **States:** hover Szarość 3 i Tusz; aktywna strona (`aria-current`) Karta z obrysem 1px i `shadow-sm`.
- **Mobile:** poniżej 900px poziomy przewijany pasek pod marką; podtytuł marki i notka znikają.
- **Zakładki:** 40px, 500, Tusz 2; wybrana Tusz z podkreśleniem 2px w Tuszu; licznik 12px Tusz 3.

### Wskaźnik Pewności (signature)
Liczba (600, tabelaryczna, min. 3.2ch) + miernik czterech segmentów 6×12px z odstępem 2px (zapalone w kolorze rampy pasma, zgaszone Szarość 3 z obrysem) + etykieta pasma 12.5px Tusz 2. Wykluczone: zero segmentów i całość w Tuszu 3. Wersja pigułki (`Band`) to wypełnienie stopnia rampy z jego kolorem tekstu.

### Pasek etapów (signature)
Siedem komórek w jednej ramce 8px: etykieta z ikoną stanu (check dla ukończonego, przerywane koło dla pustego / pominiętego), wartość Metric i podpis 12px. Ton wartości: akcent dla pewnych adresów, czerwień dla cash-out; etapy pominięte pokazują „—” w Tuszu 3.

### Graf powiązań i inspektor (signature)
Cytoscape z układem kolumnowym (kolumna 250px, wiersz 92px), zoom dopasowania nie mniejszy niż 0.7. Węzły: podmiot w Tuszu, identyfikatory Karta z ramką Tusz 2 (pivot Szarość 3, słaby bursztyn przerywany), adresy romby w kolorze rampy z ramką confidence-3, wykluczone przerywane. Krawędzie 1.5px Linia mocna ze strzałką; ścieżka wybranego adresu 2.5px w akcencie, reszta przygaszona do 0.2–0.3 przy etykietach wciąż czytelnych. Pasek narzędzi nad płótnem, legenda pod nim. Inspektor: odznaka sieci, pełny adres mono 12px, Display z miernikiem, mini tabela reguł, sekcja „Wyjście do fiat” (wskaźniki w czerwonych ramkach soft lub wiersz „brak wskaźników” z ikoną), przycisk do pełnego uzasadnienia i ranking wszystkich adresów (lista w ramce 6px, wybrany wiersz Mgła Akcentu).

### Ustalenia i dowody
Rodzaj ustalenia jako znacznik 22px z narożnikiem 4px: fakt neutralny, obliczenie akcentowe, wniosek bursztynowy przerywany. Cytat dowodu w Szarości 2 z ramką 6px; trafienie jako `mark` mono w Mgle Akcentu. Wskaźniki cash-out to siatka ikona 20px + treść w czerwonej ramce soft; wywnioskowane przerywane, informacyjne neutralne.

## Do's and Don'ts

### Do:
- **Do** czytać kolory grafu i każdego nowego płótna z tych samych zmiennych CSS co interfejs, żeby motyw ciemny działał bez osobnej palety.
- **Do** pokazywać pewność zawsze z etykietą słowną lub nazwą pasma, nigdy samym kolorem.
- **Do** utrzymywać obramowania 1px i warstwy tonalne zamiast cieni; `shadow-sm` tylko dla wyboru w grupie przełączników.
- **Do** pisać adresy, hashe i identyfikatory w Geist Mono, a liczby w cyfrach tabelarycznych wyrównanych do prawej.
- **Do** używać ikon lucide w domyślnej grubości kreski, 12–16px, zawsze z `aria-hidden` obok tekstu.
- **Do** oznaczać stan pustego lub pominiętego etapu „—” w Tuszu 3, a nie zerem w kolorze.

### Don't:
- **Don't** używać ciemnego neonu, estetyki terminala ani „hakerskiej” zieleni; motyw ciemny to te same tokeny.
- **Don't** kolorować liczb dodatnich na zielono ani ujemnych na czerwono; czerwień należy do cash-out i błędów.
- **Don't** wprowadzać drugiego akcentu ani tęczy kolorowych pigułek dla kategorii; kategorie są tekstem lub neutralnym tagiem.
- **Don't** barwić wykluczonych adresów rampą niebieską; wykluczone są szare i przerywane.
- **Don't** dodawać etykiet nad tytułami, wersalików ani rozstrzelonych liter.
