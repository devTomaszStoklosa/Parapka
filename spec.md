# spec.md: aplikacja mobilna dla par — specyfikacja MVP

Wersja 0.1 · Data: 2026-10-28 · Status: szkic do akceptacji
Źródło: `intent.md` v0.2. Odwołania w formie (intent §N).
Nazwa robocza w tym dokumencie: **Parapka** (nazwa katalogu projektu). Ostateczna nazwa jest otwarta (intent §10, pytanie 10).

**Legenda**
- ✅ ustalone w intent.md
- 💡 propozycja z intent.md przyjęta w specyfikacji jako baza
- ⚠️ napięcie, którego specyfikacja nie rozstrzyga ostatecznie
- **A‑n** założenie wprowadzone w tej specyfikacji (lista w §13); do potwierdzenia, łatwe do zmiany
- Priorytety: **MUST** (warunek MVP), **SHOULD** (MVP, jeśli starczy czasu), **MUST NOT** (zakaz), **LATER** (po MVP)
- Identyfikatory: `FR-<moduł>-<nr>` wymagania funkcjonalne, `NFR-<obszar>-<nr>` niefunkcjonalne, `ZP-<nr>` zasady produktu, `R-<nr>` ryzyka specyfikacji, `N-<nr>` nowe pytania
- Kryteria akceptacji: „Zakładając, że … gdy … wtedy …” albo sprawdzalny warunek

---

## 1. Cel, zakres i nie-cele

### 1.1 Cel MVP

Sprawdzić na parach testowych (na początek pierwsza para testowa, potem mały pilotaż, N-3), czy cztery panele MVP dają wartość obu osobom w parze na tyle, że oboje korzystają z aplikacji co tydzień przez co najmniej 6 tygodni. Miary sukcesu w §10 (intent §11).

### 1.2 W zakresie MVP ✅ (intent §4)

1. Onboarding, osobno dla każdej osoby.
2. Łączenie pary ze zgodą per kategoria danych.
3. Panel 1: Cykl i wskazówki dla partnera (opcjonalny).
4. Panel 2: Check-in tygodniowy.
5. Panel 3: Planer obowiązków.
6. Panel 4: Obciążenie mentalne.
7. Synchronizacja dwóch telefonów przez szyfrowany relay E2E ✅.
8. Powiadomienia, blokada aplikacji, usuwanie i eksport danych.

### 1.3 Poza zakresem MVP (nie-cele)

- Panele 5–16 (etapy 2–4), w tym czat z podpowiedziami AI (A8). Lista w §15.
- Płatności, freemium i subskrypcja (A6). Specyfikacja oznacza tylko funkcje planowane jako premium.
- Szyfrowany backup danych (A5).
- Synchronizacja P2P, wersja webowa i na tablety.
- Kilka urządzeń na jedno konto i kilka par na jedno konto (A9).
- Import danych z Apple Health, Google Health Connect i innych aplikacji cyklu.
- Jakiekolwiek funkcje medyczne: antykoncepcja, wyznaczanie dni płodnych, diagnozy (intent §8, napięcie 3).
- Serwerowa analityka zachowań (§10).

### 1.4 Zasady produktu jako reguły sprawdzalne (intent §1, §6)

| ID | Zasada | Jak sprawdzić |
|---|---|---|
| ZP-1 | Wzajemność: każdy panel MVP daje coś obu osobom. | Tabela wzajemności w §4 ma dla każdego panelu korzyść dla obu stron. |
| ZP-2 | Zero presji: „nie” jest zawsze w porządku. | Każda prośba, przypisanie i wskazówka ma opcję odmowy bez uzasadnienia. Aplikacja nigdy nie powiadamia osoby A, że osoba B czegoś nie zrobiła, nie wypełniła ani nie przeczytała. Brak rankingów i liczników zaległości partnera. |
| ZP-3 | Małe regularne kroki. | Check-in ≤ 2 min, wpis samopoczucia ≤ 15 s, wskazówka dnia ≤ 120 znaków. |
| ZP-4 | Narzędzie bliskości, nigdy kontroli. | Brak lokalizacji, statusu „online”, potwierdzeń odczytu i historii aktywności partnera (FR-SEC-03). |
| ZP-5 | Wskazówki nigdy nie naciskają na seks 💡 (intent §6, zasada 1). | Testy treści w CI (§7.6) i przegląd specjalisty (§8). |
| ZP-6 | Osoba z cyklem widzi to, co partner 💡 (zasada 2). | FR-CYC-06. |
| ZP-7 | Prywatne pozostaje prywatne 💡 (zasada 4). | Macierz w §4: domyślna widoczność „tylko autor”. |

## 2. Role i słownik

| Pojęcie | Znaczenie |
|---|---|
| Osoba z cyklem | Osoba, która włączyła panel cyklu. W parze mogą być zero, jedna albo dwie takie osoby. Specyfikacja używa ról neutralnych zamiast „ona/on”, bo aplikacja jest dla każdego typu pary ✅. |
| Partner | Druga osoba w parze z perspektywy danego zapisu. |
| Konto | Lokalna tożsamość kryptograficzna na telefonie, bez e-maila i hasła (A10). |
| Para | Dwa konta połączone procesem z §5.2. Konto należy najwyżej do jednej pary (A9). |
| Relay | Mały serwer, który przechowuje i przekazuje zaszyfrowane koperty. Nie ma kluczy ✅. |
| Koperta | Zaszyfrowana paczka zmian wysyłana z jednego telefonu na drugi (§7.4). |
| Kategoria danych | Jednostka zgody: `CYCLE_HINTS`, `CHECKIN`, `CHORES`, `MENTAL_LOAD`, `PROFILE`. Surowe dane cyklu nie mają kategorii, bo nigdy nie są udostępniane. |
| Wskazówka | Jedno zdanie dla partnera na dany dzień, wygenerowane na telefonie osoby z cyklem. Nie zawiera danych źródłowych. |
| Wpis samopoczucia | Krótki prywatny wpis osoby z cyklem: energia, nastrój, napięcie, ochota, objawy. |
| Faza | Szacowany etap cyklu: miesiączka, folikularna, okołoowulacyjna, lutealna (z okresem przedmiesiączkowym). |
| Check-in | Cotygodniowe odpowiedzi jednej osoby, odsłaniane dopiero, gdy oboje wypełnią. |
| Obowiązek | Zadanie do zrobienia, stałe (powtarzalne) albo okazjonalne. |
| Rzecz do pamiętania | Pozycja obciążenia mentalnego: coś, o czym ktoś musi pamiętać, nie tylko zrobić. Ma „nosiciela”, czyli osobę, która nosi ją w głowie. |

## 3. Model domenowy

Wszystkie encje mają `id` (UUIDv7), `createdAt`, `updatedAt` (HLC, §7.5) i `deletedAt` (tombstone). Kolumna „Sync” mówi, czy encja trafia na telefon partnera.

| Encja | Najważniejsze pola | Właściciel | Sync |
|---|---|---|---|
| `Profile` | `displayName`, `grammaticalForm` (`feminine`, `masculine`, `neutral`), `locale`, `hasCycle`, `adultConfirmed` | osoba | tylko `displayName` i `grammaticalForm` (`PROFILE`) |
| `OnboardingAnswers` | `relationshipLength`, `hasChildren`, `childrenCount`, `goals[]`, `goalsNote`, `sharedWithPartner` | autor | tylko gdy `sharedWithPartner` |
| `Device` | `deviceId`, klucze publiczne Ed25519 i X25519, `pushToken` | osoba | klucze publiczne przy parowaniu |
| `Pair` | `pairId`, `members[2]`, `status` (`active`, `disconnected`), `pairedAt`, `checkInDay`, `checkInTime` | oboje | tak |
| `ConsentGrant` | `userId`, `category`, `enabled`, `changedAt`, `consentTextVersion` | osoba udzielająca | tak (partner wie, czego nie oczekiwać) |
| `SharingPause` | `userId`, `paused`, `changedAt` | osoba | nie (A12) |
| `CycleProfile` | `typicalCycleLength`, `typicalPeriodLength`, `enabled`, `wellbeingReminder` | osoba z cyklem | nigdy |
| `PeriodLog` | `startDate`, `endDate` | osoba z cyklem | nigdy |
| `WellbeingEntry` | `date`, `energy`, `mood`, `tension` (1–5), `desire` (1–5, opcjonalne), `tags[]`, `note` | osoba z cyklem | nigdy |
| `Hint` | `forDate`, `templateId`, `contentVersion`, `text`, `category` (`relief`, `tenderness`, `attention`, `space`, `appreciation`), `generatorUserId`, `status` (`scheduled`, `skipped`, `replaced`) | generator | tak, jednokierunkowo (`CYCLE_HINTS`) |
| `HintReaction` | `hintId`, `reaction` (`done`, `notToday`) | partner | nigdy (FR-CYC-11) |
| `HintFeedback` | `period`, `accurate` (1–5), `notPushy` (1–5) | osoba z cyklem | nigdy |
| `CheckIn` | `week` (ISO), `userId`, `mood`, `energy`, `closeness` (1–5), `need` (≤ 140 znaków), `submittedAt`, `sealKey` | autor | jako zapieczętowana koperta (§7.4, `CHECKIN`) |
| `Chore` | `title`, `kind` (`recurring`, `oneOff`), `recurrence`, `assignee` (`userId`, `both`, `alternate`, `anyone`), `dueDate`, `reminderTime`, `note`, `linkedItemId`, `visibility` (`private`, `shared`) | wspólny albo prywatny | gdy `shared` (`CHORES`) |
| `ChoreCompletion` | `choreId`, `occurrenceDate`, `completedBy`, `completedAt` | wspólny | jak `Chore` |
| `MentalLoadItem` | `title`, `category`, `weight` (1–3), `dueDate`, `linkedChoreId`, `status` (`open`, `done`), `visibility` | wspólny albo prywatny | gdy `shared` (`MENTAL_LOAD`) |
| `CarrierChange` | `itemId`, `carrier` (`userId` albo `both`), `changedBy`, `changedAt` (HLC) | wspólny | jak `MentalLoadItem` |
| `HandoverRequest` | `itemId`, `requestedBy`, `status` (`pending`, `accepted`, `declined`) | wspólny | jak `MentalLoadItem` |
| `MentalLoadSnapshot` | `week`, `shareByUser` (%), `itemsCount` | liczony lokalnie | nie (liczony z `CarrierChange`, więc oba telefony dochodzą do tego samego wyniku) |
| `LocalActivityLog` | dni z otwarciem aplikacji | osoba | nigdy (tylko do raportu z §10) |

