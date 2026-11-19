# Ocena skutków dla ochrony danych (DPIA) — szkic

> **SZKIC — wymaga przeglądu prawnika.**
> Dokument opisuje stan techniczny aplikacji na gałęzi `main` (spec §9, ryzyko R-6). Nie jest oceną zgodności z prawem ani gotową DPIA. Wszystkie oceny prawne, w tym ocena ryzyka i wniosek o konieczności konsultacji z organem nadzorczym: do weryfikacji z prawnikiem. Fakty o danych pochodzą z `docs/data-inventory.md` (dalej: „inwentarz”); opis dla użytkownika jest w `docs/privacy-policy.md`, a rejestr czynności w `docs/records-of-processing.md`. Pola, których nie da się ustalić z kodu, oznaczono `[DO UZUPEŁNIENIA]`.

## 1. Opis przetwarzania

**Czym jest aplikacja.** Parapka to aplikacja dla par, która pomaga dzielić obowiązki i „rzeczy do pamiętania”, a opcjonalnie wspiera partnera w rozumieniu cyklu drugiej osoby. Dane dotyczące cyklu i samopoczucia mogą być danymi o zdrowiu (art. 9 RODO), więc przetwarzanie jest traktowane jako wysokiego ryzyka. Ocena kategorii: do weryfikacji z prawnikiem.

**Gdzie leżą dane** (szczegóły w inwentarzu):

| Miejsce | Co tam jest | Źródło |
|---|---|---|
| Telefon | lokalna baza rekordów (profil, zgody, obowiązki, check-in, cykl, wskazówki, ustawienia) oraz osobny magazyn kluczy | inwentarz §1 |
| Relay | losowe identyfikatory urządzeń i skrzynek, klucze publiczne, zaszyfrowane koperty, token i platforma push, rozmiar i czas | inwentarz §2 |
| Logi relaya | metoda, wzorzec trasy, status, czas obsługi; bez IP, nagłówków i treści | inwentarz §3 |
| Hosting | baza i logi relaya, kopie `deploy/backup.sh`, adresy IP i metadane ruchu po stronie infrastruktury dostawcy | inwentarz §4, `docs/deploy-oracle.md` (sekcje 1 i 10) |

**Osoby, których dotyczy przetwarzanie:** użytkownicy w parach (osoba z cyklem i jej partner). Dane partnera na telefonie to wyłącznie to, co partner zgodził się udostępnić (inwentarz §1.1, kolumna „Wspólne”).

**Przepływ.** Dane cyklu zostają na telefonie osoby z cyklem. Do partnera trafia tylko wskazówka (tekst, kategoria, dzień, status) jako zaszyfrowana koperta przez relay (inwentarz §1.4, kolumna „Sync”). Relay przekazuje koperty, nie odszyfrowuje ich (inwentarz §2).

**Hosting:** Oracle Cloud Always Free, region Frankfurt (`docs/deploy-oracle.md`, sekcja 1). Wybór dostawcy i regionu UE jest decyzją N-1 (`plan.md` §6), otwartą przed udostępnieniem poza pierwszą parę testową.

## 2. Niezbędność i proporcjonalność

| Pytanie | Stan techniczny | Odnośnik |
|---|---|---|
| Czy relay jest potrzebny? | Dwa telefony nie mają wspólnego serwera; relay przekazuje zaszyfrowane koperty także wtedy, gdy partner jest offline (okno do 30 dni). | spec §7.1, NFR-SYNC-02; inwentarz §2 |
| Czy dane cyklu muszą opuszczać telefon? | Nie. Wychodzi tylko wskazówka: tekst, kategoria, dzień i status — bez fazy, dat miesiączki, objawów i wartości z wpisów. | FR-CYC-09; `apps/mobile/src/cycle/hint-codec.ts`; inwentarz §1.4 |
| Czy relay musi znać treść i tożsamość? | Nie. Zna losowe identyfikatory, klucze publiczne, szyfrogramy, rozmiar, czas i tokeny push. | NFR-PRV-03; inwentarz §2 |
| Czy potrzebne są analityka i śledzenie? | Nie ma ich. Brak SDK reklamowych, analitycznych i zewnętrznego zgłaszania awarii; brak lokalizacji, statusu „online” i potwierdzeń odczytu. | NFR-PRV-04, FR-SEC-03; inwentarz §5 |
| Czy dane są przechowywane dłużej niż trzeba? | Koperty do potwierdzenia, najwyżej 30 dni; zamknięta skrzynka najwyżej 30 dni; dane techniczne najwyżej 14 dni (z wyjątkami w §6). | NFR-SYNC-02, NFR-PRV-05; inwentarz §2 |
| Czy użytkownik może wycofać dane? | Tak: „Usuń wszystkie moje dane”, rozłączenie pary, eksport. Usunięcie u partnera tylko w miarę możliwości technicznych. | FR-SEC-04, FR-SEC-05, FR-PAIR-07 |

