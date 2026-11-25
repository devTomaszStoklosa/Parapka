# Plan: wskazówki oparte na cyklu, wersja 2

Status: decyzje podjęte 2026-11-25 (sekcja 10). Śledzenie: #390. Implementacja w issues z sekcji 9.

## 0. Najważniejsze w skrócie

1. Chcesz, żeby partner dostawał wskazówki o ciele ("dziś mogą być wrażliwsze piersi", "dziś może być większa ochota na seks"), a osoba z cyklem dostawała informacje, czego się spodziewać. Technicznie to jest do zrobienia na istniejącym silniku (`packages/domain/src/hint-engine.ts`, biblioteka w `content/`).
2. **Obecna specyfikacja tego zakazuje.** FR-CYC-09 (tekst nie zdradza fazy, objawów ani wartości), FR-CYC-10 (wskazówki nie dotyczą seksu), ZP-5, R-1 i listy fraz w `content/forbidden-phrases.json` blokują dokładnie takie teksty, także w CI. Bez zmiany spec każde takie issue padnie na bramce treści.
3. Rekomendacja: nie zmieniać obecnych wskazówek, tylko dodać **drugi, opcjonalny poziom ("szczegółowe wskazówki")**, który włącza wyłącznie osoba z cyklem, osobno dla każdego tematu, z podglądem tego, co zobaczy partner. Domyślnie wyłączony.
4. Nauka jest tu słabsza, niż sugerują aplikacje (sekcja 1). Dlatego teksty muszą mówić "może", a silnik powinien uczyć się wzorców konkretnej osoby z jej wpisów (ma je już: energia, nastrój, napięcie, ochota, tagi), zamiast zakładać, że każda osoba jest "podręcznikowa".
5. Decyzje właściciela: wskazówki o bliskości i seksualności są kluczową funkcją (temat `intimacy`, w dobrym stylu, z lekką klauzulą bez presji); przeglądu specjalisty nie będzie nigdy, więc treści są trwale "orientacyjne" i zawsze w języku "może się pojawić"; przełącznik hormonów w wersji pierwszej; powiadomienie uprzedzające domyślnie włączone; zmiana spec zaakceptowana.
6. Podział na 12 issues w sekcji 9.

## 1. Research

Oznaczenia: **[źródło]** to coś, co sprawdziłem w publikacjach. **[wiedza ogólna]** to standardowa wiedza podręcznikowa, której tu nie sprawdzałem w publikacji. Taki tekst musi przejść przegląd specjalisty (spec §8) przed udostępnieniem komukolwiek poza testami.

### 1.1 Fazy i hormony [wiedza ogólna]

| Faza | Hormony | Co się dzieje | Co często zgłaszają osoby z cyklem |
|---|---|---|---|
| Miesiączka (dni 1–5) | estradiol i progesteron na dole | złuszczanie błony macicy, prostaglandyny skurczowo działają na macicę | bóle brzucha i krzyża, zmęczenie, bóle głowy, niższa energia zwłaszcza w dniach 1–2 |
| Folikularna (po miesiączce do owulacji) | estradiol rośnie | dojrzewa pęcherzyk | dla wielu osób więcej energii i lepszy nastrój |
| Okołoowulacyjna (około 2–3 dni) | szczyt estradiolu, skok LH | uwolnienie komórki jajowej | u części osób ból owulacyjny po jednej stronie, śluz płodny, więcej energii |
| Lutealna | rośnie progesteron, estradiol w drugiej połowie | ciało żółte; temperatura ciała wyższa o ok. 0,3–0,5 °C | senność, zatrzymywanie wody, wzdęcia, apetyt, tkliwe piersi, wypryski |
| Przedmiesiączkowa (ostatnie dni lutealnej) | oba hormony spadają | | drażliwość, wahania nastroju, obolałe piersi, zmęczenie, gorszy sen |

### 1.2 Co mówią badania (z linkami)