## 4. Macierz udostępniania i wzajemności

### 4.1 Co widzi partner

| Dane | Gdzie powstają | Co widzi partner | Domyślnie po sparowaniu |
|---|---|---|---|
| Daty miesiączki, fazy, prognozy | telefon osoby z cyklem | nic ✅ | — |
| Wpisy samopoczucia, ochota, notatki | telefon osoby z cyklem | nic ✅ | — |
| Wskazówka dnia | telefon osoby z cyklem | tekst wskazówki na dziś i historię 14 dni | wyłączone do aktywnego włączenia (A11) |
| Odpowiedzi check-in | telefon autora | odpowiedzi autora, dopiero gdy oboje wypełnią ✅ | wyłączone do aktywnego włączenia (A11) |
| Wspólne obowiązki | dowolny telefon | całość | włączone (A11) |
| Wspólne rzeczy do pamiętania | dowolny telefon | całość | włączone (A11) |
| Prywatne obowiązki i rzeczy do pamiętania | telefon autora | nic | — |
| Odpowiedzi z onboardingu | telefon autora | nic, chyba że autor je pokaże 💡 | prywatne |
| Imię i forma gramatyczna | telefon autora | całość | zawsze (potrzebne do działania pary) |
| Blokada, PIN, ustawienia powiadomień | telefon autora | nic | — |

### 4.2 Wzajemność paneli (ZP-1)

| Panel | Korzyść osoby z cyklem | Korzyść partnera |
|---|---|---|
| Cykl i wskazówki | Rozumie swoje samopoczucie w fazach; partner reaguje trafniej, bez tłumaczenia się. | Konkretna wskazówka zamiast zgadywania. |
| Check-in | Zostaje wysłuchana, mówi „potrzebuję”. | To samo. |
| Planer obowiązków | Mniej na głowie. | Jasność, kto co robi; mniej „przypominania”. |
| Obciążenie mentalne | Niewidoczna praca staje się widoczna. | Wie, co może przejąć. |

W parze bez osoby z cyklem panel 1 nie istnieje, a pozostałe są symetryczne.

## 5. Wymagania funkcjonalne

### 5.0 Struktura aplikacji

| Zakładka | Zawartość |
|---|---|
| Dziś | Wskazówka dnia od partnera albo podgląd własnej wskazówki, obowiązki na dziś, otwarty check-in, przełącznik pauzy (FR-PAIR-06). |
| Cykl | Tylko gdy panel jest włączony: kalendarz, opis fazy, wpis samopoczucia. |
| Planer | Obowiązki: Dziś, Tydzień, Wszystkie. |
| Głowa | Rzeczy do pamiętania, podział i trend. |
| Ustawienia | Para, Prywatność (zgody, pauza, rozłączenie, usuwanie i eksport danych), Powiadomienia, Blokada. |

### 5.1 Onboarding (FR-ONB)

Historie użytkownika:
- Jako osoba, która instaluje aplikację, chcę w kilka minut powiedzieć, na czym nam zależy, żeby treści pasowały do nas.
- Jako osoba, która nie zainstalowała aplikacji z własnej inicjatywy, chcę, żeby moje odpowiedzi „co chcę naprawić” zostały tylko u mnie.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-ONB-01 | MUST | Każda osoba przechodzi onboarding osobno na swoim telefonie ✅: imię, forma gramatyczna (A15), potwierdzenie pełnoletności (FR-SEC-07), staż związku (< 1, 1–3, 3–7, 7–15, 15+ lat), dzieci (tak/nie, liczba), na czym nam zależy (wielokrotny wybór: czas razem, rozmowa, podział obowiązków, bliskość, namiętność, mniej kłótni, inne z polem tekstowym), czy mam cykl (tak / nie / nie teraz). |
| FR-ONB-02 | MUST | Odpowiedzi o celach są domyślnie prywatne i służą tylko do lokalnego doboru treści 💡. Przełącznik „pokaż partnerowi” jest dostępny w onboardingu i w ustawieniach. |
| FR-ONB-03 | MUST | Odpowiedź „mam cykl” prowadzi do ekranu z komunikatem „to nie jest metoda antykoncepcji ani narzędzie medyczne” i do konfiguracji z FR-CYC-01. Panel można włączyć także później. |
| FR-ONB-04 | MUST | Onboarding proponuje włączenie blokady aplikacji (FR-SEC-01); można pominąć. |
| FR-ONB-05 | MUST | Jeden ekran informuje, że dane są tylko na telefonie, a utrata telefonu oznacza utratę danych prywatnych (A5). |
| FR-ONB-06 | MUST | Po onboardingu aplikacja działa bez pary (A2): panel cyklu, prywatne obowiązki i rzeczy do pamiętania. Check-in i wskazówki dla partnera wymagają pary. |
| FR-ONB-07 | SHOULD | Mediana czasu onboardingu bez konfiguracji cyklu ≤ 3 min. |

Kryteria akceptacji:
- **FR-ONB-01:** Zakładając, że dwie osoby instalują aplikację na swoich telefonach, gdy każda kończy onboarding, wtedy żadna odpowiedź jednej osoby nie trafia na telefon drugiej, dopóki nie sparują telefonów.
- **FR-ONB-02:** Zakładając sparowaną parę i ustawienia domyślne, gdy partner otwiera profil drugiej osoby, wtedy nie widzi jej celów; gdy autor włączy „pokaż partnerowi”, wtedy partner widzi je po najbliższej synchronizacji.
- **FR-ONB-03:** Gdy osoba wybiera „mam cykl”, wtedy przed pierwszym ekranem kalendarza musi potwierdzić przeczytanie komunikatu o braku funkcji medycznych.
- **FR-ONB-04:** Gdy osoba pominie blokadę, wtedy onboarding nie pyta o nią ponownie, a opcja zostaje dostępna w ustawieniach.
- **FR-ONB-05:** Ekran pojawia się w każdej ścieżce onboardingu.
- **FR-ONB-06:** Zakładając osobę bez pary, gdy dodaje obowiązek z przypomnieniem, wtedy obowiązek zapisuje się jako prywatny, a przypomnienie pojawia się bez dostępu do sieci.
- **FR-ONB-07:** Pomiar w testach z użytkownikami.

### 5.2 Łączenie pary i zgoda (FR-PAIR)

Historie użytkownika:
- Jako osoba zapraszająca chcę połączyć nasze telefony kodem QR, a gdy partner jest daleko, linkiem.
- Jako osoba z cyklem chcę przed udostępnieniem czegokolwiek zobaczyć, co dokładnie i w jakiej formie zobaczy partner.
- Jako każda z osób chcę w każdej chwili wstrzymać udostępnianie bez tłumaczenia się albo rozłączyć parę.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-PAIR-01 | MUST | Osoba A tworzy zaproszenie: kod QR i link. Zaproszenie zawiera klucze publiczne A i jednorazowy sekret, jest jednorazowe i ważne 24 h (§7.3). |
| FR-PAIR-02 | MUST | Osoba B (po onboardingu) skanuje kod albo otwiera link. Telefony wymieniają klucze przez relay ✅. Przy połączeniu przez link oba telefony pokazują ten sam 6-cyfrowy kod bezpieczeństwa, który osoby porównują (np. przez telefon) i potwierdzają; przy skanowaniu QR na miejscu porównanie nie jest wymagane. |
| FR-PAIR-03 | MUST | Przed pierwszą synchronizacją każda osoba osobno widzi ekran zgody ✅: każda kategoria danych z opisem, co i w jakiej formie zobaczy partner, oraz przełącznik. Stany domyślne według §4.1 (A11). Ekran mówi wprost, że usunięcie danych z telefonu partnera po rozłączeniu jest możliwe tylko w miarę możliwości technicznych (FR-PAIR-07). Telefon zapisuje datę i wersję tekstu zgody. |
| FR-PAIR-04 | MUST | Po sparowaniu aplikacja jednorazowo pyta, które prywatne obowiązki i rzeczy do pamiętania przenieść do wspólnych; domyślnie żadne (A2). |
| FR-PAIR-05 | MUST | Zgody można zmieniać w każdej chwili (Ustawienia → Prywatność). Wyłączenie kategorii: telefon przestaje wysyłać i przyjmować dane tej kategorii; dla `CYCLE_HINTS` i `CHECKIN` wysyła też polecenie usunięcia już udostępnionych danych; wspólne obowiązki i rzeczy do pamiętania zostają u obojga jako kopie. Partner widzi, że kategoria jest wyłączona, bez powodu i bez powiadomienia (N-5). |
| FR-PAIR-06 | MUST | Pauza jednym ruchem 💡 (zasada 3): przełącznik na ekranie Dziś wstrzymuje wysyłanie wskazówek i check-inu (A12). Partner nie dostaje powiadomienia, a jego aplikacja pokazuje stan nieodróżnialny od zwykłego braku danych („Dziś brak wskazówki”, „Czekamy na wyniki”). Wznowienie też jednym ruchem. |
| FR-PAIR-07 | MUST | Rozłączenie pary przez dowolną osobę, bez zgody drugiej i bez podawania powodu ✅: (1) zatrzymanie synchronizacji; (2) polecenie usunięcia z telefonu partnera wskazówek i odpowiedzi check-in pochodzących od rozłączającego; (3) lokalne usunięcie wskazówek i odpowiedzi check-in otrzymanych od partnera; (4) zamknięcie skrzynki pary na relayu i zniszczenie klucza pary. Oboje zachowują kopie wspólnych obowiązków i rzeczy do pamiętania, oznaczone jako prywatne (A13). Partner dostaje neutralną informację „Para została rozłączona”. |
| FR-PAIR-08 | MUST | Ponowne połączenie tych samych osób to nowy proces: nowe klucze i zgody od nowa. |
| FR-PAIR-09 | MUST | Konto może należeć tylko do jednej pary (A9). Osoba w parze nie może utworzyć ani przyjąć zaproszenia. |

