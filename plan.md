# plan.md: Parapka — plan techniczny MVP

Wersja 0.1 · Data: 2026-11-04 · Status: szkic do akceptacji
Źródła: [intent.md](intent.md) v0.2, [spec.md](spec.md) v0.1. Odwołania w formie (spec §N) i identyfikatory wymagań pochodzą ze specyfikacji.

---

## 1. Cel planu i sposób pracy

Specyfikacja opisuje, co ma robić MVP. Ten plan opisuje, w jakiej kolejności i w jakich kawałkach to powstaje. Kod powstaje przez [wieloagentowy pipeline SDLC](https://github.com/devTomaszStoklosa/sdlc-multi-agent-pipeline), więc plan dzieli MVP na issue, które pipeline przeprowadzi od planu do PR.

### 1.1 Zasady dla issue

- **Rozmiar:** jedno issue zmienia jeden pakiet i mieści się w limitach bazy organizacji: do 10 plików i 400 zmienionych linii. Większa zmiana to kilka issue.
- **Treść:** każde issue ma sekcje Kontekst (odwołania do specyfikacji), Zakres (pakiet i katalog), Kryteria akceptacji (w formie „zakładając … gdy … wtedy …” albo sprawdzalny warunek) i Poza zakresem. Wzorem jest #5.
- **Najpierw logika, potem ekrany:** reguły domenowe, synchronizacja i kryptografia powstają jako czysty TypeScript z testami, zanim pojawi się aplikacja. Agenci nie uruchamiają emulatorów ani przeglądarki z interfejsem, więc ekrany mają testy Vitest, a człowiek sprawdza je w przeglądarce (do M9 nie na telefonie).
- **High-impact:** nowy `package.json`, nowa zależność, kryptografia (`packages/crypto/**`), relay (`services/relay/**`), migracje (`**/migrations/**`) i biblioteka treści (`content/**`) zawsze wymagają akceptacji planu (`.sdlc-agents.yml`, FR-6.1 pipeline'u).
- **Role:** etykietę `agent:ready` dodaje Claude w ramach autonomii w tym repozytorium. Akceptację planu (`plan:approved`) i merge robi autor.

### 1.2 Etapy

| Etap | Zakres | Zależy od |
|---|---|---|
| M0 | Podłączenie do pipeline'u (#1, #2) | — |
| M1 | Logika domenowa i synchronizacji w czystym TypeScript | M0 |
| M2 | Biblioteka treści, testy treści i silnik wskazówek | M1 |
| M3 | Kryptografia | M1 |
| M4 | Protokół i relay | M3 |
| M5 | Aplikacja web: fundament | M1, M3, M4 |
| M6 | Parowanie, zgody i synchronizacja | M4, M5 |
| M7 | Panele MVP | M2, M6 |
| M8 | Powiadomienia w aplikacji, kontrola danych i testy end-to-end w przeglądarce | M7 |
| M9 | Android i iOS | M8 |

M2 i M3 mogą iść równolegle po M1, a M4 po M3. M5 zależy też od M4, bo przeglądarka wymaga relaya gotowego dla web (CORS, uwierzytelnienie WebSocket bez nagłówków, uruchamianie lokalne). Aplikację budujemy najpierw w przeglądarce, a buildy na Androida i iPhone'a oraz moduły natywne są ostatnim etapem (M9). Pipeline prowadzi jeden przebieg naraz, więc równoległość dotyczy kolejności w backlogu, a nie jednoczesnych przebiegów.

## 2. Decyzje

| Temat | Decyzja | Powód | Odrzucone |
|---|---|---|---|
| Repozytorium | Monorepo npm workspaces: `packages/*` (biblioteki), później `services/relay` i `apps/mobile`. Nowy katalog w `workspaces` to zmiana głównego `package.json`, więc high-impact. | Wspólne typy i testy, jeden zestaw bramek pipeline'u, sprawdzonego na TypeScript z npm. | Osobne repozytoria (każde podłączane do pipeline'u osobno). |
| Warstwy (spec §7.2) | `packages/domain` (reguły paneli), `packages/sync` (HLC, scalanie, kolejki), `packages/crypto` (jedyny użytkownik libsodium), `packages/protocol` (schematy kopert i API wspólne dla relaya i aplikacji), `content/` (biblioteka treści). | Czyste pakiety testowane bez telefonu; zależności wstrzykiwane przez interfejsy (`Clock`, `RandomSource`, `Sodium`). | Jeden pakiet na całą logikę (rozmyta odpowiedzialność, trudniejsze limity high-impact). |
| Kryptografia (NFR-PRV-06) | Interfejs `Sodium` w `packages/crypto`; w testach i na web implementacja na `libsodium-wrappers-sumo`, na telefonach (M9) na `react-native-libsodium`. Wektory testowe dla kopert i kodu bezpieczeństwa. | Ten sam kod w przeglądarce, React Native i Node; obie biblioteki pochodzą z rejestru npm, więc działają w sandboxie i na liście hostów pipeline'u. | Własne algorytmy (zakazane w NFR-PRV-06); WebCrypto (brak XChaCha20 i `crypto_kx`). |
| Relay (N-1, technologia) | Node.js 22 z TypeScript, Fastify z WebSocketem, baza `node:sqlite` za interfejsem magazynu kopert. | Ten sam stack co reszta i pipeline; `node:sqlite` nie ma natywnego dodatku, więc instalacja nie pobiera binariów spoza rejestru npm. W Node 22 moduł jest eksperymentalny, dlatego magazyn stoi za interfejsem i da się go wymienić. | Go albo Rust (drugi stack poza sprawdzonym kontraktem bramek); PostgreSQL od razu (osobna usługa i koszt przy jednej parze testowej); `better-sqlite3` (natywny dodatek z binariami pobieranymi przy instalacji). |
| Relay (N-1, hosting) | Otwarte; decyzja przed udostępnieniem poza pierwszą parę testową, z warunkiem UE (A21) i umową powierzenia (spec §9). | Na etapie testów relay może działać lokalnie i na najtańszym serwerze w UE. | — |
| Najpierw web | Aplikacja w Expo SDK 58 (React Native 0.88) z React Native Web w `apps/mobile`, testowana najpierw w przeglądarce. Na web adaptery: `Sodium` na `libsodium-wrappers-sumo`, `KeyStore` i zaszyfrowana baza na IndexedDB (klucz losowy 256 bitów, rekordy szyfrowane XChaCha20-Poly1305). Na telefonach w M9 adaptery natywne: `react-native-libsodium`, SQLCipher, Keychain/Keystore. | Agenci i autor sprawdzają aplikację bez telefonu na każdym kroku; spike potwierdził build web, import pakietów `@parapka/*` (mały resolver Metro dla importów `./x.js` → `./x.ts`) i działanie libsodium w przeglądarce. Moduły natywne wchodzą, gdy reszta jest gotowa. | Od razu development build na telefon (wymaga telefonu autora na każdym kroku). |
| Baza w aplikacji (NFR-PRV-01) | Na web zaszyfrowana baza na IndexedDB (patrz „Najpierw web”), tylko do testów. Na telefonach `expo-sqlite` z SQLCipher, potwierdzenie w spike'u M9.1, zapas: `op-sqlite`. | Biblioteka Expo z obsługą SQLCipher, mniej natywnej konfiguracji. Za jednym interfejsem repozytoriów warstwy `data` wymiana adaptera nie dotyka ekranów. | Baza bez szyfrowania z szyfrowaniem pól (sprzeczne z NFR-PRV-01). |
| Testy aplikacji | Logika i ekrany w Vitest (jsdom, alias `react-native` → `react-native-web`). Ekrany nie importują modułów `expo-*` bezpośrednio, tylko przez adaptery wstrzykiwane w korzeniu aplikacji. Testy end-to-end w przeglądarce (Playwright, dwa konteksty przeglądarki i lokalny relay) uruchamiane poza bramkami pipeline'u (M8). | Bramki pipeline'u znają jedno polecenie `test` i jeden raport pokrycia; pobranie przeglądarki dla Playwrighta nie jest na liście hostów. | `jest-expo` jako drugi runner (wymaga uzgodnienia skryptów bramek). |
| Pokrycie | Polecenie `coverage` wraca do `.sdlc-agents.yml` zaraz po pierwszym kodzie na `main` (#5). | Raport z drzewa bez plików ma `pct: "Unknown"`, a bramka pokrycia pipeline'u odrzuca go jako błąd. | — |

## 3. Backlog

Numer w kolumnie „Issue” oznacza istniejące issue. Pozostałe pozycje stają się issue przy rozpoczęciu etapu. „HI” oznacza zmianę high-impact.

### M1. Logika domenowa i synchronizacji

| # | Issue | Wymagania | Pakiet | HI |
|---|---|---|---|---|
| 1 | Hybrid Logical Clock (#5) | spec §7.5, A4 | `sync` (nowy) | tak |
| 2 | Polecenie `coverage` w `.sdlc-agents.yml` | NFR-QA-01 | konfiguracja | tak |
| 3 | Identyfikatory UUIDv7 z wstrzykiwanym zegarem i losowością | spec §3 | `domain` | nie |
| 4 | Prognoza cyklu: długość, następna miesiączka, zakres niepewności | FR-CYC-01, FR-CYC-02, spec §7.7 | `domain` | nie |
| 5 | Fazy cyklu i cykl nieregularny | FR-CYC-02, FR-CYC-04, spec §7.7 | `domain` | nie |
| 6 | Reguły powtarzania obowiązków i wystąpienia | FR-CHR-01, FR-CHR-03 | `domain` | nie |
| 7 | Odpowiedzialny za wystąpienie i adresaci przypomnień | FR-CHR-04, FR-CHR-05 | `domain` | nie |
| 8 | Podział obciążenia mentalnego i migawka tygodniowa | FR-MNT-04, FR-MNT-05, FR-MNT-06 | `domain` | nie |
| 9 | Okno check-inu i blokada edycji | FR-CHK-01, FR-CHK-04, FR-CHK-06 | `domain` | nie |
| 10 | Scalanie zmian per pole i tombstone | spec §7.5, NFR-SYNC-03 | `sync` | nie |
| 11 | Encje tylko do dopisywania: odhaczenia i zmiany nosiciela | spec §7.5, FR-CHR-03, FR-MNT-02 | `sync` | nie |

### M2. Treści i silnik wskazówek

| # | Issue | Wymagania | Pakiet | HI |
|---|---|---|---|---|
| 1 | Format biblioteki treści ze schematem i walidacją | spec §7.6, spec §8 | `content/` | tak |
| 2 | Testy treści: zakazane frazy, długość, formy gramatyczne | NFR-QA-02, FR-CYC-03, FR-CYC-09, FR-CYC-10, ZP-5 | `content/` | tak |
| 3 | Silnik wskazówek: reguły, wybór kategorii i szablonu | FR-CYC-08, FR-CHK-08, spec §7.6, R-1 | `domain` | nie |
| 4 | Robocze treści oznaczone jako niezweryfikowane | spec §8 | `content/` | tak |

Treści o cyklu i wskazówki pisze lub poprawia człowiek. Agent może przygotować wersje robocze, ale każda trafia do przeglądu autora, a przed udostępnieniem poza pierwszą parę testową do przeglądu specjalistów (spec §8, §9).

### M3. Kryptografia

| # | Issue | Wymagania | Pakiet | HI |
|---|---|---|---|---|
| 1 | Pakiet `crypto` z interfejsem `Sodium` i implementacją do testów | NFR-PRV-06 | `crypto` (nowy) | tak |
| 2 | Klucze urządzenia i kod bezpieczeństwa pary | spec §7.3, FR-PAIR-02 | `crypto` | tak |
| 3 | Zaproszenie: sekret i zaszyfrowanie kluczy osoby przyjmującej | spec §7.3, FR-PAIR-01 | `crypto` | tak |
| 4 | Koperty: kierunkowe klucze pary, XChaCha20-Poly1305, wektory testowe | spec §7.4, NFR-QA-01 | `crypto` | tak |
| 5 | Zapieczętowanie check-inu | spec §7.4, FR-CHK-03 | `crypto` | tak |

### M4. Protokół i relay

| # | Issue | Wymagania | Pakiet | HI |
|---|---|---|---|---|
| 1 | Pakiet `protocol`: schematy kopert i API z wersją schematu | spec §7.4, NFR-SYNC-05 | `protocol` (nowy) | tak |
| 2 | Szkielet relaya, rejestracja urządzenia, uwierzytelnienie podpisem | spec §7.3, A10, NFR-PRV-03 | `services/relay` | tak |
| 3 | Zaproszenia i skrzynka pary | FR-PAIR-01, FR-PAIR-02, FR-PAIR-09 | `services/relay` | tak |
| 4 | Koperty: wysyłka, pobieranie, potwierdzenie, TTL, limit rozmiaru | NFR-SYNC-02, spec §7.4 | `services/relay` | tak |
| 5 | Zamknięcie skrzynki i usunięcie urządzenia | FR-PAIR-07, FR-SEC-04 | `services/relay` | tak |
| 6 | WebSocket i push bez treści | FR-NOT-02, A7 | `services/relay` | tak |
| 7 | Logi bez treści i retencja | NFR-PRV-05 | `services/relay` | tak |

### M5. Aplikacja web: fundament

| # | Issue | Wymagania | Pakiet | HI |
|---|---|---|---|---|
| 1 | Szkielet `apps/mobile` (Expo SDK 58, React Native Web, resolver Metro) i adaptery web: `Sodium`, `KeyStore`, zaszyfrowana baza na IndexedDB | NFR-PRV-06, R-7 | `apps/mobile` (nowy) | tak |
| 2 | Nawigacja pięciu zakładek, tłumaczenia i formy gramatyczne | spec §5.0, NFR-UX-04, NFR-UX-05 | `apps/mobile` | nie |
| 3 | Warstwa `data`: repozytoria i migracje | NFR-PRV-01 | `apps/mobile` | tak |
| 4 | Blokada aplikacji PIN-em | FR-SEC-01, FR-SEC-06 | `apps/mobile` | nie |
| 5 | Onboarding | FR-ONB-01 do FR-ONB-07, FR-SEC-07 | `apps/mobile` | nie |
| 6 | Relay gotowy dla przeglądarki: CORS, uwierzytelnienie WebSocket bez nagłówków, uruchamianie lokalne | spec §7.3, NFR-QA-03 | `services/relay` | tak |

Dane w przeglądarce służą tylko do testów, nie dla prawdziwych par (patrz rozdz. 5). Biometria, zasłona w przełączniku (`FLAG_SECURE`) i Keychain/Keystore wchodzą w M9.

### M6 do M8

Issue powstaną po M5, gdy fundament będzie działał w przeglądarce. Zakres:

- **M6:** parowanie kodem QR i linkiem (FR-PAIR-01, FR-PAIR-02, FR-PAIR-08, FR-PAIR-09), ekran zgód (FR-PAIR-03, FR-PAIR-05), pauza (FR-PAIR-06), przeniesienie prywatnych pozycji (FR-PAIR-04), kolejka wysyłki i odbioru (NFR-SYNC-01, NFR-SYNC-03, NFR-SYNC-04), rozłączenie (FR-PAIR-07). W przeglądarce kod QR jest wyświetlany, a parowanie działa też z wklejonego linku; skanowanie aparatem wchodzi w M9.
- **M7:** planer obowiązków (FR-CHR), obciążenie mentalne (FR-MNT), check-in (FR-CHK), cykl i wskazówki (FR-CYC), ekran Dziś (spec §5.0).
- **M8:** powiadomienia w aplikacji, tryb dyskretny i godziny ciszy (FR-NOT-01, FR-NOT-04 do FR-NOT-07), usuwanie i eksport danych (FR-SEC-04, FR-SEC-05), raport badawczy i ankieta wskazówek (spec §10, FR-CYC-12), testy end-to-end w przeglądarce: Playwright, dwa konteksty i lokalny relay, poza bramkami pipeline'u (NFR-QA-03), lista kontrolna przed udostępnieniem (spec §9).

### M9. Android i iOS

Ostatni etap, gdy reszta jest gotowa. Spike „development build na telefonie” (dawniej M5.1) przechodzi tutaj. Zakres:

- **M9.1:** spike: development build z SQLCipher, `react-native-libsodium` i Keychain/Keystore (R-7, NFR-PRV-01, NFR-PRV-02); prowadzi autor z Claude lokalnie, poza pipeline'em, bo wymaga budowania na telefon.
- **M9.2:** adaptery natywne `Sodium`, `KeyStore` i bazy (SQLCipher) za interfejsami z M5.
- **M9.3:** biometria (FR-SEC-01) oraz zasłona w przełączniku z `FLAG_SECURE` (FR-SEC-02).
- **M9.4:** powiadomienia push bez treści: APNs i FCM, rozszerzenie powiadomień na iOS (FR-NOT-02, FR-NOT-03).
- **M9.5:** skanowanie kodu QR aparatem (FR-PAIR-01).
- **M9.6:** wyłączenie kopii zapasowych (NFR-PRV-02) i zachowanie w tle.
- **M9.7:** wspierane wersje systemów i orientacja ekranu (NFR-PLAT-01), sprawdzane już w development buildzie.
- **M9.8:** test end-to-end na dwóch emulatorach z lokalnym relayem (NFR-QA-03) i przygotowanie do sklepów.

## 4. Śledzenie wymagań

| Wymagania | Etap |
|---|---|
| FR-ONB-01 do FR-ONB-07 | M5 |
| FR-PAIR-01, FR-PAIR-02 | M3 (kryptografia), M4 (relay), M6 (ekrany), M9 (skanowanie QR aparatem) |
| FR-PAIR-03 do FR-PAIR-09 | M4 (relay), M6 |
| FR-CYC-01, FR-CYC-02, FR-CYC-04 | M1 (logika), M7 (ekrany) |
| FR-CYC-03, FR-CYC-09, FR-CYC-10 | M2 (testy treści), M7 |
| FR-CYC-05 do FR-CYC-07, FR-CYC-11 do FR-CYC-15 | M7 |
| FR-CYC-08 | M2 |
| FR-CHK-01, FR-CHK-04, FR-CHK-06 | M1, M7 |
| FR-CHK-02, FR-CHK-05, FR-CHK-07, FR-CHK-09 | M7 |
| FR-CHK-03 | M3, M7 |
| FR-CHK-08 | M2 |
| FR-CHR-01, FR-CHR-03 do FR-CHR-05 | M1, M7 |
| FR-CHR-02, FR-CHR-06 do FR-CHR-10 | M7 |
| FR-MNT-02, FR-MNT-04 do FR-MNT-06 | M1, M7 |
| FR-MNT-01, FR-MNT-03, FR-MNT-07, FR-MNT-08 | M7 |
| FR-NOT-01, FR-NOT-04 do FR-NOT-07 | M8 |
| FR-NOT-02, FR-NOT-03 | M4 (relay), M9 (push) |
| FR-SEC-01 | M5 (PIN), M9 (biometria) |
| FR-SEC-06, FR-SEC-07 | M5 |
| FR-SEC-02 | M9 (zasłona w przełączniku, `FLAG_SECURE`) |
| FR-SEC-03 | wszystkie etapy (kryterium przeglądu: brak lokalizacji, statusu online i potwierdzeń odczytu) |
| FR-SEC-04, FR-SEC-05 | M4 (relay), M8 |
| NFR-PRV-01, NFR-PRV-02 | M9 (M5 tylko adaptery web do testów) |
| NFR-PRV-03, NFR-PRV-05, NFR-PRV-07 | M4 |
| NFR-PRV-04 | wszystkie etapy (brak SDK reklamowych i analitycznych) |
| NFR-PRV-06 | M3 |
| NFR-SYNC-01, NFR-SYNC-04 | M6 |
| NFR-SYNC-02 | M4 |
| NFR-SYNC-03 | M1, M6 |
| NFR-SYNC-05 | M4 |
| NFR-UX-01 do NFR-UX-03, NFR-UX-06 | M7, M8 (testy z użytkownikami) |
| NFR-UX-04, NFR-UX-05 | M5 |
| NFR-PLAT-01 | M9 |
| NFR-PLAT-02 | M5 |
| NFR-QA-01 | M1 do M3 |
| NFR-QA-02 | M2 |
| NFR-QA-03 | M8 (w przeglądarce), M9 (na emulatorach) |

## 5. Ryzyka planu

| Ryzyko | Skutek | Środek zaradczy |
|---|---|---|
| Agenci nie widzą aplikacji | Błędy ekranów wychodzą dopiero przy review | Logika poza komponentami w czystych modułach z testami, ekrany w Vitest (jsdom); każdy PR z ekranem sprawdza autor w przeglądarce, a do M9 nie na telefonie |
| Web nie daje szyfrowania bazy na poziomie SQLCipher ani Keychain | Dane w przeglądarce są słabiej chronione niż na telefonie | Dane w przeglądarce tylko do testów, nie dla prawdziwych par; pełna ochrona dopiero w M9 |
| Zachowanie natywne (tło, push, biometria) niesprawdzone do końca | Błędy widoczne dopiero na telefonie | Weryfikuje dopiero M9; adaptery za interfejsami, żeby wymiana nie dotykała ekranów |
| Pakiety React Native lub Expo pobierają przy instalacji coś spoza rejestru npm | Bramki i sesje agenta padają na liście hostów | Sprawdzenie przy szkielecie M5.1 i w spike'u M9.1; potrzebny host trafia przez PR do bazy organizacji pipeline'u |
| Kryptografia napisana przez agenta | Błąd bezpieczeństwa, którego testy nie łapią | Cały `packages/crypto` jest high-impact, wektory testowe z biblioteki, review autora; przed udostępnieniem poza pierwszą parę testową przegląd osoby z doświadczeniem w kryptografii |
| Treści wskazówek naciskają albo ujawniają fazę | Złamanie ZP-5 i R-1 | Testy treści w CI (M2.2), `content/**` jako high-impact, przegląd człowieka |
| Limity planu Claude Pro | Przebiegi kończą się w `needs-human` | Jeden przebieg naraz, małe issue |
| Brak bramki pokrycia do pierwszego kodu | Pierwsze PR bez porównania pokrycia | M1.2 zaraz po #5 |

## 6. Otwarte decyzje

| Decyzja | Rekomendacja | Potrzebna przed |
|---|---|---|
| Hosting relaya w UE (N-1) | Najtańszy serwer w UE z umową powierzenia; do testów lokalnie | Udostępnieniem poza pierwszą parę testową |
| Biblioteka bazy na telefonach | `expo-sqlite` z SQLCipher, jeśli spike M9.1 się powiedzie; na web IndexedDB | M9.2 |
| Rozszerzenie powiadomień na iOS od razu (N-2) | Na start stały ogólny tekst, rozszerzenie w M9 | M9 |
| Domyślny dzień check-inu (N-4) | Niedziela 19:00 | M7 |
| Czy partner widzi wyłączenie kategorii (N-5) | Neutralny brak danych, jak przy pauzie | M6 |
