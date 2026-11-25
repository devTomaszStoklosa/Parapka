# Projekt interfejsu Parapki

Projekt wyglądu aplikacji w kierunku „ciepły, miękki”: jasne tło, zaokrąglone karty, dwa akcenty osób i ciemne przyciski główne. Źródło to canvas Design (9 ekranów telefonu 390 px szerokości), zapisany w `canvas/`. Ten dokument opisuje tokeny i komponenty, do których odwołują się zadania przebudowy wyglądu w `apps/mobile`.

Pliki `canvas/*.dc.html` to źródło projektu, nie kod aplikacji. Ładują środowisko canvasu (`support.js`), więc poza nim się nie uruchomią. Podgląd: canvas w artefakcie właściciela repozytorium (prywatny). Imiona w projekcie (Ola, Kuba, Zosia, Antek) i wszystkie liczby są przykładowe.

## Ekrany

| Plik | Ekran | Moduł aplikacji | Wymagania |
|---|---|---|---|
| `Main.dc.html` | Dziś, widok partnera | `src/today` | FR-CYC-11, FR-PAIR-06, FR-CHR-02 |
| `Checkin.dc.html` | Check-in tygodnia, wypełnianie i zapieczętowanie | `src/checkin` | FR-CHK-02, FR-CHK-03, FR-CHK-04 |
| `CheckinWyniki.dc.html` | Wyniki check-inu obok siebie, trend 8 tygodni | `src/checkin` | FR-CHK-05, FR-CHK-09 |
| `Planer.dc.html` | Planer: Dziś, Tydzień, Wszystkie; filtry; „Nie dam rady” | `src/chores` | FR-CHR-02, FR-CHR-04, FR-CHR-06, FR-CHR-07, FR-CHR-09 |
| `Glowa.dc.html` | Głowa: podział, trend 12 tygodni, zrzut głowy, „Przejmuję” | `src/head` | FR-MNT-02 do FR-MNT-05, FR-MNT-07 |
| `Cykl.dc.html` | Cykl, widok osoby z cyklem: pierścień i kalendarz, opis fazy, wskazówki partnera | `src/cycle` | FR-CYC-02, FR-CYC-04, FR-CYC-06, FR-CYC-07, FR-CYC-15 |
| `Samopoczucie.dc.html` | Wpis samopoczucia w arkuszu od dołu | `src/cycle` | FR-CYC-05 |
| `Parowanie.dc.html` | Kod QR, link, kod bezpieczeństwa, skaner | `src/pairing` | FR-PAIR-01, FR-PAIR-02 |
| `Zgoda.dc.html` | Zgoda per kategoria z podglądem wskazówki | `src/consent` | FR-PAIR-03, §4.1 |

Projekt nie zmienia zachowania opisanego w `spec.md`. Gdy ekran projektu i specyfikacja się różnią, obowiązuje specyfikacja.

## Kolory

| Token | Wartość | Użycie |
|---|---|---|
| `background` | `#F4F1F8` | tło ekranu |
| `surface` | `#FFFFFF` | karty, arkusze, pola |
| `text` | `#1F1A2E` | tekst, przyciski główne, pasek kart, zaznaczenia neutralne |
| `textMuted` | `#5F5873` | opisy, etykiety, metadane |
| `border` | `#8C84A0` | obramowanie pól, przycisków drugorzędnych i chipów do wyboru, pusty checkbox, pusty element skali (kontrast ≥ 3:1, WCAG 1.4.11) |
| `borderSubtle` | `#D9D3E4` | tylko dekoracja: obramowanie elementów, które nie są kontrolkami |
| `divider` | `#EEE9F3` | linie między wierszami |
| `track` | `#E7E2EF` | puste paski postępu i skal |
| `personA` | `#5B4BD6` | kolor pierwszej osoby w parze (fiolet); też wybrane wartości w formularzach i przycisk dodawania |
| `personAText` | `#4335B8` | tekst w kolorze fioletu na jasnym tle |
| `personATint` | `#ECE9FD` | tło chipów i kart fioletowych |
| `personB` | `#C2375E` | kolor drugiej osoby w parze (róż) |
| `personBText` | `#A12D4E` | tekst w kolorze różu na jasnym tle |
| `personBTint` | `#FCE6ED` | tło karty wskazówki i chipów drugiej osoby |
| `warmTint` | `#FFEBDD` | dekoracyjne tło ikony (tekst `#9A4A1C`) |
| `onDark` | `#C9C3DB` | nieaktywne ikony na ciemnym pasku kart |

Akcenty oznaczają osoby, nie oceny. Każda osoba w parze ma stały kolor, ten sam na obu telefonach (w projekcie Kuba fiolet, Ola róż). Kolor nigdy nie ocenia wartości (FR-CHK-05) ani nie wyróżnia zaległości partnera (FR-CHR-07).

Kontrast (WCAG 2.1, NFR-UX-03), wszystkie pary ≥ 4,5:1 dla tekstu:

| Tekst | Tło | Kontrast |
|---|---|---|
| `#1F1A2E` | `#FFFFFF` / `#F4F1F8` | 16,86 / 15,08 |
| `#5F5873` | `#FFFFFF` / `#F4F1F8` / `#FCE6ED` / `#ECE9FD` | 6,71 / 6,00 / 5,65 / 5,64 |
| `#FFFFFF` | `#5B4BD6` | 6,14 |
| `#FFFFFF` | `#C2375E` | 5,25 |
| `#4335B8` | `#ECE9FD` | 7,23 |
| `#A12D4E` | `#FCE6ED` / `#FFFFFF` | 5,89 / 7,00 |
| `#C9C3DB` | `#1F1A2E` | 9,89 |
| `#9A4A1C` | `#FFEBDD` | 5,39 |
| `#8C84A0` (element) | `#FFFFFF` | 3,55 |