Kryteria akceptacji:
- **FR-PAIR-01:** Gdy zaproszenie zostało już użyte albo minęły 24 h, wtedy próba jego użycia kończy się komunikatem „Zaproszenie wygasło”, a relay nie łączy kont.
- **FR-PAIR-02:** Zakładając połączenie przez link, gdy relay podmieni klucz publiczny, wtedy kody bezpieczeństwa na telefonach się różnią, a synchronizacja nie rusza, dopóki obie osoby nie potwierdzą zgodności kodów.
- **FR-PAIR-03:** Zakładając świeżo sparowaną parę, gdy osoba z cyklem nie włączy `CYCLE_HINTS`, wtedy na telefon partnera nie trafia żadna koperta z tej kategorii (weryfikacja w logach testowych klienta).
- **FR-PAIR-04:** Gdy osoba zamknie pytanie bez wyboru, wtedy wszystkie wcześniejsze pozycje zostają prywatne.
- **FR-PAIR-05:** Zakładając włączone `CHECKIN`, gdy osoba je wyłączy, wtedy po synchronizacji na telefonie partnera nie ma jej odpowiedzi check-in, a partner widzi „Check-in wyłączony”, bez powiadomienia.
- **FR-PAIR-06:** Zakładając aktywną pauzę, gdy partner otwiera ekran Dziś, wtedy widzi ten sam stan co w dniu, w którym wskazówka nie powstała, i nie dostaje żadnego powiadomienia.
- **FR-PAIR-07:** Zakładając, że telefon partnera jest offline, gdy osoba rozłączy parę, wtedy z jej telefonu od razu znikają dane otrzymane od partnera, a polecenie usunięcia czeka na relayu do 30 dni; po jego odebraniu telefon partnera usuwa wskazówki i odpowiedzi check-in tej osoby.
- **FR-PAIR-08:** Gdy ta sama para łączy się ponownie, wtedy żadnej dawnej koperty nie da się odszyfrować nowym kluczem, a wszystkie zgody mają stany domyślne.
- **FR-PAIR-09:** Zakładając osobę w parze, gdy skanuje inne zaproszenie, wtedy widzi „Najpierw rozłącz obecną parę”, a relay nie dostaje żądania połączenia.

### 5.3 Cykl i wskazówki dla partnera (FR-CYC)

Historie użytkownika:
- Jako osoba z cyklem chcę rozumieć, co może się ze mną dziać w danej fazie i jak może to wpływać na moje zachowanie.
- Jako osoba z cyklem chcę, żeby partner wiedział, jak mnie wspierać, bez pokazywania mu moich danych.
- Jako partner chcę jedną konkretną wskazówkę na dziś zamiast zgadywania.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-CYC-01 | MUST | Włączenie panelu: data początku ostatniej miesiączki, typowa długość cyklu (domyślnie 28, zakres 21–45 dni) i miesiączki (domyślnie 5, zakres 2–10 dni). Opcja „nie wiem” zostawia wartości domyślne z niską pewnością prognozy. |
| FR-CYC-02 | MUST | Kalendarz: zapis początku i końca miesiączki, prognoza kolejnej miesiączki i faz z zakresem niepewności (§7.7). Prognoza jest zawsze oznaczona jako szacunek. |
| FR-CYC-03 | MUST NOT | Aplikacja nie pokazuje „dni płodnych”, „dni bezpiecznych” ani prawdopodobieństwa zajścia w ciążę i nie sugeruje użycia do antykoncepcji (napięcie 3, MDR). |
| FR-CYC-04 | MUST | Opis bieżącej fazy dla osoby z cyklem: co może się dziać z energią, nastrojem, ochotą i napięciem oraz jak może to wpływać na zachowanie; język „może”, treści z biblioteki (§8). |
| FR-CYC-05 | MUST | Wpis samopoczucia w ≤ 15 s: energia, nastrój, napięcie (1–5), ochota (opcjonalnie), objawy (tagi), notatka. Wpisy są zawsze prywatne. Przypomnienie o wpisie jest domyślnie wyłączone (ZP-2, bez „pracy domowej”). |
| FR-CYC-06 | MUST | Osoba z cyklem widzi dokładnie te wskazówki, które dostaje partner: dzisiejszą, zaplanowane na 2 kolejne dni i historię 14 dni 💡. |
| FR-CYC-07 | SHOULD | Osoba z cyklem może pominąć dzisiejszą wskazówkę albo wybrać inną spośród 3 kandydatów. |
| FR-CYC-08 | MUST | Silnik wskazówek działa wyłącznie na telefonie osoby z cyklem ✅ (§7.6). Bierze pod uwagę fazę, wpisy samopoczucia z ostatnich 3 dni i własny check-in; wpisy mają pierwszeństwo przed kalendarzem ✅. Generuje najwyżej jedną wskazówkę na dzień, na 3 dni do przodu, i przelicza przyszłe wskazówki po każdym nowym wpisie. |
| FR-CYC-09 | MUST | Do partnera trafia tylko gotowy tekst wskazówki i jej kategoria. Tekst nie zdradza fazy, dat, objawów ani wartości z wpisów ✅. |
| FR-CYC-10 | MUST NOT | Wskazówki nie dotyczą seksu i nie sugerują, że dzień jest „dobry na” bliskość fizyczną 💡 (ZP-5). Formuła: „co możesz dziś dla niej/niego zrobić” (odciążenie, czułość, uwaga). |
| FR-CYC-11 | MUST | Partner widzi wskazówkę dnia na ekranie Dziś i może zareagować „zrobione” albo „nie dziś”. Reakcja zostaje na jego telefonie (ZP-2). |
| FR-CYC-12 | SHOULD | Co 2 tygodnie osoba z cyklem dostaje 2 pytania: czy wskazówki były trafne i czy były nienachalne (1–5) (§10). |
| FR-CYC-13 | MUST | Wyłączenie panelu usuwa lokalnie dane cyklu (po potwierdzeniu) i wysyła polecenie usunięcia wskazówek z telefonu partnera. |
| FR-CYC-14 | MUST | Gdy w parze obie osoby mają cykl, każda ma własny panel, własny silnik i własne zgody, a każda dostaje wskazówki od drugiej niezależnie (napięcie 5). |
| FR-CYC-15 | MUST | Komunikat „to nie jest metoda antykoncepcji ani narzędzie medyczne” jest dostępny z panelu w każdej chwili. |

Kryteria akceptacji:
- **FR-CYC-01:** Gdy osoba wybierze „nie wiem”, wtedy prognoza używa 28 i 5 dni i pokazuje dopisek „mała pewność”.
- **FR-CYC-02:** Zakładając co najmniej 3 zapisane pełne cykle, gdy osoba zapisze nową miesiączkę, wtedy prognoza przelicza się ze średniej z maksymalnie 6 ostatnich cykli.
- **FR-CYC-03:** Test treści w CI nie znajduje w tekstach interfejsu ani w bibliotece fraz z listy medycznej (np. „dni płodne”, „bezpieczne dni”); słowo „antykoncepcja” występuje tylko w komunikacie z FR-CYC-15.
- **FR-CYC-04:** Każda faza ma opis w bibliotece z oznaczonym statusem przeglądu.
- **FR-CYC-05:** W teście z użytkownikami mediana czasu wpisu ≤ 15 s; wpis nigdy nie trafia do kolejki wysyłki.
- **FR-CYC-06:** Zakładając włączone `CYCLE_HINTS`, wskazówka na dany dzień ma na obu telefonach ten sam `id` i ten sam tekst.
- **FR-CYC-07:** Gdy osoba pominie wskazówkę, wtedy partner widzi „Dziś brak wskazówki”, tak jak przy pauzie.
- **FR-CYC-08:** Zakładając fazę folikularną i wpis z energią 1, gdy silnik generuje wskazówkę, wtedy wybiera kategorię `relief` albo `space`. Zakładając, że telefon osoby z cyklem jest offline przez 2 dni, partner nadal ma wskazówki na te dni.
- **FR-CYC-09:** Test treści w CI: żaden szablon wskazówki nie zawiera słów z listy ujawniającej (np. „okres”, „miesiączka”, „faza”, „owulacja”, „PMS”, „hormony”).
- **FR-CYC-10:** Test treści w CI: żaden szablon nie zawiera słów z listy seksualnej; przed udostępnieniem poza testy każdy szablon ma przegląd specjalisty (§8).
- **FR-CYC-11:** Po reakcji partnera w kolejce wysyłki nie pojawia się żadna koperta.
- **FR-CYC-12:** Ankieta pojawia się najwyżej raz na 14 dni i można ją zamknąć bez odpowiedzi.
- **FR-CYC-13:** Po wyłączeniu panelu i potwierdzeniu w bazie lokalnej nie ma rekordów `CycleProfile`, `PeriodLog` ani `WellbeingEntry`, a telefon partnera po synchronizacji nie ma wskazówek tej osoby.
- **FR-CYC-14:** Zakładając dwie osoby z cyklem, każda widzi na ekranie Dziś wskazówkę od drugiej i podgląd wskazówki, którą sama wysyła.
- **FR-CYC-15:** Komunikat jest osiągalny jednym dotknięciem z każdego ekranu panelu.

### 5.4 Check-in tygodniowy (FR-CHK)