**Długość cyklu i faz: faza lutealna nie jest stała.** W Apple Women's Health Study 87% uczestniczek miało medianę cyklu 24–38 dni. Faza lutealna trwa zwykle 10–15 dni, a większość zmienności długości cyklu pochodzi z fazy folikularnej ([Harvard, AWHS](https://awhs-updates.hsph.harvard.edu/cycle-length-variability)). Łączna analiza trzech kohort dała średnio 18,5 dnia fazy folikularnej i 11,7 dnia lutealnej, a u 58,8% kobiet długość lutealnej różniła się między cyklami o więcej niż 3 dni ([PubMed 32104920](https://pubmed.ncbi.nlm.nih.gov/32104920/)). Badanie wewnątrz-osobowe też podważa założenie "zawsze 13–14 dni" ([PubMed 39320898](https://pubmed.ncbi.nlm.nih.gov/39320898/)).
*Wniosek:* obecna heurystyka "owulacja = początek następnej miesiączki minus 14 dni ± 2" (`cycle-phase.ts`) jest rozsądnym przybliżeniem, ale nie wiemy z góry, kiedy zaczyna się faza przedmiesiączkowa. Wskazówki o objawach przed miesiączką trzeba traktować jako mniej pewne niż wskazówki o samej miesiączce.