Ocena, czy cele i zakres są proporcjonalne oraz czy podstawą jest zgoda z art. 9 ust. 2 lit. a: do weryfikacji z prawnikiem.

## 3. Ryzyka dla osób

Skala wpływu i prawdopodobieństwa: `[DO UZUPEŁNIENIA]` przez właściciela i prawnika. Poniżej tylko opis ryzyka i odnośnik do środków z §4.

| # | Ryzyko dla osoby | Skąd się bierze (fakt) | Środki (§4) |
|---|---|---|---|
| D-1 | Ujawnienie danych cyklu osobom trzecim | dane cyklu i samopoczucia leżą w lokalnej bazie; kopia danych cyklu wychodzi z aplikacji tylko w pliku eksportu (FR-SEC-05, `apps/mobile/src/data-control/export-data.ts`), a raport do badań nie zawiera danych cyklu, tylko liczby (spec §10, `apps/mobile/src/research/report-text.ts`; inwentarz §1.4, §1.6) | S-1, S-2, S-5, S-8 |
| D-2 | Presja w związku: partner żąda dostępu do danych albo wymusza ich udostępnienie | partner widzi tylko udostępnione kategorie i wskazówki; reakcje na wskazówki zostają tylko lokalnie (inwentarz §1.4) | S-2, S-7 |
| D-3 | Odgadnięcie fazy cyklu przez partnera ze wzoru wskazówek (R-1) | wskazówki mają kategorię i dzień (inwentarz §1.4) | S-2 |
| D-4 | Metadane relaya (R-6): relay wie, że dwa pseudonimowe urządzenia tworzą parę, kiedy wysyłają koperty i jak duże | tabele `mailboxes` i `envelopes` (inwentarz §2); adresy IP po stronie infrastruktury dostawcy (inwentarz §4) | S-1, S-3, S-4, S-9 |
| D-5 | Utrata lub przejęcie odblokowanego telefonu | dane lokalne dostępne po odblokowaniu aplikacji; PIN 6 cyfr (inwentarz §1) | S-5, S-6, S-7 |
| D-6 | Dane w przeglądarce bez sprzętowej ochrony kluczy | w wersji web klucze leżą w IndexedDB (inwentarz §1, „Magazyn kluczy”); wersja web jest tylko do testów | brak środka sprzętowego; zob. RS-9 |
| D-7 | Powiadomienie na ekranie blokady zdradza treść lub fakt używania aplikacji | powiadomienia tworzy telefon lokalnie (inwentarz §1.5) | S-6 |
| D-8 | Dane partnera zostają na telefonie po rozłączeniu | usunięcie u partnera działa tylko jako polecenie, gdy telefon jest osiągalny (FR-PAIR-07) | S-7 |
| D-9 | Wyciek kopii zapasowej relaya lub kopii pobranej poza serwer | `deploy/backup.sh` trzyma 14 kopii; kopie poza serwerem trzeba objąć usuwaniem (inwentarz §4) | S-3 |

## 4. Istniejące środki

Wszystkie ścieżki są względem korzenia repozytorium i istnieją na `main`.