Historie użytkownika:
- Jako każda z osób chcę raz w tygodniu w 2 minuty powiedzieć, jak się mam i czego potrzebuję.
- Jako każda z osób chcę zobaczyć odpowiedzi partnera dopiero po swoich, żeby się do nich nie dopasowywać.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-CHK-01 | MUST | Para ma wspólny dzień i godzinę check-inu (domyślnie niedziela 19:00, N-4); każda osoba może je zmienić. Check-in tygodnia otwiera się w ustalonym dniu i trwa do otwarcia następnego. |
| FR-CHK-02 | MUST | Pytania: nastrój (1–5), energia (1–5), bliskość („jak blisko czuję się z Tobą w tym tygodniu”, 1–5), „potrzebuję…” (jedno zdanie do 140 znaków, opcjonalne, z podpowiedziami). W MVP bez dodatkowych pytań (ZP-3). |
| FR-CHK-03 | MUST | Odpowiedzi są widoczne dla partnera dopiero, gdy oboje wypełnią ✅. Zapieczętowanie jest kryptograficzne, nie tylko w interfejsie (§7.4). |
| FR-CHK-04 | MUST | Autor może edytować odpowiedzi do chwili, gdy oboje wypełnią; potem są tylko do odczytu. |
| FR-CHK-05 | MUST | Po odsłonięciu oboje widzą odpowiedzi obok siebie, bez ocen, porównań i komentarzy aplikacji. |
| FR-CHK-06 | MUST | Jeśli check-in nie zostanie odsłonięty do końca okna, odpowiedzi osoby, która wypełniła, pozostają widoczne tylko dla niej (A14). Partner nie dowiaduje się, że druga osoba wypełniła (ZP-2). |
| FR-CHK-07 | MUST | Przypomnienie lokalne w dniu check-inu, osobne dla każdej osoby, bez wzmianki o partnerze. Jedno ponowne przypomnienie po 24 h, jeśli osoba nie wypełniła; potem cisza. |
| FR-CHK-08 | MUST | Własny check-in osoby z cyklem zasila silnik wskazówek (energia i „potrzebuję”) ✅. Check-in partnera nie zasila wskazówek w MVP (A3). |
| FR-CHK-09 | SHOULD | Historia check-inów i prosty trend z 8 tygodni (planowane jako premium, A6). |

Kryteria akceptacji:
- **FR-CHK-01:** Gdy jedna osoba zmieni dzień check-inu, wtedy po synchronizacji obie mają ten sam dzień.
- **FR-CHK-02:** W teście z użytkownikami mediana czasu wypełnienia ≤ 2 min.
- **FR-CHK-03:** Zakładając, że A wypełniła, a B nie, gdy test odczyta bazę telefonu B, wtedy odpowiedzi A są tam tylko zaszyfrowane kluczem, którego B jeszcze nie ma.
- **FR-CHK-04:** Gdy oboje wypełnili, wtedy przycisk edycji jest niedostępny, a próba zmiany rekordu w warstwie domeny kończy się błędem.
- **FR-CHK-05:** Ekran wyników nie zawiera sum, różnic ani kolorów oceniających wartości.
- **FR-CHK-06:** Zakładając, że B nie wypełnił do końca okna, gdy otwiera się kolejny check-in, wtedy klucz A nie zostaje wysłany, a zapieczętowane odpowiedzi A znikają z telefonu B.
- **FR-CHK-07:** Treść i termin przypomnienia nie zależą od tego, czy partner wypełnił.
- **FR-CHK-08:** Zakładając check-in osoby z cyklem z energią 1, wtedy wskazówki na kolejne dni należą do kategorii `relief` albo `space`.
- **FR-CHK-09:** Wykres pokazuje tylko własne odpowiedzi i odsłonięte odpowiedzi partnera.

### 5.5 Planer obowiązków (FR-CHR)

Historie użytkownika:
- Jako każda z osób chcę widzieć stałe i okazjonalne obowiązki w jednym miejscu i wiedzieć, kto za co odpowiada.
- Jako osoba z przypisanym obowiązkiem chcę dostać przypomnienie i móc oddać zadanie, gdy nie dam rady, bez tłumaczenia się.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-CHR-01 | MUST | Dodanie obowiązku: tytuł (do 80 znaków); rodzaj: stały (codziennie, co N dni, w wybrane dni tygodnia, co miesiąc w dniu X) albo okazjonalny (z terminem lub bez); odpowiedzialny (ja, partner, oboje, na zmianę, ktokolwiek); przypomnienie (godzina, opcjonalne); notatka; widoczność (wspólny albo prywatny, bez pary zawsze prywatny). |
| FR-CHR-02 | MUST | Widoki: Dziś, Tydzień, Wszystkie; filtr: moje, partnera, wspólne. |
| FR-CHR-03 | MUST | Odhaczenie przez dowolną osobę zapisuje, kto i kiedy zrobił. W obowiązkach stałych odhacza się konkretne wystąpienie; następne wynika z reguły powtarzania. |
| FR-CHR-04 | MUST | Osoba przypisana może oddać obowiązek („nie dam rady”) jednym ruchem, bez podawania powodu. Obowiązek przechodzi na „ktokolwiek” i pojawia się w widoku Dziś obojga, bez powiadomienia o oddaniu (ZP-2). |
| FR-CHR-05 | MUST | Przypomnienia lokalne dostaje tylko osoba odpowiedzialna; przy „oboje” i „ktokolwiek” oboje; przy „na zmianę” osoba z bieżącego wystąpienia. |
| FR-CHR-06 | MUST | Edycja i usuwanie przez obie osoby; konflikty według §7.5 (A4). Usunięcie można cofnąć przez 10 s. |
| FR-CHR-07 | MUST NOT | Aplikacja nie wyróżnia zaległych obowiązków partnera kolorem ostrzegawczym, nie powiadamia o cudzych zaległościach i nie tworzy rankingów (ZP-2). Zaległe pozycje są neutralnie widoczne w sekcji „Do zrobienia”. |
| FR-CHR-08 | SHOULD | Obowiązek można powiązać z rzeczą do pamiętania (§5.6) i odwrotnie. |
| FR-CHR-09 | SHOULD | Podsumowanie tygodnia w neutralnym tonie: ile rzeczy zrobiliście razem i jak rozłożyła się praca, bez ocen. |
| FR-CHR-10 | SHOULD | Zestaw startowy typowych obowiązków (dom, dzieci, zakupy, rachunki) do szybkiego dodania, dobrany do odpowiedzi z onboardingu. |

Kryteria akceptacji:
- **FR-CHR-01:** Gdy osoba dodaje obowiązek „w poniedziałki i czwartki”, wtedy widok Tydzień pokazuje dwa wystąpienia, a każde da się odhaczyć osobno.
- **FR-CHR-02:** Filtr „partnera” pokazuje obowiązki przypisane partnerowi oraz te „na zmianę”, których bieżące wystąpienie należy do partnera.
- **FR-CHR-03:** Zakładając, że oboje odhaczą to samo wystąpienie offline, po synchronizacji istnieje jedno odhaczenie, to z wcześniejszym znacznikiem czasu.
- **FR-CHR-04:** Gdy osoba odda obowiązek, wtedy partner nie dostaje powiadomienia, a obowiązek jest w jego widoku Dziś z odpowiedzialnym „ktokolwiek”.
- **FR-CHR-05:** Przypomnienie pojawia się tylko na telefonie osoby odpowiedzialnej, także gdy telefon jest offline.
- **FR-CHR-06:** Zakładając, że offline A zmienia tytuł, a B termin tego samego obowiązku, po synchronizacji obowiązek ma tytuł od A i termin od B.
- **FR-CHR-07:** Rejestr typów powiadomień (§5.7) nie zawiera typu dotyczącego zaległości partnera.
- **FR-CHR-08:** „Zamień w obowiązek” na rzeczy do pamiętania tworzy obowiązek z tym samym tytułem i powiązaniem w obie strony.
- **FR-CHR-09:** Test treści: podsumowanie nie zawiera porównań typu „robisz mniej”.
- **FR-CHR-10:** Dodanie pozycji z zestawu startowego wymaga jednego dotknięcia.

### 5.6 Obciążenie mentalne (FR-MNT)

Historie użytkownika:
- Jako osoba, która nosi w głowie większość spraw rodziny, chcę, żeby ta niewidoczna praca stała się widoczna dla nas obojga.
- Jako partner chcę wiedzieć, co mogę przejąć, i przejąć to jednym ruchem.

| ID | Prio | Wymaganie |
|---|---|---|
| FR-MNT-01 | MUST | Dodanie rzeczy do pamiętania: tytuł, kategoria (dzieci, dom, finanse, zdrowie, rodzina i znajomi, inne), kto nosi w głowie (ja, partner, oboje), waga (mała 1, średnia 2, duża 3; domyślnie średnia), opcjonalny termin. |
| FR-MNT-02 | MUST | „Przejmuję”: partner przejmuje rzecz jednym ruchem; poprzedni nosiciel dostaje powiadomienie „[imię] przejął/przejęła: [tytuł]” zgodnie z ustawieniem dyskrecji. |
| FR-MNT-03 | SHOULD | „Poproś o przejęcie”: partner może przyjąć albo odmówić bez podawania powodu; po odmowie prośba po prostu znika, bez powiadomienia (ZP-2). |
| FR-MNT-04 | MUST | Podział w procentach: udział każdej osoby w otwartych rzeczach, ważony wagą; „oboje” liczy się po połowie. Pokazywany jako „jak to się rozkłada między Wami”, bez ocen. |
| FR-MNT-05 | MUST | Trend: tygodniowa migawka podziału (stan na koniec tygodnia ISO), wykres do 12 tygodni. Migawka jest liczona z historii `CarrierChange`, więc po synchronizacji oba telefony pokazują to samo. |
| FR-MNT-06 | MUST | „Załatwione” przenosi rzecz do archiwum; archiwum nie liczy się do bieżącego podziału. |
| FR-MNT-07 | SHOULD | Tryb „zrzut głowy”: szybkie wpisywanie wielu rzeczy pod rząd, proponowany jako ćwiczenie w pierwszym tygodniu po sparowaniu. |
| FR-MNT-08 | SHOULD | „Zamień w obowiązek” tworzy powiązany obowiązek w planerze (FR-CHR-08). |

