# intent.md: aplikacja mobilna dla par (szkic v0.2)

Data: 2026-10-28 · Status: szkic do poprawek (v0.2)

**Legenda:** ✅ = ustalone przez autora · 💡 = propozycja do akceptacji · ⚠️ = napięcie do rozstrzygnięcia

---

## 1. Cel i wartość

**Problem.** Pary z długim stażem, szczególnie z dziećmi, tracą bliskość nie z braku miłości, tylko przez zmęczenie, nierówny podział obowiązków, brak rozmów i wzajemne niezrozumienie (np. zmian nastroju i ochoty w cyklu). Pożądanie u wielu osób jest reaktywne: pojawia się po odciążeniu, poczuciu bezpieczeństwa i bliskości, a nie przed nimi.

**Cel aplikacji.** Pomóc obojgu partnerom lepiej się rozumieć i odciążać, żeby wróciły czas, rozmowa, bliskość i namiętność. Aplikacja ma być narzędziem bliskości, nigdy kontroli.

**Wartość:**
- Dla niej (osoby z cyklem): rozumie, co się z nią dzieje w danej fazie i jak może się zmieniać jej samopoczucie i zachowanie. Decyduje, co udostępnia. Realnie mniej obowiązków na głowie.
- Dla niego (partnera): konkretne wskazówki, jak sprawić, żeby ona miała się dobrze ("dziś więcej czułości, mniej planów"), zamiast zgadywania.
- Dla obojga: wspólny obraz obowiązków i obciążenia mentalnego, regularny check-in, a w kolejnych etapach randki, rozmowy, finanse i cele.

**Zasady produktu:** wzajemność (każda funkcja daje coś obu stronom), zero presji ("nie" jest zawsze w porządku), małe regularne kroki zamiast wielkich gestów.

## 2. Użytkownicy

- ✅ Aplikacja dla każdego typu pary. Panel cyklu jest opcjonalny i włączany tylko wtedy, gdy któraś osoba w parze ma cykl.
- ✅ Dwa konta na dwóch telefonach, połączone w parę.
- 💡 Główna grupa na start (marketing): pary 25 do 45 lat, staż 3+ lata, z małymi dziećmi, które czują, że "żyją obok siebie".
- 💡 Persony do testów: (1) para z ponad 10-letnim stażem, dwoje dzieci, różnica libido, zmęczenie; (2) para bez dzieci po kilku latach rutyny; (3) para jednopłciowa, bez panelu cyklu.

**Onboarding** ✅: staż związku, czy są dzieci, na czym nam zależy / co chcemy naprawić.
💡 Każde z partnerów przechodzi onboarding osobno na swoim telefonie. Odpowiedzi "co chcę naprawić" są domyślnie prywatne i służą tylko do dopasowania treści, chyba że ktoś zdecyduje się je pokazać.

## 3. Łączenie pary i zgoda

✅ Przy łączeniu pary aplikacja jasno informuje, jakie dane są dzielone i w jakiej formie. Dane o cyklu należą do osoby z cyklem. Partner dostaje wskazówki, a nie surowe dane.

💡 Propozycja przepływu:
1. Osoba A tworzy parę i pokazuje kod QR lub link zaproszenia.
2. Osoba B skanuje kod. Telefony wymieniają klucze szyfrujące (patrz sekcja 7).
3. Każde z osobna widzi ekran zgody z przełącznikami per kategoria danych (cykl → wskazówki, check-in, obowiązki itd.).
4. Udostępnianie można w każdej chwili wstrzymać lub zmienić, a parę rozłączyć. Rozłączenie usuwa udostępnione dane z telefonu drugiej osoby.

## 4. Zakres MVP i etapy

### MVP ✅
1. **Cykl i wskazówki dla partnera** (opcjonalny)
2. **Check-in tygodniowy**
3. **Planer obowiązków** (stałe i okazjonalne, przypisanie odpowiedzialnego)
4. **Obciążenie mentalne**

Plus: onboarding, łączenie pary ze zgodą, synchronizacja między telefonami, powiadomienia.

### Etapy po MVP 💡 (kolejność do ustalenia)
- **Etap 2: rozmowa i bliskość.** Rozmowa o emocjach (szablony + czat z podpowiedziami AI), docenianie, rytuały, randki i czas we dwoje, bliskość i intymność. Uzasadnienie: to najbliżej celu "odbudowa namiętności" i najmocniej wiąże się z danymi z MVP.
- **Etap 3: życie rodzinne.** Dzieci, pomysły na wspólny czas (wakacje, weekend, kino), finanse, rozmowy trudne.
- **Etap 4: długi horyzont.** Zdrowie i regeneracja, cele i marzenia, postępy ("temperatura związku").

