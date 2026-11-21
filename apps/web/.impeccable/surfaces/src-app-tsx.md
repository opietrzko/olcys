---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/RunView.tsx","src/Graph.tsx"]
---

# OŁCyŚ web app (całość: Analizy, widok analizy, Metodyka, Źródła, Audyt)

Mode: Operate. Audience: analitycy KAS (codzienna praca) i jury HackNation (pokaz na projektorze). Task: uruchomić analizę z identyfikatorów, ocenić adresy (Wskaźnik Pewności + reguły + dowody), wykryć cash-out, wyeksportować raport. Most important view: graf powiązań. Constraints: on-prem (fonty i ikony w paczce), WCAG 2.1 AA, motyw jasny i ciemny, druk. Must stay: wszystkie funkcje, trasy, polskie treści, terminologia.

## Direction contract

THESIS: Standard kategorii, wykonany na poziomie Vercel/Geist i Chainalysis Reactor: spokojny, jasny dashboard śledczy, w którym graf powiązań jest głównym narzędziem, a nie ilustracją. Odrzuca kostium „hakerski” (ciemny neon, terminal) i tęczę pigułek.

OWN-WORLD: Geist i Geist Mono (lokalnie, @fontsource), neutralna skala szarości z obramowaniami 1px, jeden akcent niebieski dla akcji, zaznaczenia i fokusu. Pewność jako sekwencyjna rampa jednego odcienia (akcent) plus etykieta słowna; wykluczone szare i przerywane; czerwień wyłącznie dla wskaźników cash-out, bursztyn dla ostrzeżeń. Ikony lucide w jednej grubości kreski. Cyfry tabelaryczne wszędzie. Motyw ciemny z tych samych tokenów.

STORY: Analityk wpisuje identyfikatory, widzi przebieg, otwiera graf: podmiot → tożsamości → adresy w czytelnych kolumnach, wybiera adres i od razu widzi wynik, reguły i cash-out, a jednym kliknięciem dowody i raport.

FIRST VIEWPORT: Lewy pasek nawigacji 232px (marka, Analizy, Metodyka, Źródła i zgodność, Audyt, przełącznik motywu). Treść: nagłówek sprawy (nazwa, identyfikatory, przebiegi, akcje Uruchom ponownie / Raport / Eksport), pasek statystyk, zakładki z Grafem domyślnie; graf na pełną szerokość z paskiem narzędzi (dopasuj, przybliż, ukryj wykluczone) i panelem inspektora wybranego adresu po prawej.

FORM: canon (standing exit), wybrany przez użytkownika; seed:2b4255193c82655a. Raport i Eksport leżą na pasku zakładek przebiegu, bo dotyczą konkretnego przebiegu, nie całej sprawy. Wzorce: Vercel/Geist, Chainalysis Reactor. Sygnatura: deterministyczny układ kolumnowy grafu z podświetleniem sąsiedztwa wybranego węzła i inspektorem obok.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