Kryteria akceptacji:
- **FR-MNT-01:** Dodanie rzeczy z domyślną kategorią i wagą wymaga wpisania tytułu i najwyżej 2 dotknięć.
- **FR-MNT-02:** Gdy B przejmuje rzecz od A, wtedy po synchronizacji u obojga nosicielem jest B, a A dostaje jedno powiadomienie.
- **FR-MNT-03:** Gdy partner odmówi, wtedy rzecz zostaje u proszącego, a prośba znika z obu telefonów bez powiadomienia.
- **FR-MNT-04:** Zakładając otwarte rzeczy: A nosi dwie średnie, B jedną dużą, a jedną małą noszą oboje, wtedy podział wynosi A 56%, B 44% (A: 2 + 2 + 0,5 = 4,5; B: 3 + 0,5 = 3,5; razem 8).
- **FR-MNT-05:** Zakładając zmianę nosiciela dokonaną przed końcem tygodnia, a zsynchronizowaną 2 dni później, wtedy po synchronizacji migawka tamtego tygodnia jest na obu telefonach taka sama.
- **FR-MNT-06:** Od chwili zamknięcia rzecz nie wpływa na podział bieżącego tygodnia.
- **FR-MNT-07:** W trybie zrzutu każde zatwierdzenie zapisuje rzecz i czyści pole.
- **FR-MNT-08:** Jak FR-CHR-08.

### 5.7 Powiadomienia (FR-NOT)

| ID | Prio | Wymaganie |
|---|---|---|
| FR-NOT-01 | MUST | Wszystkie widoczne powiadomienia tworzy telefon lokalnie 💡. |
| FR-NOT-02 | MUST | Relay wysyła przez APNs i FCM wyłącznie push bez treści, który budzi aplikację do pobrania kopert (A7). Payload nie zawiera danych użytkownika ani typu zdarzenia. |
| FR-NOT-03 | SHOULD | iOS: rozszerzenie Notification Service Extension pobiera i odszyfrowuje kopertę i tworzy treść lokalnie; gdy się nie uda, powiadomienie ma stały ogólny tekst „Nowe informacje w aplikacji” (N-2). |
| FR-NOT-04 | MUST | Tryb dyskretny domyślnie włączony 💡: ekran blokady pokazuje tylko „Parapka: masz nowe przypomnienie”, bez imion i treści. Tryb pełny można włączyć w ustawieniach. |
| FR-NOT-05 | MUST | Typy i stany domyślne: przypomnienie obowiązku (wł., dla odpowiedzialnego), check-in (wł.), wskazówka dnia dla partnera (wł., 8:00, do zmiany), wpis samopoczucia (wył.), „partner przejął rzecz” (wł.), „wyniki check-inu gotowe” (wł.), połączenie i rozłączenie pary (wł., neutralnie). Każdy typ można wyłączyć. |
| FR-NOT-06 | MUST NOT | Brak powiadomień o: pauzie partnera, zmianie zgód partnera, odmowie przejęcia, oddaniu obowiązku, zaległościach partnera i wypełnieniu check-inu przez partnera przed odsłonięciem (ZP-2, ZP-4). |
| FR-NOT-07 | MUST | Godziny ciszy domyślnie 22:00–7:00; powiadomienia z tego czasu przesuwają się na 7:00. |

Kryteria akceptacji:
- **FR-NOT-01, FR-NOT-02:** Payload pushu przechwycony w teście zawiera tylko stały znacznik synchronizacji.
- **FR-NOT-03:** Gdy rozszerzenie nie odszyfruje koperty w limicie czasu systemu, wtedy powiadomienie ma stały tekst.
- **FR-NOT-04:** Przy ustawieniach domyślnych ekran blokady nie pokazuje treści ani imion.
- **FR-NOT-05:** Każdy typ ma osobny przełącznik, a stany po instalacji są zgodne z tabelą.
- **FR-NOT-06:** Test jednostkowy rejestru typów powiadomień: rejestr nie zawiera zdarzeń z listy.
- **FR-NOT-07:** Przypomnienie zaplanowane na 23:00 pojawia się o 7:00.

### 5.8 Bezpieczeństwo i kontrola danych (FR-SEC)

| ID | Prio | Wymaganie |
|---|---|---|
| FR-SEC-01 | MUST | Blokada aplikacji 💡: 6-cyfrowy PIN albo biometria; blokada po przejściu w tło natychmiast (domyślnie), po 1 min albo po 5 min. Po 5 błędnych próbach PIN-u rosnące opóźnienie. |
| FR-SEC-02 | MUST | Zasłonięcie zawartości w przełączniku aplikacji; na Androidzie opcjonalna blokada zrzutów ekranu (`FLAG_SECURE`). |
| FR-SEC-03 | MUST NOT | Brak śledzenia lokalizacji, statusu „online”, potwierdzeń odczytu i historii aktywności partnera 💡 (zasada 6). |
| FR-SEC-04 | MUST | „Usuń wszystkie moje dane”: rozłączenie pary według FR-PAIR-07, usunięcie urządzenia na relayu, wyczyszczenie bazy i kluczy z telefonu. |
| FR-SEC-05 | SHOULD | Eksport własnych danych do pliku JSON (RODO art. 20) przez systemowe okno udostępniania. |
| FR-SEC-06 | MUST | Zapomniany PIN: odblokowanie biometrią, jeśli jest włączona; w przeciwnym razie tylko reset aplikacji, czyli utrata danych prywatnych. Wspólne obowiązki i rzeczy do pamiętania partner może udostępnić ponownie po nowym połączeniu (FR-PAIR-04) (A20). |
| FR-SEC-07 | MUST | Aplikacja tylko dla osób pełnoletnich: potwierdzenie w onboardingu i oznaczenie wieku w sklepach (A18). |

Kryteria akceptacji:
- **FR-SEC-01:** Gdy aplikacja wraca z tła przy ustawieniu „natychmiast”, wtedy ekran blokady pojawia się przed jakąkolwiek treścią.
- **FR-SEC-02:** Podgląd aplikacji w przełączniku pokazuje zasłonę, nie treść.
- **FR-SEC-03:** Model danych i API relaya nie mają pól lokalizacji, statusu obecności ani potwierdzeń odczytu.
- **FR-SEC-04:** Po operacji baza lokalna i Keychain/Keystore nie zawierają danych aplikacji, a relay zwraca 404 dla tego urządzenia.
- **FR-SEC-05:** Plik zawiera wszystkie encje, których osoba jest właścicielem, oraz wspólne obowiązki i rzeczy do pamiętania; nie zawiera wskazówek ani check-inów partnera.
- **FR-SEC-06:** Reset wymaga dwukrotnego potwierdzenia i jasno mówi, co zostanie utracone.
- **FR-SEC-07:** Bez potwierdzenia pełnoletności onboarding nie przechodzi dalej.

## 6. Wymagania niefunkcjonalne

### 6.1 Prywatność i bezpieczeństwo (NFR-PRV)

| ID | Prio | Wymaganie |
|---|---|---|
| NFR-PRV-01 | MUST | Dane lokalne w zaszyfrowanej bazie SQLite (SQLCipher 💡). Klucz bazy to losowe 256 bitów w Keychain (iOS, dostęp `AfterFirstUnlockThisDeviceOnly`, żeby działała synchronizacja w tle) albo w Android Keystore. |
| NFR-PRV-02 | MUST | Wyłączone systemowe kopie zapasowe danych aplikacji (Android `allowBackup="false"`, iOS wykluczenie plików z kopii iCloud), żeby nie dawać złudzenia backupu (A5). |
| NFR-PRV-03 | MUST | Relay zna wyłącznie losowe identyfikatory skrzynek i urządzeń, klucze publiczne, szyfrogramy, ich rozmiar i czas oraz tokeny push. Nie zna imion, e-maili, numerów telefonu ani treści (A10). |
| NFR-PRV-04 | MUST | Brak SDK reklamowych i analitycznych; w MVP brak zewnętrznego zgłaszania awarii (A17). Błędy trafiają do lokalnego dziennika bez treści użytkownika, który użytkownik może wysłać ręcznie. |
| NFR-PRV-05 | MUST | Logi relaya bez treści kopert; adresy IP i logi techniczne przechowywane najwyżej 14 dni (A21). |
| NFR-PRV-06 | MUST | Kryptografia tylko z gotowej biblioteki (libsodium 💡), bez własnych algorytmów (intent §9, ryzyko 4). |
| NFR-PRV-07 | MUST | Połączenia z relayem przez TLS 1.2+; mimo to relay jest w modelu zagrożeń traktowany jako niezaufany. |

### 6.2 Synchronizacja (NFR-SYNC)

| ID | Prio | Wymaganie |
|---|---|---|
| NFR-SYNC-01 | MUST | Offline-first: każda funkcja działa bez sieci, a zmiany czekają w kolejce wysyłki. |
| NFR-SYNC-02 | MUST | Relay przechowuje niedostarczone koperty najwyżej 30 dni, a po potwierdzeniu odbioru usuwa je od razu (A21). |
| NFR-SYNC-03 | MUST | Zastosowanie koperty jest idempotentne (deduplikacja po `envelopeId`), a dla danych z §7.5 wynik nie zależy od kolejności dostarczenia. |
| NFR-SYNC-04 | SHOULD | Gdy oba telefony są online i push działa, zmiana jest widoczna u partnera w ≤ 10 s (p95). |
| NFR-SYNC-05 | MUST | Koperta ma wersję schematu; telefon ze starszą wersją aplikacji zachowuje nieznane pola i prosi o aktualizację, zamiast je gubić. |