## 5. Panele

✅ Wszystkie 16 paneli zatwierdzone (6 pomysłów autora + 10 zaproponowanych). Szczegóły funkcji poniżej to 💡 propozycje.

| # | Panel | Etap | Opis |
|---|---|---|---|
| 1 | Cykl i wskazówki | MVP | Kalendarz okresu i faz. Ona widzi, co się z nią dzieje (energia, nastrój, możliwa większa ochota, rozdrażnienie) i jak to może wpływać na zachowanie. Partner dostaje wskazówki na dziś. Wskazówki uwzględniają jej okresowe wpisy o samopoczuciu, nie tylko kalendarz. |
| 2 | Check-in tygodniowy | MVP | 2 minuty: nastrój, energia, bliskość, jedno "potrzebuję". Wyniki widać, gdy oboje wypełnią. Zasila wskazówki. |
| 3 | Planer obowiązków | MVP | Obowiązki stałe i okazjonalne, przypisanie odpowiedzialnego, przypomnienia, odhaczanie. |
| 4 | Obciążenie mentalne | MVP | Lista rzeczy do pamiętania (nie tylko do zrobienia), kto je "nosi w głowie", podział w procentach i trend. |
| 5 | Rozmowa o emocjach | 2 | ✅ Oba warianty: szablony i pytania oraz czat między partnerami z podpowiedziami AI. |
| 6 | Docenianie | 2 | Szybkie "dziękuję za…", dziennik wdzięczności, przypomnienia o rocznicach i gestach. |
| 7 | Rytuały | 2 | 10 minut rozmowy dziennie, wieczór bez telefonów, rytuał powitania. |
| 8 | Randki i czas we dwoje | 2 | Stały rytm (np. co 2 tygodnie), baza pomysłów, losowanie, opieka nad dziećmi. |
| 9 | Bliskość i intymność | 2 | Dotyk bez presji, rozmowa o fantazjach i granicach, prywatna "mapa ochoty" każdego z osobna. |
| 10 | Dzieci | 3 | Karta dzieci: plan dnia, zajęcia, wizyty, kto odbiera, ważne daty. |
| 11 | Pomysły na wspólny czas | 3 | Wakacje, weekend, wyjście do kina; lista "chcemy kiedyś". |
| 12 | Finanse | 3 | Budżet, opłaty stałe, stałe odkładanie (wakacje, naprawy). |
| 13 | Rozmowy trudne | 3 | Szablony ("jak powiedzieć, że czegoś mi brakuje"), przerwa na ochłonięcie, zapis ustaleń. |
| 14 | Zdrowie i regeneracja | 4 | Sen, ruch, czas dla siebie każdego z Was. |
| 15 | Cele i marzenia | 4 | Wspólna wizja na 1, 5 i 10 lat, powiązana z finansami. |
| 16 | Postępy | 4 | "Temperatura związku": trend z check-inów, podsumowanie miesiąca. |

## 6. Zasady prywatności i etyki

✅ Ustalone:
- Dane przechowywane na urządzeniach.
- Dane o cyklu należą do osoby z cyklem. Partner dostaje wskazówki, nie surowe dane.
- Zgoda na dzielenie danych przy łączeniu pary.

💡 Proponowane zasady:
1. **Wskazówki nigdy nie naciskają na seks.** Formułowane są jako "co możesz dla niej zrobić" (odciążenie, czułość, uwaga), a nie "dziś jest dobry dzień na seks". Inaczej aplikacja zamieni się w narzędzie presji, a ona przestanie jej używać.
2. **Ona widzi to co on.** Osoba z cyklem zawsze może podejrzeć, jakie wskazówki dostaje partner.
3. **Wstrzymanie jednym ruchem.** Pauza udostępniania bez tłumaczenia się i bez powiadamiania partnera o powodzie.
4. **Prywatne pozostaje prywatne.** Notatki, "mapa ochoty" i odpowiedzi z onboardingu są domyślnie widoczne tylko dla autora.
5. **Blokada aplikacji** (PIN / biometria) i dyskretne powiadomienia bez treści na ekranie blokady.
6. **Ochrona przed nadużyciami.** Brak funkcji śledzenia lokalizacji czy podglądania aktywności partnera. Łatwe rozłączenie pary.
7. **Bez reklam i bez sprzedaży danych.**

## 7. Wstępna architektura 💡