Canvas rysuje obramowanie pól i chipów jaśniejszym `#D9D3E4` (1,4:1 na białym). W aplikacji granice kontrolek muszą mieć ≥ 3:1, więc dostają `border` (`#8C84A0`).

## Typografia

- Nagłówki: **Bricolage Grotesque** 700, odstęp liter −0,02 em. Tytuł ekranu 32–34 px, tytuł karty 20–26 px.
- Tekst: **Plus Jakarta Sans**. Treść 14–15 px, etykiety 12–13 px (600–700), drobny tekst 11 px.
- Oba kroje są na licencji SIL Open Font License i obsługują polskie znaki. W aplikacji fonty trzeba dołączyć do paczki (`expo-font`), a nie ładować z Google Fonts w czasie działania, bo to przekazuje adres IP osoby do Google.

## Kształt i odstępy

- Promienie: karta 22–28 px, pole i małe karty 14–18 px, chipy i przyciski w kształcie pigułki 999 px.
- Cień karty: `0 1px 2px rgba(31,26,46,0.04), 0 8px 24px rgba(31,26,46,0.06)`. Pasek kart i przycisk dodawania mają mocniejszy cień.
- Marginesy ekranu 20 px, odstęp między kartami 10–16 px, wnętrze karty 16–20 px.
- Cel dotyku ≥ 44 px wszędzie (`MIN_TOUCH_TARGET`).

## Komponenty

| Komponent | Gdzie | Opis |
|---|---|---|
| Pływający pasek kart | wszystkie karty główne | ciemna pigułka u dołu; aktywna karta to biała pigułka z ikoną i nazwą, pozostałe same ikony z etykietą dostępności |
| Karta wskazówki | Dziś | różowe tło, chip „Wskazówka na dziś” i chip kategorii, tekst wskazówki krojem nagłówkowym, linia o prywatności, „Zrobione” / „Nie dziś” z cofnięciem |
| Kafle (bento) | Dziś | dwa kafle: check-in z paskiem postępu, Głowa z paskiem podziału |
| Lista z checkboxami | Dziś, Planer | okrągły (Dziś) albo zaokrąglony kwadrat (Planer), chip odpowiedzialnej osoby po prawej |
| Przełącznik | Dziś, Zgoda | tor 52×32 px, `role="switch"` |
| Kontrolka segmentowa | Planer, Cykl, Parowanie | 2–3 opcje w pigułce, wybrana na białym tle albo ciemna |
| Chipy filtrów | Planer, Głowa | pigułki z obramowaniem, wybrany ciemny; w Głowie przewijane poziomo |
| Pasek tygodnia | Planer | 7 dni, dziś ciemny, kropka przy dniach z obowiązkami |
| Akcja „Nie dam rady” | Planer | w projekcie odsłonięta przesunięciem wiersza; w aplikacji musi być też dostępna bez gestu (przycisk albo menu) |
| Toast z cofnięciem | Planer | ciemny, z licznikiem 10 s w pierścieniu (FR-CHR-06) |
| Przycisk dodawania | Planer | fioletowy kwadrat 60 px nad paskiem kart |
| Skale 1–5 | Check-in, wpis samopoczucia | pigułki z liczbami, słupki energii rosnące w prawo, koła bliskości rosnące w prawo |
| Pole „Potrzebuję…” | Check-in | licznik 140 znaków i chipy podpowiedzi |
| Karta „Zapieczętowane” | Check-in | koncentryczne koła z kłódką, „Zmień odpowiedzi” |
| Odpowiedzi obok siebie | Wyniki check-inu | kropki 1–5 w kolorach osób, dymki „Potrzebuję…”, bez sum i różnic |
| Wykres pierścieniowy | Głowa | podział Ola / Ty z liczbą otwartych rzeczy w środku |
| Słupki trendu | Głowa, Wyniki | 12 tygodni udziału albo linia 8 tygodni |
| Karta prośby | Głowa | różowy pasek „prosi, żebyś to przejął”, „Przejmuję” / „Nie teraz” |
| Pierścień cyklu | Cykl | fazy jako łuki, znacznik dnia, chip fazy, przełączany na kalendarz miesiąca |
| Oś czasu wskazówek | Cykl | Dziś, Jutro, Pojutrze; „Inna (n/3)” i „Pomiń dziś” |
| Arkusz od dołu | Wpis samopoczucia | uchwyt, przyciemnione tło, „Zawsze prywatne” |
| Kod bezpieczeństwa | Parowanie | 6 cyfr w kafelkach, 3 + 3 |
| Karta „Zawsze tylko u Ciebie” | Zgoda | ciemna karta z listą danych, które nigdy nie wychodzą z telefonu |

## Zasady

- Bez emoji; ikony to proste ikony konturowe.
- Bez gradientów tła i bez kolorów ostrzegawczych przy danych partnera.
- Każdy element interaktywny to prawdziwy przycisk, link albo pole z etykietą dostępności.
- Teksty pozostają w plikach tłumaczeń (`src/i18n`), a projekt podaje tylko ich brzmienie.