### 6.3 Użyteczność i dostępność (NFR-UX)

| ID | Prio | Wymaganie |
|---|---|---|
| NFR-UX-01 | MUST | Mediana w testach z użytkownikami: check-in ≤ 2 min, wpis samopoczucia ≤ 15 s, dodanie obowiązku ≤ 20 s. |
| NFR-UX-02 | MUST | Od odblokowania do ekranu Dziś ≤ 2 s na telefonie średniej klasy sprzed 3 lat. |
| NFR-UX-03 | MUST | Dostępność według WCAG 2.1 AA w zakresie aplikacji mobilnych: kontrast, skalowanie czcionek systemowych, etykiety dla VoiceOver i TalkBack, cele dotyku ≥ 44 pt. |
| NFR-UX-04 | MUST | Interfejs po polsku; wszystkie teksty w plikach tłumaczeń, gotowe na angielski 💡. |
| NFR-UX-05 | MUST | Poprawne formy gramatyczne według formy wybranej przez każdą osobę (A15), np. „przejął/przejęła”, „zaproponuj jej/jemu”; tam, gdzie się da, sformułowania neutralne. |
| NFR-UX-06 | MUST | Ton ciepły i bez ocen, bez presji ani pośpiechu; „nie” zawsze dostępne (ZP-2). |

### 6.4 Platformy (NFR-PLAT)

| ID | Prio | Wymaganie |
|---|---|---|
| NFR-PLAT-01 | MUST | iOS 16+ i Android 10+, tylko telefony, orientacja pionowa (A16). |
| NFR-PLAT-02 | MUST | Jedno urządzenie na konto (A9). |

### 6.5 Jakość (NFR-QA)

| ID | Prio | Wymaganie |
|---|---|---|
| NFR-QA-01 | MUST | Testy jednostkowe: prognoza cyklu, silnik wskazówek, rozwiązywanie konfliktów, koperty (wektory testowe szyfrowania), podział obciążenia mentalnego, zapieczętowanie check-inu. |
| NFR-QA-02 | MUST | Testy treści w CI: listy zakazanych fraz (FR-CYC-03, FR-CYC-09, FR-CYC-10), długość wskazówek, obecność wszystkich form gramatycznych. |
| NFR-QA-03 | SHOULD | Testy end-to-end na dwóch emulatorach z lokalnym relayem: parowanie, check-in z odsłonięciem, konflikt edycji, rozłączenie. |

## 7. Architektura

### 7.1 Komponenty

```
Telefon A                                                       Telefon B
[ui] -> [domain] -> [data: SQLCipher]           [data: SQLCipher] <- [domain] <- [ui]
            |                                           ^
         [sync] --koperta (szyfrogram)--> [relay] --koperta--> [sync]
                                             |
                                             +--> APNs / FCM: push bez treści --> Telefon B
```

- **Aplikacja mobilna:** React Native ✅ z Expo i TypeScript 💡. Moduły natywne (SQLCipher, libsodium, Notification Service Extension) wymagają development builda (`expo prebuild`); Expo Go nie wystarczy.
- **Relay:** mały serwis HTTP i WebSocket z bazą kopert i skrzynek, hostowany w UE (A21). Technologia otwarta (N-1).
- **Push:** APNs i FCM, wyłącznie push bez treści (FR-NOT-02).

### 7.2 Warstwy aplikacji

| Warstwa | Odpowiedzialność |
|---|---|
| `ui` | Ekrany i nawigacja, bez logiki domenowej. |
| `domain` | Czysty TypeScript bez zależności od React Native: prognoza cyklu, silnik wskazówek, check-in, planer, obciążenie mentalne. |
| `data` | Repozytoria nad SQLCipher, migracje schematu. |
| `sync` | Kolejka wysyłki i odbioru, HLC, scalanie zmian. Osobny handler dla każdego typu encji, więc nowy panel dodaje handler zamiast rozbudowywać `switch`. |
| `crypto` | Jedyne miejsce użycia libsodium: klucze, koperty, kod bezpieczeństwa, zapieczętowanie check-inu. |
| `notifications` | Planowanie powiadomień lokalnych, tryb dyskretny, godziny ciszy. |

Zależności (`Clock`, `KeyStore`, `RelayClient`, `NotificationScheduler`) są wstrzykiwane przez interfejsy, żeby `domain` i `sync` dało się testować bez telefonu.

Biblioteki do weryfikacji przy konfiguracji projektu: `expo-sqlite` z obsługą SQLCipher albo `op-sqlite`, `react-native-libsodium`, `expo-secure-store`, `expo-notifications`, `expo-local-authentication`, `expo-camera` (QR).

### 7.3 Tożsamość, klucze i parowanie

1. **Pierwsze uruchomienie:** telefon generuje parę kluczy podpisu (Ed25519) i parę kluczy uzgadniania (X25519); klucze prywatne trafiają do Keychain/Keystore. Rejestracja urządzenia na relayu przesyła tylko klucz publiczny podpisu; kolejne żądania są uwierzytelniane podpisem wyzwania serwera, bez haseł (A10).
2. **Zaproszenie (A):** relay tworzy `invitationId`, jednorazowy i ważny 24 h. Kod QR i link zawierają wersję protokołu, `invitationId`, klucze publiczne A i losowy 256-bitowy sekret. Sekret nie trafia na relay w jawnej postaci.
3. **Przyjęcie (B):** B wysyła na relay swoje klucze publiczne zaszyfrowane kluczem wyprowadzonym z sekretu, więc relay nie może ich podmienić bez znajomości sekretu.
4. **Klucze pary:** oba telefony wyprowadzają kierunkowe klucze sesji (`crypto_kx`) i 6-cyfrowy kod bezpieczeństwa ze skrótu obu kluczy publicznych. Kod chroni połączenie przez link, bo link mógł przejść przez komunikator, który zna sekret (FR-PAIR-02).
5. **Skrzynka pary:** relay tworzy losowy `pairMailboxId` i przypisuje do niej oba urządzenia.
6. **Rozłączenie:** telefon wysyła ostatnią kopertę z poleceniem usunięcia i prosi relay o zamknięcie skrzynki. Relay trzyma skrzynkę w stanie „zamykana” tylko do dostarczenia tej koperty, najdłużej 30 dni, potem ją usuwa. Telefon rozłączający niszczy klucze pary od razu, drugi telefon po odebraniu polecenia.
7. **Bez forward secrecy w MVP:** klucz pary jest stały do rozłączenia (R-2). Po MVP: rotacja kluczy, np. double ratchet.

### 7.4 Koperty i protokół relaya

Koperta (pola jawne dla relaya):

```json
{
  "envelopeId": "uuidv7",
  "pairMailboxId": "random-id",
  "senderDeviceId": "random-id",
  "protocolVersion": 1,
  "nonce": "base64",
  "ciphertext": "base64"
}
```

Treść po odszyfrowaniu (XChaCha20-Poly1305, kierunkowy klucz pary):

```json
{
  "schemaVersion": 1,
  "changes": [
    { "entity": "Chore", "id": "uuidv7", "op": "upsert",
      "fields": { "title": { "value": "Odkurzanie", "hlc": "<hlc>" } } },
    { "entity": "Hint", "id": "uuidv7", "op": "delete", "hlc": "<hlc>" },
    { "entity": "Hint", "id": "uuidv7", "op": "restore", "hlc": "<hlc>" }
  ]
}
```

Operacja `delete` zostawia tombstone. Edycja pól (`upsert`) nie przywraca usuniętej encji; cofa usunięcie tylko jawna operacja `restore`, której `hlc` jest późniejszy niż `hlc` tombstone (§7.5).

**Kodowania:** pola `nonce` i `ciphertext` koperty są w standardowym base64 z dopełnieniem (`=`). Klucz publiczny `signingPublicKey` przy rejestracji (`POST /v1/devices`, dokładnie 32 bajty) i podpis w nagłówku `X-Signature` (64 bajty) są w base64url bez dopełnienia (RFC 4648 §5), w kanonicznej postaci, jak klucze z `packages/crypto` i w ładunku zaproszenia (kod QR i link, §7.3); standardowe base64 (`+`, `/`, `=`) jest odrzucane. `nonce` wyzwania jest w base64url.

Endpointy relaya (szkic):

| Metoda | Ścieżka | Cel |
|---|---|---|
| POST | `/v1/devices` | Rejestracja urządzenia (klucz publiczny podpisu). |
| POST | `/v1/devices/{id}/challenges` | Wydanie jednorazowego wyzwania do podpisu (bez uwierzytelnienia). |
| PUT | `/v1/devices/{id}/push-token` | Token APNs/FCM. |
| DELETE | `/v1/devices/{id}` | Usunięcie urządzenia i wszystkich jego danych. |
| POST | `/v1/invitations` | Utworzenie zaproszenia. |
| POST | `/v1/invitations/{id}/accept` | Przyjęcie zaproszenia i utworzenie skrzynki pary. |
| GET | `/v1/invitations/{id}/keys` | Pobranie przez A zaszyfrowanych kluczy B (po przyjęciu zaproszenia). |
| POST | `/v1/pairs/{id}/envelopes` | Wysłanie koperty. |
| GET | `/v1/pairs/{id}/envelopes?after={cursor}` | Pobranie kopert; przy otwartej aplikacji także przez WebSocket. |
| GET | `/v1/pairs/{id}/ws` | WebSocket: powiadomienie o nowych kopertach przy otwartej aplikacji. |
| POST | `/v1/pairs/{id}/acks` | Potwierdzenie odbioru; relay usuwa potwierdzone koperty. |
| DELETE | `/v1/pairs/{id}` | Zamknięcie skrzynki pary (rozłączenie). |