- **Aplikacja:** React Native ✅ (💡 z Expo, TypeScript), iOS i Android.
- **Dane lokalne:** szyfrowana baza na urządzeniu (💡 SQLite z SQLCipher lub podobne), klucze w Keychain / Keystore.
- **Powiadomienia:** lokalne, generowane na telefonie (przypomnienia, check-in, wskazówka dnia).
- **Wskazówki:** generowane na telefonie osoby z cyklem z jej danych. Do partnera wysyłana jest tylko gotowa wskazówka, nie dane źródłowe. To technicznie realizuje zasadę "wskazówki zamiast surowych danych".
- **Treści** (opisy faz, wskazówki, szablony rozmów): biblioteka w aplikacji, przygotowana i zweryfikowana przez specjalistów (💡 seksuolog / psycholog / ginekolog).

### ✅ Napięcie 1: synchronizacja dwóch telefonów (rozstrzygnięte: opcja A)

✅ Decyzja: szyfrowany relay E2E. Serwer przekazuje tylko zaszyfrowane paczki zmian i nie ma kluczy. Opcje poniżej zostają jako uzasadnienie.

Wspólny planer, check-in i wskazówki muszą jakoś trafić z jednego telefonu na drugi. Opcje:

| Opcja | Jak działa | Plusy | Minusy |
|---|---|---|---|
| **A. Szyfrowany relay E2E** (✅ wybrane) | Serwer przekazuje zaszyfrowane paczki zmian. Klucze tylko na telefonach, serwer widzi wyłącznie szyfrogram. | Działa, gdy telefony nie są online jednocześnie. Zgodne z duchem "dane na urządzeniach". | Trzeba utrzymywać mały serwer. Wymaga starannej kryptografii (gotowe biblioteki, np. libsodium). |
| **B. P2P** (Wi-Fi lokalne / Bluetooth / WebRTC) | Telefony synchronizują się bezpośrednio. | Brak serwera danych. | Sync tylko, gdy oba telefony są blisko lub online naraz. Zawodne, zwłaszcza na iOS w tle. |
| **C. Hybryda** | P2P gdy możliwe, relay jako zapas. | Najlepsze doświadczenie. | Najwięcej pracy. |

Do rozstrzygnięcia też: **utrata telefonu = utrata danych**. 💡 Opcjonalny szyfrowany backup (np. do iCloud / Google Drive użytkownika lub do relaya), z kluczem znanym tylko użytkownikowi. Rozwiązywanie konfliktów przy edycji tych samych danych na dwóch telefonach: 💡 CRDT lub prosta zasada "ostatnia zmiana wygrywa" dla planera.

### ✅ Napięcie 2: czat AI a prywatność (rozstrzygnięte na etap testów)

✅ Decyzja na etap testów: czat AI testuje tylko pierwsza para testowa, na darmowym Gemini.

⚠️ Uwaga: w darmowym planie Gemini API Google może wykorzystywać przesłane treści do ulepszania swoich produktów, w tym do przeglądu przez ludzi (płatny plan tego nie robi). Na testy we dwoje to akceptowalne, jeśli obie osoby z pary testowej o tym wiedzą i się zgadzają. 💡 Przed udostępnieniem komukolwiek innemu trzeba przejść na płatny plan lub jedną z opcji poniżej.

Opcje na wersję komercyjną:

Podpowiedzi AI w czacie wymagają modelu językowego. Duże modele działają w chmurze, a to oznacza wysłanie bardzo intymnych treści poza telefon, co kłóci się z decyzją "dane na urządzeniach". Opcje:
- **A. Model na urządzeniu.** Pełna prywatność, ale słabsza jakość, większa aplikacja, starsze telefony mogą nie dać rady.
- **B. Chmura z jawną zgodą** (osobny opt-in dla obojga, dostawca bez przechowywania i bez trenowania na danych, umowa powierzenia danych). Dobra jakość, ale wyjątek od zasady i dodatkowe obowiązki RODO.
- **C. Podpowiedzi bez treści rozmowy.** AI dostaje tylko kontekst ("rozmowa o podziale obowiązków, napięcie") zamiast wiadomości.
- 💡 Rekomendacja na wersję komercyjną: wariant B na płatnym planie (bez trenowania na danych) lub C, z wyraźną zgodą obojga. Wpływa to na komunikację marketingową ("Twoje dane nie opuszczają telefonu").

## 8. Model biznesowy

✅ Cel komercyjny.