| # | Środek | Wymaganie spec | Kod | Test | Fakt w inwentarzu |
|---|---|---|---|---|---|
| S-1 | Szyfrowanie end-to-end kopert; relay nie zna treści | NFR-PRV-06, NFR-PRV-03 | `packages/crypto/src/envelope.ts` (libsodium, XChaCha20-Poly1305) | `packages/crypto/src/envelope.test.ts` | §2 |
| S-2 | Minimalizacja: do partnera idzie tylko wskazówka; reakcja na wskazówkę zostaje lokalnie | FR-CYC-09, R-1 | `apps/mobile/src/cycle/hint-codec.ts`, `hint-reaction-repository.ts` | `hint-codec.test.ts`, `hint-privacy.test.ts`, `hint-reaction-repository.test.ts` (wszystkie w `apps/mobile/src/cycle/`) | §1.4 |
| S-3 | Retencja na relayu: koperty do potwierdzenia, najwyżej 30 dni; zamknięta skrzynka najwyżej 30 dni; dane techniczne najwyżej 14 dni | NFR-SYNC-02, NFR-PRV-05 | `services/relay/src/envelopes.ts`, `services/relay/src/retention.ts` | `services/relay/src/envelopes.test.ts`, `services/relay/src/retention.test.ts` | §2 |
| S-4 | Logi bez IP, nagłówków i identyfikatorów, tylko wzorce tras; rotacja 3 × 10 MB | NFR-PRV-05 | `services/relay/src/logging.ts`, `deploy/docker-compose.yml` | `services/relay/src/logging.test.ts` | §3 |
| S-5 | Blokada PIN: 6 cyfr, hash `pwhash`, 5 prób bez opóźnienia, potem 30 s / 60 s / 5 min | FR-SEC-01 | `apps/mobile/src/lock/lock-state.ts`, `pin-store.ts` | `apps/mobile/src/lock/lock-state.test.ts`, `pin-store.test.ts` | §1.1 (`lock`) |
| S-6 | Tryb dyskretny domyślnie włączony; godziny ciszy 22:00–07:00 | FR-NOT-04 | `apps/mobile/src/notifications/notification-settings.ts`, `quiet-hours.ts`, `delivery.ts` | `notification-settings.test.ts`, `quiet-hours.test.ts`, `delivery.test.ts` (w `apps/mobile/src/notifications/`) | §1.5 |
| S-7 | Usuwanie wszystkich danych: sprawdzenie relaya, rozłączenie z poleceniem do partnera, usunięcie urządzenia na relayu, wyczyszczenie bazy i kluczy; gdy relay jest nieosiągalny, telefon nie jest czyszczony | FR-SEC-04, FR-PAIR-07 | `apps/mobile/src/data-control/delete-all.ts` | `apps/mobile/src/data-control/delete-all.test.ts`, `services/relay/src/delete-all.integration.test.ts` | §1 („Usuwanie”), §2 |
| S-8 | Raport do badań liczony lokalnie, wychodzi tylko po kliknięciu udostępnienia | spec §10 | `apps/mobile/src/research/ResearchReport.tsx` | `apps/mobile/src/research/ResearchReport.test.tsx` | §1.6 |
| S-9 | Brak analityki i zewnętrznego zgłaszania awarii; zależności nie zawierają takich pakietów (`apps/mobile/package.json`, `services/relay/package.json`) | NFR-PRV-04 | `apps/mobile/package.json`, `services/relay/package.json` | brak testu; kontrola przeglądem zależności | §5 |
| S-10 | Brak pól lokalizacji, statusu obecności i potwierdzeń odczytu w modelu danych i API relaya | FR-SEC-03 | `services/relay/migrations/*.sql` | brak testu; kontrola przeglądem schematu | §5 |

Wersja web (tylko do testów): klucze w IndexedDB bez sprzętowej ochrony (`apps/mobile/src/platform/indexeddb-key-store.ts`, test `indexeddb-key-store.test.ts`). Szyfrowana baza SQLCipher, Keychain/Keystore i wyłączone kopie systemowe są w M9 (NFR-PRV-01, NFR-PRV-02) i przed udostępnieniem poza pierwszą parę testową wymagają potwierdzenia (`docs/release-checklist.md`, uwagi).

## 5. Push (M9)

- **W wersji web pushy nie ma.** Powiadomienia w wersji web tworzy lokalnie telefon lub przeglądarka (`apps/mobile/src/platform/web-notifier.ts`); relay nie wysyła pushy do przeglądarek.
- **Wysyłka push przez APNs i FCM jeszcze nie istnieje.** W repozytorium jest tylko interfejs `PushSender` (`services/relay/src/push.ts`); implementacja wchodzi w M9.4. Ładunek push ma być stałym znacznikiem `sync`, bez identyfikatorów i treści (FR-NOT-02; inwentarz §2, „Push”).
- **Relay już dziś ma pola na token i platformę push** (tabela `devices`, inwentarz §2; spec: `PUT /v1/devices/{id}/push-token`). Token trafi do Apple lub Google dopiero po wdrożeniu M9.4. Token jest identyfikatorem urządzenia, więc jego przekazanie to osobna kwestia prawna.
- **Analiza przekazania tokenów do Apple i Google jest otwarta**: kto jest administratorem i odbiorcą, podstawa, przekazanie poza EOG, informacja dla użytkownika. Do weryfikacji z prawnikiem, po powstaniu wysyłki w M9.4 (`docs/release-checklist.md`, poz. 4).
- Alternatywa z napięcia 1 (spec §12): brak pushy i synchronizacja tylko przy otwarciu aplikacji. Decyzja ⚠️ do potwierdzenia przez właściciela.
- Wniosek wstępny dla D-4: dopóki wysyłki push nie ma, tokenów nikomu nie przekazujemy; DPIA trzeba zaktualizować przy M9.4.