**Uwierzytelnienie:** urządzenie pobiera wyzwanie (`challengeId`, `nonce`), jednorazowe i ważne 5 minut, i podpisuje kluczem Ed25519 tekst złożony z linii oddzielonych znakiem `\n`: prefiks `parapka-relay-auth-v1`, metoda HTTP, URL żądania, `challengeId`, `nonce` i SHA-256 surowego ciała żądania (szesnastkowo). Żądanie niesie nagłówki `X-Device-Id`, `X-Challenge-Id` i `X-Signature` (podpis w base64url bez dopełnienia). Relay zużywa wyzwanie nawet przy błędnym podpisie; każdy błąd to jednolite 401. Wszystkie endpointy poza rejestracją i wydaniem wyzwania wymagają tego uwierzytelnienia. API `WebSocket` w przeglądarce nie pozwala ustawić nagłówków, więc trasa `/v1/pairs/{id}/ws` przyjmuje też parametry zapytania `deviceId`, `challengeId` i `signature`; podpisywany tekst jest ten sam, a jako URL bierze ścieżkę z zapytaniem bez tych trzech parametrów. Zły albo brakujący podpis kończy się 401 przed upgrade'em, a logi nie zawierają zapytania. Dla przeglądarki relay obsługuje CORS: dozwolone źródła podaje zmienna `RELAY_ALLOWED_ORIGINS` (lista po przecinku; pusta oznacza brak CORS), a odpowiedź na zapytanie wstępne zezwala na metody GET, POST, PUT, DELETE i nagłówki `Content-Type`, `X-Device-Id`, `X-Challenge-Id`, `X-Signature`. Źródło spoza listy nie dostaje nagłówków CORS.

Limity: koperta ≤ 64 KB, limit żądań na urządzenie, TTL niedostarczonych kopert 30 dni.

**Zapieczętowanie check-inu (FR-CHK-03):**
1. A wypełnia check-in. Telefon szyfruje odpowiedzi losowym kluczem `K_A` i wysyła je w kopercie pary jako zapieczętowane. `K_A` zostaje na telefonie A.
2. B wypełnia tak samo, z kluczem `K_B`.
3. Telefon, który ma własne zapieczętowane odpowiedzi i odebrał zapieczętowane odpowiedzi partnera, od razu wysyła swój klucz i blokuje edycję. Gdy oba telefony mają oba klucze, odpowiedzi są odsłonięte.
4. Do chwili, gdy telefon odbierze zapieczętowane odpowiedzi partnera, autor może je edytować; każda edycja to nowa zapieczętowana wersja z nowym kluczem.
5. Jeśli okno się zamknie bez odsłonięcia, klucze nie są wysyłane, a zapieczętowane odpowiedzi partnera są usuwane (A14).

### 7.5 Rozwiązywanie konfliktów (A4)

Każda zmiana ma znacznik Hybrid Logical Clock (HLC), więc rozbieżne zegary telefonów nie decydują o wyniku; remis rozstrzyga `deviceId`.

| Dane | Zasada |
|---|---|
| `Chore`, `MentalLoadItem`, ustawienia pary | Ostatnia zmiana wygrywa, osobno dla każdego pola. |
| Usunięcie `Chore` i `MentalLoadItem` | Tombstone; usunięcie wygrywa z równoległą edycją; przywrócenie to jawna operacja `restore` z późniejszym HLC niż tombstone (§7.4); edycja pól nie przywraca encji. |
| `ChoreCompletion` | Jedno odhaczenie na wystąpienie; przy podwójnym zostaje wcześniejsze. |
| `CarrierChange`, `HandoverRequest` | Tylko dopisywanie; bieżący stan to ostatni wpis według HLC. |
| `CheckIn` | Jeden autor; nowe wersje tylko do zablokowania edycji (§7.4). |
| `Hint` | Jeden autor (generator); nowa wersja dla tej samej daty zastępuje poprzednią. |
| `ConsentGrant`, `Profile` | Jeden autor. |

CRDT nie wchodzi do MVP; ten model nie blokuje późniejszego przejścia.

### 7.6 Silnik wskazówek

- **Wejście:** faza i pewność prognozy, wpisy samopoczucia z ostatnich 3 dni, własny check-in z bieżącego tygodnia, wskazówki z ostatnich 14 dni, forma gramatyczna osoby z cyklem.
- **Reguły jako dane** w bibliotece treści (JSON), żeby autorzy treści mogli je zmieniać bez zmian w kodzie:

  ```json
  { "id": "low-energy-relief", "when": { "energyMax": 2 }, "categories": ["relief", "space"], "priority": 10 }
  ```

- **Wybór:** najpierw reguły oparte na wpisach i check-inie, potem reguły fazowe; szablon losowany z ziarnem dnia, bez powtórzenia tego samego szablonu w ciągu 7 dni.
- **Ochrona przed wnioskowaniem:** kategorie wskazówek nie odpowiadają fazom 1:1, żeby partner nie odgadł fazy z samego wzoru wskazówek (R-1).
- **Generowanie:** na 3 dni do przodu i ponownie po każdym wpisie, check-inie lub zmianie danych cyklu; zmiany trafiają do partnera jako nowe wersje wskazówek.
- **Testy treści w CI:** zakazane frazy (seksualne, ujawniające fazę, medyczne), długość ≤ 120 znaków, obecność wszystkich form gramatycznych.

### 7.7 Prognoza cyklu

- Długość cyklu to średnia z maksymalnie 6 ostatnich pełnych cykli; przy mniej niż 3 cyklach aplikacja używa wartości z konfiguracji.
- Zakres niepewności to ± odchylenie standardowe, nie mniej niż ± 2 dni.
- Fazy (szacunek): miesiączka (zapis albo prognoza); folikularna do początku okna okołoowulacyjnego; okołoowulacyjna wokół dnia „początek następnej miesiączki minus 14 dni” (± 2 dni); lutealna do miesiączki, z okresem przedmiesiączkowym w ostatnich 5 dniach.
- Cykl nieregularny (odchylenie > 7 dni): szerokie zakresy w kalendarzu i większa waga wpisów samopoczucia w silniku wskazówek.
- Algorytm nie służy celom medycznym i nie jest tak opisywany (FR-CYC-03).

## 8. Treści

- **Biblioteka w aplikacji**, wersjonowana (`contentVersion` w każdej wskazówce): opisy faz, szablony wskazówek, reguły silnika, podpowiedzi do „potrzebuję”, zestaw startowy obowiązków, teksty ekranu zgody.
- **Minimalny zakres na start:** opisy 5 faz (z okresem przedmiesiączkowym) i co najmniej 80 szablonów wskazówek (co najmniej 15 na kategorię), we wszystkich formach gramatycznych.
- **Zasady języka:** „może” zamiast pewników; do partnera w drugiej osobie; ≤ 120 znaków; konkretne działanie („Przejmij dziś kolację”), nie ocena; bez seksu, bez nazw faz i objawów, bez twierdzeń medycznych.
- **Weryfikacja:** podczas testów pierwszej pary testowej treści robocze są oznaczone jako „niezweryfikowane”. Przed udostępnieniem komukolwiek innemu: przegląd specjalistów (seksuolog, psycholog, ginekolog 💡; kto, to pytanie 6) i testy z osobami z cyklem jako głównymi odbiorcami (intent §9, ryzyko 1).

## 9. Warunki udostępnienia poza testy (intent §8, napięcie 3)

To nie jest zakres kodu MVP, tylko lista kontrolna przed udostępnieniem aplikacji komukolwiek poza pierwszą parą testową.

- [ ] Wyraźna zgoda (RODO art. 9): ekran zgody z FR-PAIR-03 z zapisem daty i wersji tekstu.
- [ ] Ocena skutków dla ochrony danych (DPIA), obejmująca relay, push i metadane (R-6).
- [ ] Polityka prywatności i rejestr czynności przetwarzania dla relaya.
- [ ] Umowa powierzenia z dostawcą hostingu relaya; analiza przekazywania tokenów push do Apple i Google.
- [ ] Prawo do usunięcia (FR-SEC-04) i do przenoszenia danych (FR-SEC-05).
- [ ] App Store: wytyczne dotyczące danych zdrowotnych i etykiety prywatności. Google Play: deklaracja aplikacji zdrowotnej i sekcja bezpieczeństwa danych.
- [ ] Komunikat „nie jest metodą antykoncepcji ani narzędziem medycznym” i brak funkcji z FR-CYC-03 (MDR).
- [ ] Oznaczenie wieku 18+ (FR-SEC-07).
- [ ] Treści zweryfikowane przez specjalistów (§8).
- [ ] Konsultacja z prawnikiem od ochrony danych 💡.

## 10. Miary sukcesu i sposób pomiaru (intent §11, napięcie 4)

Zasada: bez analityki serwerowej i bez wykorzystywania metadanych relaya do mierzenia aktywności. Relay technicznie widzi ruch kopert, ale specyfikacja zabrania używania go do statystyk.

| Miara 💡 | Próg | Jak mierzymy |
|---|---|---|
| Oboje aktywni po 4 tygodniach | ≥ 50% par | Raport badawczy: liczba dni z otwarciem aplikacji w 4. tygodniu, osobno z każdego telefonu (`LocalActivityLog`). |
| Check-in wypełniany przez oboje | ≥ 60% tygodni | Lokalna historia: tygodnie z odsłonięciem podzielone przez tygodnie od sparowania. |
| Wskazówki trafne i nienachalne | do ustalenia, np. średnia ≥ 4/5 | Ankieta z FR-CYC-12. |
| Zmiana podziału obciążenia mentalnego po 6 tygodniach | mierzalna zmiana | Migawki z FR-MNT-05: tydzień 1 i tydzień 6. |

**Raport badawczy (SHOULD):** ekran, który liczy lokalnie powyższe wskaźniki jako same liczby (bez treści, dat i danych cyklu) i pozwala świadomie wysłać je przez systemowe okno udostępniania, np. e-mailem do zespołu. Dziennik aktywności jest lokalny i nigdy nie trafia do partnera (ZP-4).
- Etap pierwszej pary testowej: rozmowa i ten raport.
- Pilotaż (N-3): ten sam raport co tydzień, za zgodą uczestników.