💡 Propozycje:
- **Freemium + subskrypcja na parę** (jedna płatność odblokowuje premium dla obojga). Darmowo: podstawy MVP. Premium: pełne wskazówki, historia i trendy, kolejne panele, czat AI.
- Orientacyjnie do zweryfikowania z rynkiem: ok. 19 do 29 zł/miesiąc lub 149 do 199 zł/rok za parę.
- 💡 Rynek startowy: Polska (język, treści), potem angielski.
- Konkurencja do przeanalizowania: aplikacje dla par (Paired, Lasting, Between, Honeydue) i aplikacje cyklu (Flo, Clue). Wyróżnik: połączenie cyklu, obowiązków i obciążenia mentalnego w jednej aplikacji dla dwojga, z prywatnością na urządzeniu.
- Bez reklam i bez handlu danymi (patrz zasada 7).

### ⚠️ Napięcie 3: wrażliwe dane zdrowotne przy modelu komercyjnym

- **RODO art. 9:** dane o zdrowiu (cykl, objawy) i o życiu seksualnym to dane szczególnej kategorii. Potrzebna wyraźna zgoda, ocena skutków dla ochrony danych (DPIA), polityka prywatności, możliwość usunięcia danych. Przechowywanie na urządzeniu i E2E zmniejsza ryzyko, ale nie zwalnia z obowiązków, gdy działa serwer (relay, płatności, analityka, AI).
- **Sklepy:** Apple (wytyczne dot. danych zdrowotnych, etykiety prywatności) i Google Play (polityka aplikacji zdrowotnych, deklaracja bezpieczeństwa danych) wymagają jasnego opisu danych i zakazują ich wykorzystywania do reklam.
- **Wyroby medyczne:** aplikacja nie może obiecywać antykoncepcji ani wykrywania dni płodnych w celach medycznych, bo to wymagałoby certyfikacji jako wyrób medyczny (MDR). 💡 Wyraźny komunikat: "nie jest metodą antykoncepcji ani narzędziem medycznym".
- **Analityka:** 💡 tylko anonimowa i bez treści (np. "panel otwarty"), z opt-in.
- 💡 Przed premierą: konsultacja z prawnikiem od ochrony danych.

## 9. Ryzyka

1. **Narzędzie kontroli lub presji** zamiast bliskości. Mitygacja: zasady z sekcji 6, testy z kobietami jako głównymi odbiorcami panelu cyklu.
2. **Jedna osoba przestaje używać** (najczęściej ta, która nie zainstalowała aplikacji z własnej inicjatywy). Mitygacja: wartość dla obu stron od pierwszego dnia, krótkie check-iny, brak "pracy domowej".
3. **Trafność wskazówek z cyklu.** Cykl różnie wpływa na różne osoby; ogólniki mogą irytować. Mitygacja: wskazówki oparte na jej własnych wpisach, język "może", treści weryfikowane przez specjalistów.
4. **Złożoność techniczna synchronizacji E2E** przy małym zespole. Mitygacja: gotowe biblioteki, prosty model danych w MVP.
5. **Utrata danych** przy zmianie lub utracie telefonu.
6. **Regulacje i odrzucenie w sklepach** (sekcja 8).
7. **Zbyt szeroki zakres.** 16 paneli to dużo; ryzyko rozmycia. Mitygacja: twarde trzymanie się MVP.
8. **Rozstanie pary i spory** o dane. Mitygacja: jasne zasady rozłączenia, każdy zachowuje swoje dane.

## 10. Otwarte pytania

~~1. Synchronizacja~~ ✅ relay E2E.
2. Czy chcemy szyfrowany backup danych i gdzie?
3. Czat AI w wersji komercyjnej: płatna chmura z opt-in, model na urządzeniu, czy podpowiedzi bez treści? (testy: ✅ darmowy Gemini, tylko pierwsza para testowa)
4. Model cenowy: freemium i subskrypcja na parę? Jakie funkcje są darmowe?
5. Rynek startowy i język: Polska, czy od razu angielski?
6. Kto przygotuje i zweryfikuje treści o cyklu i wskazówki (specjaliści)?
7. Czy partner bez cyklu też dostaje "wskazówki dla drugiej strony", np. z check-inu i obciążenia?
8. Czy aplikacja ma działać także dla jednej osoby, zanim partner dołączy?
9. Kto buduje: autor sam, zespół, czy agencja? Jaki budżet i termin MVP?
10. Nazwa aplikacji.

## 11. Kryteria sukcesu MVP 💡

- Obie osoby z pary aktywne po 4 tygodniach (np. ≥ 50% par).
- Check-in wypełniany przez oboje w ≥ 60% tygodni.
- Osoba z cyklem ocenia wskazówki dla partnera jako trafne i nienachalne (ankieta w aplikacji).
- Mierzalna zmiana w podziale obciążenia mentalnego po 6 tygodniach.