## 6. Ryzyko szczątkowe

| # | Ryzyko szczątkowe | Dlaczego zostaje | Odnośnik |
|---|---|---|---|
| RS-1 | Relay widzi metadane: kto z kim ma skrzynkę, kiedy i jak duże koperty wysyła | architektura wymaga pośrednika; E2E chroni treść, nie metadane (R-6) | inwentarz §2; spec §11 R-6 |
| RS-2 | Koperty i zamknięte skrzynki mogą leżeć do 30 dni, czyli dłużej niż 14 dni z NFR-PRV-05 | okno na odbiór przez offline'owego partnera; wymaga jawnego opisu w polityce | inwentarz §2 („Retencja”); NFR-SYNC-02 |
| RS-3 | Rotacja logów ogranicza rozmiar (3 × 10 MB), nie czas; zgodność z 14 dniami zależy od natężenia ruchu | sterownik `json-file` nie ma limitu wieku | inwentarz §3; `docs/deploy-oracle.md` („Logi”) |
| RS-4 | Kopie `deploy/backup.sh` (do 14 dni) i kopie pobrane poza serwer zawierają dane z relaya | kopie zapasowe są potrzebne do odtworzenia; egzemplarze poza serwerem trzeba objąć usuwaniem | inwentarz §4 |
| RS-5 | Usunięcie danych u partnera po rozłączeniu jest możliwe tylko w miarę możliwości technicznych | polecenie czeka na relayu do 30 dni; telefon partnera może go nie odebrać | FR-PAIR-07; spec §12, napięcie 2 |
| RS-6 | Token urządzenia nie wygasa automatycznie; urządzenie na relayu jest usuwane tylko przy usunięciu danych | brak automatycznego wygaszania (inwentarz §2, tabela `devices`) | inwentarz §2 |
| RS-7 | Kolekcja `activity-log` nie jest ujęta w eksporcie; zakres pól do opisania | stan na `main` | inwentarz §1.6 |
| RS-8 | PIN 6-cyfrowy może zostać odgadnięty przez kogoś z dostępem do odblokowanego telefonu i dużą liczbą prób | ostatni krok opóźnienia (5 min) powtarza się bez limitu łącznej liczby prób (`lock-state.ts`) | FR-SEC-01 |
| RS-9 | W wersji web klucze są w IndexedDB bez sprzętowej ochrony | wersja tylko do testów, nie dla prawdziwych par | `plan.md`; inwentarz §1 |

## 7. Otwarte punkty dla prawnika i właściciela

| # | Punkt | Kto | Odnośnik |
|---|---|---|---|
| O-1 | Umowa powierzenia z dostawcą hostingu relaya (Oracle Data Processing Agreement): akceptacja i dowód | właściciel; ocena: prawnik | `docs/deploy-oracle.md` (sekcja 10); `docs/release-checklist.md`, poz. 4 |
| O-2 | Potwierdzenie regionu UE (Frankfurt) i decyzja N-1 (dostawca hostingu) | właściciel | `docs/deploy-oracle.md` (sekcja 1); `plan.md` §6 |
| O-3 | Analiza przekazania tokenów push do Apple i Google (M9.4) | prawnik, po wdrożeniu wysyłki | §5; `services/relay/src/push.ts` |
| O-4 | Podstawa prawna i zakres zgody z art. 9; czy wymagana jest konsultacja z organem nadzorczym | prawnik | `docs/release-checklist.md`, poz. 1 i 10 |
| O-5 | Ocena okna 30 dni dla kopert i zamkniętych skrzynek oraz rotacji logów ograniczonej rozmiarem | prawnik, właściciel | RS-2, RS-3 |
| O-6 | Okres przechowywania kopii zapasowych i kopii poza serwerem | właściciel | RS-4; `deploy/backup.sh` |
| O-7 | Skala wpływu i prawdopodobieństwa ryzyk z §3; wnioski końcowe DPIA | właściciel, prawnik | §3 |
| O-8 | Administrator, kontakt, inspektor ochrony danych (jeśli wymagany) | właściciel | `docs/privacy-policy.md`, §1 i §8 |
| O-9 | Spójność z polityką prywatności i rejestrem czynności po ich uzupełnieniu | właściciel | `docs/privacy-policy.md`, `docs/records-of-processing.md` |