## 11. Ryzyka specyfikacji (uzupełnienie intent §9)

| ID | Ryzyko | Mitygacja |
|---|---|---|
| R-1 | Partner odgadnie fazę z wzoru wskazówek. | Kategorie nie odpowiadają fazom 1:1 (§7.6); podgląd i pomijanie wskazówek (FR-CYC-06, FR-CYC-07). |
| R-2 | Brak forward secrecy: wyciek klucza pary pozwala odczytać koperty, które jeszcze leżą na relayu. | Usuwanie kopert po potwierdzeniu, TTL 30 dni, klucze w Keychain/Keystore; rotacja kluczy po MVP. |
| R-3 | iOS nie gwarantuje dostarczenia pushy bez treści, np. po wymuszonym zamknięciu aplikacji. | Wskazówki generowane 3 dni naprzód, synchronizacja przy każdym otwarciu, Notification Service Extension (FR-NOT-03). |
| R-4 | Utrata telefonu oznacza utratę danych prywatnych (A5). | Jasny komunikat w onboardingu (FR-ONB-05); wspólne dane zostają u partnera; backup po MVP. |
| R-5 | Usunięcia danych z telefonu partnera nie da się zagwarantować (napięcie 2). | Uczciwy opis na ekranie zgody, polecenie usunięcia, zniszczenie kluczy; surowe dane cyklu nigdy nie opuszczają telefonu. |
| R-6 | Metadane relaya: relay wie, że dwa pseudonimowe urządzenia tworzą parę i kiedy się komunikują. | Brak danych osobowych na relayu, krótka retencja logów, DPIA. |
| R-7 | Moduły natywne (SQLCipher, libsodium, NSE) komplikują projekt Expo i aktualizacje SDK. | Development build od pierwszego dnia; wczesny prototyp parowania i kopert przed budową paneli. |
| R-8 | Treści robocze w fazie testów nie są zweryfikowane. | Oznaczenie „niezweryfikowane” i warunek z §9. |

## 12. Napięcia z intent.md i propozycje

| # | Napięcie | Propozycja w tej specyfikacji | Status |
|---|---|---|---|
| 1 | Powiadomienia tylko lokalne a synchronizacja: bez pushy telefon partnera dowiaduje się o zmianach dopiero po otwarciu aplikacji. | Push bez treści przez relay (A7, FR-NOT-02). Alternatywa: brak pushy i synchronizacja tylko przy otwarciu. Koszt: relay przechowuje tokeny push. | ⚠️ do potwierdzenia |
| 2 | „Rozłączenie usuwa udostępnione dane z telefonu drugiej osoby” (intent §3) da się zrobić tylko w miarę możliwości. | Polecenie usunięcia i zniszczenie kluczy, uczciwie opisane na ekranie zgody (FR-PAIR-03, FR-PAIR-07). | ⚠️ do potwierdzenia |
| 3 | Własność wspólnych danych po rozłączeniu („każdy zachowuje swoje dane”, intent §9). | Oboje zachowują kopie obowiązków i rzeczy do pamiętania; wskazówki i check-iny drugiej osoby są usuwane (A13). | ⚠️ do potwierdzenia |
| 4 | Miary sukcesu a analityka tylko anonimowa i opt-in. | Lokalny raport wysyłany świadomie przez użytkownika (§10). | ⚠️ do potwierdzenia |
| 5 | Dwie osoby z cyklem w jednej parze. | Każda ma własny panel, silnik i zgody (FR-CYC-14). | ⚠️ do potwierdzenia |
| 6 | Wrażliwe dane zdrowotne przy modelu komercyjnym (intent, napięcie 3). | Lista kontrolna z §9 jako warunek udostępnienia poza testy. | ⚠️ otwarte w intent |

## 13. Założenia

| ID | Założenie | Dotyczy |
|---|---|---|
| A1 | Propozycje 💡 z obszaru MVP przyjęte jako baza: Expo i TypeScript, SQLCipher, parowanie kodem QR lub linkiem, zasady prywatności 1–7 z intent §6, odsłanianie check-inu po wypełnieniu przez oboje. | całość |
| A2 | Aplikacja działa dla jednej osoby przed dołączeniem partnera; po sparowaniu osoba wybiera, co udostępnić (intent, pytanie 8). | FR-ONB-06, FR-PAIR-04 |
| A3 | W MVP wskazówki powstają tylko z panelu cyklu; wskazówki dla partnera bez cyklu (pytanie 7) pozostają otwarte, a model danych je dopuszcza. | FR-CYC-08, FR-CHK-08 |
| A4 | Konflikty: ostatnia zmiana pola wygrywa (HLC); check-iny, wpisy i zmiany nosiciela tylko dopisywane; wskazówki jednokierunkowe; bez CRDT. | §7.5 |
| A5 | Backup poza MVP; systemowe kopie wyłączone; po zmianie telefonu wspólne dane zostają u partnera, prywatne przepadają (pytanie 2). | FR-ONB-05, NFR-PRV-02 |
| A6 | Płatności poza MVP; jako premium planowane są historia i trendy, kolejne panele i czat AI (intent §8). | §1.3, FR-CHK-09 |
| A7 | Relay wysyła push bez treści przez APNs i FCM; wszystkie widoczne powiadomienia tworzy telefon. | FR-NOT-02 |
| A8 | Czat AI poza MVP (etap 2). | §15 |
| A9 | Jedna para na konto i jedno urządzenie na konto. | FR-PAIR-09, NFR-PLAT-02 |
| A10 | Konto to lokalna tożsamość kryptograficzna bez e-maila i hasła; relay uwierzytelnia urządzenie podpisem. | §7.3, NFR-PRV-03 |
| A11 | Domyślne zgody: wskazówki z cyklu i check-in wyłączone do aktywnego włączenia; obowiązki i obciążenie mentalne włączone. | §4.1, FR-PAIR-03 |
| A12 | Pauza obejmuje wskazówki i check-in, nie obowiązki ani obciążenie mentalne; dla partnera jest nieodróżnialna od braku danych. | FR-PAIR-06 |
| A13 | Po rozłączeniu oboje zachowują kopie wspólnych obowiązków i rzeczy do pamiętania jako prywatne; wskazówki i odpowiedzi check-in drugiej osoby są usuwane. | FR-PAIR-07 |
| A14 | Check-in nieodsłonięty do końca okna pozostaje widoczny tylko dla autora. | FR-CHK-06 |
| A15 | Każda osoba wybiera w onboardingu formę gramatyczną: żeńską, męską albo neutralną. | FR-ONB-01, NFR-UX-05 |
| A16 | iOS 16+, Android 10+, tylko telefony. | NFR-PLAT-01 |
| A17 | W MVP brak zewnętrznego zgłaszania awarii. | NFR-PRV-04 |
| A18 | Aplikacja tylko dla osób pełnoletnich. | FR-SEC-07 |
| A19 | Nazwa robocza „Parapka”. | całość |
| A20 | Zapomniany PIN bez biometrii oznacza reset aplikacji. | FR-SEC-06 |
| A21 | Relay hostowany w UE; TTL kopert 30 dni; logi techniczne najwyżej 14 dni. | §7.1, NFR-PRV-05, NFR-SYNC-02 |

## 14. Otwarte pytania

Z intent §10:

| # | Pytanie | Stan po specyfikacji |
|---|---|---|
| 2 | Szyfrowany backup danych | MVP bez backupu (A5); decyzja potrzebna przed udostępnieniem poza testy. |
| 3 | Czat AI w wersji komercyjnej | Otwarte, poza MVP. |
| 4 | Model cenowy i funkcje darmowe | Otwarte (A6). |
| 5 | Rynek startowy i język | MVP po polsku, teksty gotowe do tłumaczenia; decyzja o angielskim otwarta. |
| 6 | Kto przygotuje i zweryfikuje treści | Otwarte; blokuje udostępnienie poza testy (§8, §9). |
| 7 | Wskazówki dla partnera bez cyklu | Otwarte (A3). |
| 8 | Aplikacja dla jednej osoby przed dołączeniem partnera | Propozycja: tak (A2). |
| 9 | Kto buduje, budżet, termin | Otwarte; wpływa na wybór technologii relaya (N-1). |
| 10 | Nazwa aplikacji | Otwarte; nazwa robocza „Parapka” (A19). |

Nowe:

| ID | Pytanie |
|---|---|
| N-1 | Technologia relaya i dostawca hostingu w UE. |
| N-2 | Powiadomienia na iOS: od razu Notification Service Extension czy na start stały ogólny tekst? |
| N-3 | Pilotaż po testach pierwszej pary testowej: ile par, jak rekrutowanych, na jak długo? |
| N-4 | Domyślny dzień i godzina check-inu (propozycja: niedziela 19:00). |
| N-5 | Czy partner ma widzieć wyłączenie kategorii przez drugą osobę (obecnie tak, FR-PAIR-05), czy tylko neutralny brak danych jak przy pauzie? |

## 15. Poza MVP (intent §4, §5)

- **Etap 2: rozmowa i bliskość** (panele 5–9). Czat AI na etapie testów ✅: tylko pierwsza para testowa, na darmowym Gemini, pod warunkiem że obie osoby wiedzą, że w darmowym planie Google może wykorzystywać przesłane treści, także do przeglądu przez ludzi, i się na to zgadzają ⚠️. Przed udostępnieniem komukolwiek innemu: płatny plan albo opcja B lub C z intent §7. Prywatna „mapa ochoty” (panel 9) może korzystać z pola `desire` z wpisów samopoczucia, które już w MVP jest zawsze prywatne.
- **Etap 3: życie rodzinne** (panele 10–13).
- **Etap 4: długi horyzont** (panele 14–16); „temperatura związku” korzysta z historii check-inów.
- Kolejność etapów do ustalenia 💡.
- Poza etapami: szyfrowany backup, wiele urządzeń na konto, rotacja kluczy (forward secrecy), płatności.