**Tkliwość piersi.** W losowej ankiecie 874 kobiet (18–44 lat) 68% zgłosiło cykliczne objawy ze strony piersi, a 22% umiarkowany lub silny dyskomfort ([PubMed 9358091](https://pubmed.ncbi.nlm.nih.gov/9358091/)). Przegląd szacuje 8–10% kobiet przed menopauzą z umiarkowanym lub silnym bólem co miesiąc ([StatPearls, NBK559249](https://www.ncbi.nlm.nih.gov/books/NBK559249/)). Ból jest najsilniejszy około tygodnia przed miesiączką i zwykle słabnie wraz z jej początkiem. Dane są sprzed ok. 2000 r. i różnie definiują objaw.
*Wniosek:* "wrażliwsze piersi w drugiej połowie cyklu" to najlepiej udokumentowana informacja z Twojej listy, ale dotyczy większości, nie wszystkich, a nasilenie jest bardzo różne.

**PMS i PMDD.** Dotkliwe PMS (z upośledzeniem funkcjonowania) dotyczy ok. 13–18% osób, PMDD ok. 3–8% według przeglądów, a DSM-5 podaje 1,8–5,8% ([PubMed 12892987](https://pubmed.ncbi.nlm.nih.gov/12892987/), [PubMed 16734317](https://pubmed.ncbi.nlm.nih.gov/16734317/), [AAFP 2016](https://aafp.org/pubs/afp/issues/2016/0801/p236.pdf)). Objawy to drażliwość, wahania nastroju, napięcie, wzdęcia, ból piersi i zmęczenie, w późnej fazie lutealnej, ustępujące krótko po początku miesiączki.
*Wniosek:* przy PMDD aplikacja nie jest narzędziem diagnostycznym (FR-CYC-03). Można dać neutralną informację "jeśli objawy bardzo utrudniają życie, warto porozmawiać z lekarzem".

**Nastrój.** Przegląd 47 badań z codziennymi pomiarami nastroju: tylko 15% znalazło związek negatywnego nastroju z fazą przedmiesiączkową, 38% nie znalazło związku z żadną fazą ([PubMed 23036262](https://pubmed.ncbi.nlm.nih.gov/23036262/)). Autorzy nie znaleźli jasnych dowodów na specyficzny "zespół przedmiesiączkowego złego nastroju" w populacji ogólnej.
*Wniosek:* twierdzenie "przed miesiączką będzie drażliwa" jest słabo poparte jako reguła ogólna. To ważne dla partnera, bo taka wskazówka łatwo staje się stereotypem. Nastrój powinien wynikać głównie z jej własnych wpisów, nie z kalendarza.

**Ochota seksualna.** Duże badanie dzienników (ok. 26 000 wpisów) wykazało zmiany ochoty i zachowań seksualnych wokół owulacji, z kontrolą w postaci osób na antykoncepcji hormonalnej ([PubMed 30148371](https://pubmed.ncbi.nlm.nih.gov/30148371/)). Inne prace pokazują duże różnice indywidualne i spór o to, czy to ogólny wzrost libido, czy reakcja na bodźce ([PMC9251465](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9251465/)). Brak jednej rozstrzygającej metaanalizy.
*Wniosek:* średnio możliwy skromny wzrost wokół owulacji, ale u konkretnej osoby może go nie być albo być w innym momencie. Wskazówka "dziś będzie miała większą ochotę" jest naukowo za mocna. Uczciwe sformułowanie to "może".

### 1.3 Konsekwencje dla produktu

- Wskazówki fazowe są **prawdopodobieństwem, nie faktem**. Silnik musi to uwzględniać w treści i w progach pewności.
- **Antykoncepcja hormonalna, ciąża, karmienie, menopauza**: cykl owulacyjny nie działa tak jak w tabeli, a badania AWHS wykluczają osoby na hormonach. Prognozy faz są wtedy mylące. Potrzebny jest przełącznik w profilu cyklu, który wyłącza szczegółowe wskazówki.
- **Nieregularny cykl** (odchylenie > 7 dni, już wykrywane w `cycle-phase.ts`): szczegółowe wskazówki wstrzymane, zostają tylko te oparte na wpisach.
- **Spóźniająca się miesiączka**: po przekroczeniu prognozowanej daty bez zapisu aplikacja przestaje wysyłać wskazówki o objawach przedmiesiączkowych (inaczej wygeneruje je na nieokreślony czas).

## 2. Konflikt ze specyfikacją i rekomendowane rozwiązanie

| Zapis spec | Co blokuje | Propozycja |
|---|---|---|
| FR-CYC-09: tekst nie zdradza fazy, dat, objawów | "wrażliwsze piersi" to objaw | Wyjątek tylko dla poziomu "szczegółowe", włączonego świadomie |
| FR-CYC-10, ZP-5: wskazówki nie dotyczą seksu | wskazówka o ochocie | Osobny temat "bliskość", wyłączony domyślnie, patrz niżej |
| R-1: partner nie odgadnie fazy z wzoru | szczegółowe wskazówki same zdradzają fazę | Świadoma zgoda osoby z cyklem + podgląd; w zamian dla poziomu podstawowego nic się nie zmienia |
| `forbidden-phrases.json`, testy CI | listy "revealing" i "sexual" | Listy zależne od poziomu i tematu (sekcja 5) |
| FR-CYC-03: bez funkcji medycznych | część informacji o objawach | Język "może", brak diagnoz, brak porad lekowych, przegląd specjalisty |

**Ryzyko, które chcę, żebyś zobaczył wprost: temat "ochota na seks".** Partner dostaje informację, że "dziś może być więcej ochoty". To może zadziałać dobrze, ale też:
- jako presja ("aplikacja mówi, że dziś jest dobry dzień"), niezależnie od tego, co ta osoba czuje;
- jako sygnał, którego brak też coś mówi ("dziś nie ma tej wskazówki");
- w związku z przemocą lub przymusem jako narzędzie kontroli.

Dlatego rekomenduję: temat "bliskość" jest **osobnym przełącznikiem, domyślnie wyłączonym**, osoba z cyklem widzi dokładny tekst przed włączeniem, każdy tekst zawiera klauzulę "bez oczekiwań" ("nie" jest zawsze w porządku), a wskazówka znika, jeśli w ostatnich 3 dniach wpisała niską ochotę (np. ≤ 2). Wybór brzmienia ("bliskość" czy wprost "seks") zostawiam Tobie, patrz pytanie 1 w sekcji 10.

## 3. Strumień A: wskazówki dla partnera

### 3.1 Poziomy

| | Podstawowy (jest dziś) | Szczegółowy (nowy, opcjonalny) |
|---|---|---|
| Przykład | "Przejmij dziś kolację." | "Dziś mogą jej być wrażliwsze piersi. Przytulaj delikatnie." |
| Zdradza fazę/objaw | nie | tak, w ramach wybranych tematów |
| Włącza | zgoda `CYCLE_HINTS` | dodatkowa zgoda + wybór tematów |
| Domyślnie | wyłączony do świadomego włączenia | wyłączony |

### 3.2 Tematy (każdy włączany osobno)

| Temat | Przykładowa wskazówka (≤ 120 znaków) | Kiedy |
|---|---|---|
| `body_tenderness` | "Dziś mogą jej być wrażliwsze piersi. Przytulaj delikatnie." | druga połowa cyklu, wpis z tagiem `breast_tenderness` podnosi pewność |
| `cramps` | "Może ją boleć brzuch. Przynieś ciepły termofor i herbatę." | miesiączka, tag `cramps` |
| `energy_low` | "Dziś może mieć mniej sił. Weź na siebie wieczorne sprawy." | miesiączka, lutealna, wpis z niską energią |
| `sleep` | "Może gorzej spać. Zadbaj dziś o spokojny wieczór." | lutealna |
| `mood_sensitivity` | "Może być dziś bardziej wrażliwa. Daj więcej uwagi, mniej rad." | tylko gdy to wynika z wpisów lub wzorca osoby, **nie z samego kalendarza** (sekcja 1.2) |
| `intimacy` ("Bliskość i ochota") | "Dziś może pojawić się większa ochota na bliskość i seks. Zostaw jej przestrzeń, bez oczekiwań." | okno okołoowulacyjne, tylko gdy ochota nie jest niska we wpisach |

Każdy temat ma teksty w trzech formach gramatycznych (jak dziś), minimum 8 szablonów na temat, żeby uniknąć powtarzania w 7 dni (`HINT_NO_REPEAT_DAYS`).

### 3.3 Zasady silnika (zmiany w `hint-engine.ts`)

1. Wejście silnika dostaje `allowedTopics` (z lokalnych ustawień) i `tier`. Szablony szczegółowe mają pola `tier` i `topic`. Bez zgody na temat żaden szablon tego tematu nie wchodzi do puli.
2. Reguły danych (`energyMax`, `source`, itd.) nadal mają pierwszeństwo przed kalendarzem (FR-CYC-08). Dochodzi warunek `tagIncluded`, np. `breast_tenderness` w ostatnich 3 dniach.
3. **Bramka pewności:** szczegółowa wskazówka kalendarzowa wchodzi tylko, gdy `confidence === "normal"`, cykl nie jest nieregularny, nie zaznaczono hormonów/ciąży/menopauzy, a miesiączka nie jest spóźniona. Inaczej zostają tylko wskazówki oparte na wpisach, albo wskazówka podstawowa.
4. **Szum przeciw odgadywaniu:** szczegółowa wskazówka nie pojawia się każdego dnia fazy. Limit np. 1 szczegółowa na 2 dni, reszta podstawowe, żeby partner nie odtwarzał dokładnych dat z wzoru (R-1 pozostaje częściowo aktualne).
5. **Kategoria w protokole bez zmian:** każdy szablon szczegółowy należy do jednej z pięciu istniejących kategorii (np. `tenderness`), więc koperty, walidacja w `packages/protocol` i relay się nie zmieniają. Na kablu idą nadal tylko cztery pola: `forDate`, `text`, `category`, `status`. `templateId` i `contentVersion` zostają na telefonie (zgodnie z kodem i `hint-privacy.test.ts`).
6. Osoba z cyklem nadal widzi dokładnie to samo, co partner, plus może pominąć lub wymienić wskazówkę (FR-CYC-06, FR-CYC-07). Bez tego szczegółowy poziom nie przechodzi review.

### 3.4 Personalizacja z wpisów (nowy moduł `packages/domain/src/cycle-patterns.ts`)

- Tagi wpisu dziś: `headache`, `cramps`, `fatigue`, `bloating`, `sleep`, `irritability`. Dochodzą: `breast_tenderness`, `acne`, `cravings`. Stałe tagi są w `apps/mobile/src/cycle/wellbeing-validation.ts`.
- Dla każdego tagu i dla pól `energy`, `mood`, `tension`, `desire` liczymy wzorzec względem **dnia cyklu** (liczony od początku miesiączki, dla późnych dni także wstecz od następnej).
- Po ≥ 3 zapisanych cyklach: jeśli temat pojawia się w ≥ 50% cykli w oknie ±1 dzień, mówimy "to Twój wzorzec" i podnosimy pewność. Jeśli osoba przez 3 cykle nigdy nie zapisała tagu, a podręcznikowa faza go zakłada, zmniejszamy częstość tej wskazówki (tym łagodzimy sprzeczność "podręcznik kontra ona").
- Wszystko liczone lokalnie. Nic nowego nie opuszcza telefonu.

## 4. Strumień B: "czego się spodziewać" dla osoby z cyklem

Obecnie jest `PhaseCard` z jednym krótkim opisem fazy (FR-CYC-04). Proponuję rozszerzenie, **bez udostępniania czegokolwiek partnerowi**:

1. **Karta "Najbliższe dni"** na ekranie Cykl i Dziś: dla dziś i 3 kolejnych dni lista "Może się pojawić" z określeniami częstości ("często", "u części osób", "rzadziej"), bez liczb procentowych, bo źródła są niespójne. Treść z nowego pliku `content/symptom-expectations.json` (5 faz × lista tematów × teksty w formach).
2. **Sekcja "Twoje wzorce"** po 3 cyklach: "W dniach 24–27 cyklu najczęściej zapisujesz: tkliwość piersi, niższą energię" na podstawie `cycle-patterns.ts`. Kalendarz podręcznikowy jest punktem startu, a wzorzec osoby ma pierwszeństwo.
3. **Co może pomóc**: krótkie, niemedyczne wskazówki (ciepło, ruch, sen, odpoczynek). Bez nazw leków i dawek (FR-CYC-03).
4. **Kiedy porozmawiać z lekarzem**: neutralna informacja o objawach, które bardzo utrudniają życie, bardzo obfitej lub bardzo długiej miesiączce, cyklu poza zakresem 21–45 dni. Tekst do przeglądu specjalisty.
5. **Uprzedzenie z wyprzedzeniem** (powiadomienie, domyślnie włączone, decyzja 4): "Parapka: masz nowe przypomnienie", w treści aplikacji dopiero szczegóły. Tekst powiadomienia pozostaje dyskretny. Wymaga nowego typu w `notification-types.ts` i źródła w `sources.ts`.
6. Zawsze widoczne zastrzeżenie "to szacunek, nie metoda antykoncepcji ani narzędzie medyczne" (FR-CYC-15, już jest w `CycleDisclaimer`).

## 5. Treść i bramki jakości

- Nowe pola w `packages/content/src/types.ts`: `tier`, `topic` w `HintTemplate`; nowy plik `symptom-expectations.json` w `KNOWN_FILES`; `contentVersion` podbite do 4.
- Walidator (`validate.ts`) wymaga: szablon szczegółowy ma `topic` z listy; szablon podstawowy nie ma `topic`.
- Listy zakazanych fraz (`forbidden.ts`, `forbidden-phrases.json`) zależne od poziomu:
  - **podstawowy:** bez zmian;
  - **szczegółowy:** nadal zakazane nazwy faz, "okres/miesiączka/owulacja/PMS/PMDD/hormony" i język medyczny, **dozwolone** słowa ciała z listy dozwolonych dla tematu (np. "piersi" tylko w `body_tenderness`);
  - **sexual:** dozwolone tylko w temacie `intimacy`. Styl: ciepły, nigdy wulgarny. Każdy tekst ma lekką klauzulę "bez oczekiwań" / "«nie» jest w porządku" (test wymaga jej obecności).
- Limit 120 znaków i komplet trzech form pozostają. Test w CI sprawdza też, że żaden szablon nie obiecuje pewności ("na pewno", "będzie", "zawsze").
- Przeglądu specjalisty nie będzie (decyzja właściciela). Wszystkie nowe treści zostają trwale `review: "unreviewed"`, więc ochroną są: język "może / bywa / u części osób" (test CI odrzuca twierdzenia pewne), widoczna etykieta "Treści orientacyjne, nie porada medyczna" przy wskazówkach szczegółowych i oczekiwaniach oraz uczciwe zapisy w spec §8–9, `docs/release-checklist.md` i dokumentach prawnych.
- Limit 300 linii na plik: `hint-templates.json` jest już duży. Szczegółowe szablony idą do osobnego pliku `hint-templates-detailed.json`, a loader (`library.ts`) uczy się go jako osobnego, znanego pliku.

## 6. Zgody i prywatność

- Dane cyklu nadal **nigdy** nie opuszczają telefonu. Do partnera trafia tylko gotowy tekst (jak dziś).
- Ale tekst szczegółowy sam jest daną o zdrowiu, więc wymaga **wyraźnej zgody** (RODO art. 9 ust. 2 lit. a). Nowa kategoria zgody `CYCLE_DETAIL` obok `CYCLE_HINTS` w `consent-model.ts`, z listą włączonych tematów przechowywaną lokalnie.
- Wyłączenie tematu lub całości: polecenie usunięcia już wysłanych szczegółowych wskazówek z telefonu partnera (mechanizm jak w `hint-withdrawal.ts` dla `CYCLE_HINTS`), plus ponowne przeliczenie 3 dni naprzód na podstawowe.
- Pauza (FR-PAIR-06) wstrzymuje też szczegółowe. Partner widzi stan nieodróżnialny od braku danych.
- Ekran zgody pokazuje przykłady **dokładnie tych tekstów**, które zobaczy partner, w jego formie gramatycznej, i uczciwą informację, że usunięcia z telefonu partnera nie da się zagwarantować (R-5).
- Do zaktualizowania: `docs/dpia.md`, `docs/privacy-policy.md`, `docs/records-of-processing.md`, `docs/data-inventory.md` (nowa kategoria, nowy rodzaj tekstu), wszystkie wymagają przeglądu prawnika.
- Raport badawczy i eksport nie dostają nowych treści szczegółowych (tylko liczby, jak dziś).

## 7. Interfejs

- **Ustawienia cyklu** (`CyclePanelSettings`): nowa sekcja "Szczegółowe wskazówki dla partnera". Główny przełącznik, lista tematów z przełącznikami, podgląd przykładu przy każdym, przełącznik "Biorę antykoncepcję hormonalną / jestem w ciąży lub karmię / menopauza" (wyłącza szczegółowe).
- **Dziś** (`TodayScreen`): wskazówka szczegółowa wygląda jak podstawowa. Bez etykiet "szczegółowa", żeby nie wzmacniać wrażenia, że jest "wyjątkowa". Reakcje "zrobione / nie dziś" bez zmian.
- **Cykl**: nowa karta "Najbliższe dni" i sekcja "Twoje wzorce".
- Wygląd wg `docs/design` po zakończeniu przebudowy #376–#385, żeby nie robić dwa razy tych samych ekranów. Logikę (issues 1–6) można zrobić wcześniej, ekrany (7–9) po design.

## 8. Testy

- **Jednostkowe domeny:** brama pewności (nieregularny, spóźniona miesiączka, hormony), limit 1 na 2 dni, pierwszeństwo wpisów nad kalendarzem, temat bez zgody nigdy nie wchodzi do puli, determinizm przy tym samym ziarnie dnia.
- **Treść w CI:** nowe listy zależne od poziomu, obowiązkowa klauzula w `intimacy`, brak twierdzeń pewnych, długość i trzy formy.
- **Prywatność:** test synchronizacji, że po wyłączeniu tematu partner traci tylko te wskazówki, że koperta niesie wyłącznie `forDate`, `text`, `category`, `status`, i że w logach relaya nic nie przybywa.
- **E2E (Playwright, 390 i 320 px):** włączenie tematu z podglądem, pojawienie się wskazówki u partnera, pominięcie, wyłączenie i zniknięcie.
- Dalej obowiązują bramki: 100% pokrycia linii, duplikacja ≤ 3%, 300 linii na plik, typecheck, scope, prettier, commitlint, CodeQL.

## 9. Podział na issues (kolejność = zależności)

Każde ≤ 10 plików kodu i ok. 600 linii (limit pipeline). Numery zakłada agent, lista jest w #390. Kolejność pracy: najpierw dokończenie przebudowy wyglądu (#376–#385), potem A–H, K i na końcu ekrany I, J, L (wymagają wyglądu).

| Litera | Zakres | Zależy od |
|---|---|---|
| A | Spec i dokumenty (FR-CYC-09/10, ZP-5, R-1, FR-NOT-05, §8–9, checklist wydania, dokumenty prawne) | — |
| B | Treść: schemat `tier`/`topic`, walidator, listy fraz zależne od poziomu, loader wielu plików | A |
| C | Treść: szablony `body_tenderness`, `cramps`, `energy_low` | B |
| D | Treść: szablony `sleep`, `mood_sensitivity`, `intimacy` | B |
| E | Treść: `symptom-expectations.json` | B |
| F | Zgoda `CYCLE_DETAIL`, tematy, przełącznik hormonów, wycofanie | A |
| G | Silnik: poziom, tematy, bramka pewności | B, F |
| H | `cycle-patterns.ts` i nowe tagi | — |
| I | UI zgody i podglądu w ustawieniach cyklu | F, G, wygląd #384 |
| J | Karta "Najbliższe dni" i "Twoje wzorce" | E, H, #384, #380 |
| K | Powiadomienie uprzedzające (domyślnie włączone) | E, F |
| L | E2E i testy prywatności | I, J, K |

## 10. Decyzje (2026-11-25)

1. **Ochota:** jedna z najważniejszych funkcji, musi być. Temat `intimacy`, etykieta "Bliskość i ochota", ciepły i taktowny styl, lekka klauzula bez presji. Pozostają zabezpieczenia: temat wyłączony do świadomego włączenia, podgląd tekstów, tłumienie przy niskiej ochocie we wpisach, możliwość pominięcia wskazówki.
2. **Przegląd specjalisty:** nigdy nie będzie. Treści trwale "orientacyjne", zawsze w języku "może się pojawić", z widoczną etykietą w aplikacji.
3. **Hormony/ciąża/karmienie/menopauza:** przełącznik w wersji pierwszej.
4. **Powiadomienie uprzedzające:** domyślnie włączone, tekst dyskretny.
5. **Zmiana specyfikacji:** zaakceptowana.

## 11. Źródła

- [Harvard T.H. Chan, Apple Women's Health Study: długość i zmienność cyklu](https://awhs-updates.hsph.harvard.edu/cycle-length-variability)
- [PubMed 32104920: długość faz folikularnej i lutealnej, trzy kohorty](https://pubmed.ncbi.nlm.nih.gov/32104920/)
- [PubMed 39320898: zmienność faz wewnątrz osoby](https://pubmed.ncbi.nlm.nih.gov/39320898/)
- [PubMed 9358091: częstość cyklicznej mastalgii](https://pubmed.ncbi.nlm.nih.gov/9358091/)
- [StatPearls NBK559249: ból piersi](https://www.ncbi.nlm.nih.gov/books/NBK559249/)
- [PubMed 12892987: częstość i obciążenie PMS/PMDD](https://pubmed.ncbi.nlm.nih.gov/12892987/)
- [PubMed 16734317: zaburzenia przedmiesiączkowe](https://pubmed.ncbi.nlm.nih.gov/16734317/)
- [AAFP 2016: PMS i PMDD](https://aafp.org/pubs/afp/issues/2016/0801/p236.pdf)
- [PubMed 23036262: nastrój w prospektywnych badaniach dziennych](https://pubmed.ncbi.nlm.nih.gov/23036262/)
- [PubMed 30148371: ok. 26 000 wpisów, ochota wokół owulacji](https://pubmed.ncbi.nlm.nih.gov/30148371/)
- [PMC9251465: zmiany seksualności w cyklu, kwestie teoretyczne](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9251465/)

Uwaga o źródłach: wyszukiwarka zwróciła głównie streszczenia i abstrakty, nie pełne teksty. Liczby przytaczam tak, jak podają je te streszczenia. Tabela z sekcji 1.1 i opisy objawów z pominiętych tam źródeł to wiedza podręcznikowa do weryfikacji przez specjalistę.
