# Inwentarz danych

Dokument opisuje **stan techniczny** na gałęzi `main`: jakie dane powstają, gdzie leżą i kiedy znikają. Nie jest oceną zgodności z prawem. Jest podstawą dla osobnych zadań: polityki prywatności, rejestru czynności przetwarzania i oceny skutków dla ochrony danych (DPIA). Wszystkie oceny prawne: do weryfikacji z prawnikiem.

Źródła: `apps/mobile/src/**`, `services/relay/migrations/*.sql`, `services/relay/src/logging.ts`, `services/relay/src/retention.ts`, `docs/deploy-oracle.md`, `deploy/backup.sh`, spec §6.1 (NFR-PRV) i §7. Przykłady nie zawierają sekretów ani prawdziwych adresów.

## 1. Telefon (lokalna baza)

Dane leżą w lokalnej bazie rekordów JSON pogrupowanych w kolekcje (`apps/mobile/src/data/local-database.ts`). W wersji web (tylko do testów) baza jest zaszyfrowana na IndexedDB; szyfrowana baza SQLCipher i Keychain/Keystore na telefonach to M9 (NFR-PRV-01).

**Usuwanie.** „Usuń wszystkie moje dane” (`data-control/delete-all.ts`) kończy parę, usuwa urządzenie na relayu, a potem czyści całą bazę i klucze (`lock/reset.ts`: `database.clear()`, `keyStore.clear()`). Reset po zapomnianym PIN-ie robi to samo lokalnie. Wiersze poniżej mówią więc „usuwane” tylko wtedy, gdy mają dodatkowe zdarzenie.

**Eksport.** Kolumna „W eksporcie” pochodzi z `data-control/export-data.ts` (`EXPORTED` i `SKIPPED`).

**Magazyn kluczy.** Klucze nie leżą w kolekcjach, tylko w osobnym magazynie kluczy (`apps/mobile/src/platform/key-store.ts`, w wersji web `indexeddb-key-store.ts`). Są tam: klucze prywatne urządzenia (podpis i uzgadnianie kluczy; `identity/identity.ts`), klucze pary do wysyłania i odbioru (`pairing/pair-repository.ts`) oraz klucz bazy (`data/indexeddb-database.ts`). Leżą poza bazą rekordów, nie są synchronizowane ani eksportowane, a `keyStore.clear()` czyści je przy usunięciu danych i resecie.

Oznaczenia: „wspólne” to dane widoczne dla obojga partnerów; „sync” to wysyłane do partnera jako zaszyfrowane koperty przez relay.

### 1.1 Dane osoby i pary

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `profile` | profil z onboardingu (imię, forma, potwierdzenie pełnoletności) | nie | profil trafia do partnera przez `sync-profile` po zgodzie | usunięciu danych, resecie | tak |
| `consent` | zgody (kategorie), data zapisu `savedAtMs`, wersja tekstu `textVersion` | nie | nie | usunięciu danych, resecie, wycofaniu zgody (`clear`) | tak |
| `identity` | identyfikator urządzenia, klucze publiczne | nie | nie (identyfikator i klucz publiczny są też na relayu) | usunięciu danych, resecie | nie (identyfikatory) |
| `lock` | hash i sól PIN-u | nie | nie | usunięciu danych, resecie | nie |
| `pair` | identyfikator skrzynki pary, klucze publiczne partnera | tak (para) | nie | rozłączeniu pary, usunięciu danych | nie |
| `pair-closing` | znacznik pary, która jest zamykana | nie | nie | zamknięciu skrzynki, usunięciu danych | nie (stan techniczny) |
| `pair-disconnect` | stan rozłączenia | nie | nie | usunięciu danych | nie (stan techniczny) |
| `partner-profile` | profil partnera | dane partnera | tak (odbierane) | rozłączeniu pary, usunięciu danych | nie (dane partnera) |
| `sync-profile` | profil i cele partnera czekające na zgodę | dane partnera | tak (odbierane) | usunięciu danych | nie (dane partnera) |
| `sync-pause` | pauza synchronizacji | nie | nie | usunięciu danych | nie (stan techniczny) |
| `share-private` | techniczny stan przenoszenia prywatnych pozycji do wspólnych | nie | nie | usunięciu danych | nie (stan techniczny) |
| `dump-offer` | techniczny stan propozycji przeniesienia | nie | nie | usunięciu danych | nie (stan techniczny) |

### 1.2 Obowiązki i rzeczy do pamiętania

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `chores` | obowiązki (tytuł, reguła, notatka, przypomnienie); prywatne i wspólne | zależnie od rekordu | wspólne tak | usunięciu danych | tak |
| `chore-completions` | odhaczenia obowiązków obojga | tak | tak | usunięciu danych | tak |
| `mental-load-items` | rzeczy do pamiętania (tytuł, kategoria, waga, termin, stan) | zależnie od rekordu | wspólne tak | usunięciu danych | tak |
| `carrier-changes` | historia zmian osoby niosącej pozycję | tak | tak | usunięciu danych | tak |
| `handover-requests` | prośby o przekazanie pozycji | tak | tak | usunięciu danych | tak |

### 1.3 Check-in

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `checkin-own` | własne odpowiedzi check-inu | nie (do ujawnienia) | po zapieczętowaniu i ujawnieniu (zob. `checkin-sealed`, `checkin-revealed`) | usunięciu danych | tak |
| `checkin-sealed` | zapieczętowane odpowiedzi partnera | dane partnera | tak (odbierane) | usunięciu danych | nie (dane partnera) |
| `checkin-revealed` | ujawnione odpowiedzi partnera | dane partnera | tak (odbierane) | usunięciu danych | nie (dane partnera) |
| `checkin-keys` | klucze zapieczętowania | nie | nie | usunięciu danych | nie (sekret) |
| `checkin-withdrawal` | stan wycofania odpowiedzi | nie | nie | usunięciu danych | nie (stan techniczny) |
| `couple-settings` | wspólny harmonogram check-inu (dzień, godzina) | tak | tak | usunięciu danych | tak |

### 1.4 Cykl i wskazówki

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `cycle-settings` | własne ustawienia cyklu | nie | nie | usunięciu danych | tak |
| `period-logs` | własne wpisy o miesiączce | nie | nie | usunięciu danych | tak |
| `wellbeing-entries` | własne wpisy o samopoczuciu | nie | nie | usunięciu danych | tak |
| `cycle-hints` | wskazówki, które aplikacja przygotowała dla partnera | częściowo (treść wskazówki) | tak | usunięciu danych | tak |
| `cycle-hints-received` | wskazówki otrzymane od partnera | dane partnera | tak (odbierane) | usunięciu danych | nie (dane partnera) |
| `hint-feedback` | własne odpowiedzi ankiety o wskazówkach | nie | nie | usunięciu danych | tak |
| `hint-reactions` | własne reakcje na wskazówki | nie | nie (tylko na tym telefonie, bez obsługi synchronizacji; `apps/mobile/src/cycle/hint-reaction-repository.ts`, ZP-2) | usunięciu danych | tak |
| `hint-withdrawal` | stan wycofania wskazówek | nie | nie | usunięciu danych | nie (stan techniczny) |

### 1.5 Powiadomienia i stan synchronizacji

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `notification-settings` | własne ustawienia powiadomień | nie | nie | usunięciu danych | tak |
| `notification-watch` | stan obserwowania zdarzeń | nie | nie | usunięciu danych | nie (stan techniczny) |
| `notifications-delivered` | stan dostarczonych powiadomień | nie | nie | usunięciu danych | nie (stan techniczny) |
| `notifications-queue` | kolejka powiadomień | nie | nie | usunięciu danych | nie (stan techniczny) |
| `sync-outbox` | kolejka wysyłki (zmiany czekające na wysłanie) | nie | tak (wysyłana) | wysłaniu, usunięciu danych | nie (stan techniczny) |
| `sync-applied` | zapis przyjętych kopert | nie | nie | zmianie pary (`clearEngineState`), usunięciu danych | nie (stan techniczny) |
| `sync-held` | koperty wstrzymane | nie | nie | zmianie pary, usunięciu danych | nie (stan techniczny) |
| `sync-errors` | błędy przetwarzania kopert | nie | nie | zmianie pary, usunięciu danych | nie (stan techniczny) |
| `sync-state` | kursor synchronizacji | nie | nie | zmianie pary, usunięciu danych | nie (stan techniczny) |
| `hlc` | zegar logiczny | nie | nie | usunięciu danych | nie (stan techniczny) |
| `meta`, `schema-version` | tylko wersja schematu bazy (magazyn `meta` adaptera IndexedDB, `data/indexeddb-database.ts`); klucz bazy (`database-key`) leży w magazynie kluczy, nie w `meta` (zob. „Magazyn kluczy”) | nie | nie | `clear()` | nie (stan techniczny) |

### 1.6 Raport badawczy

| Kolekcja | Co zawiera | Wspólne | Sync | Usuwane przy | W eksporcie |
|---|---|---|---|---|---|
| `activity-log` | lokalny dziennik aktywności na potrzeby raportu badawczego (spec §10); tylko lokalnie, bez obsługi synchronizacji (`research/activity-log.ts`) | nie | nie | usunięciu danych (`clear()`) | brak w `EXPORTED` i w `SKIPPED` z `export-data.ts`; zakres pól do opisania przed polityką prywatności |

## 2. Relay

Schemat z `services/relay/migrations/0001_init.sql`, `0002_invitation_accept.sql` i `0003_mailbox_closing.sql`. Relay nie zna imion, e-maili ani numerów telefonu (komentarz w `0001_init.sql`, NFR-PRV-03). Baza to jeden plik SQLite (`/data/relay.db`, wolumen `relay-data`).

| Tabela | Kolumny | Co to jest | Okres przechowywania |
|---|---|---|---|
| `devices` | `device_id`, `signing_public_key`, `push_platform`, `push_token`, `created_at_ms` | losowy identyfikator urządzenia, klucz publiczny podpisu, platforma i token push, czas rejestracji | do usunięcia urządzenia („Usuń wszystkie moje dane”, endpoint usuwania urządzenia); poza tym brak automatycznego wygaszania |
| `challenges` | `challenge_id`, `device_id`, `nonce`, `expires_at_ms` | wyzwania uwierzytelniające | ważne 5 minut (`CHALLENGE_TTL_MS`), po tym usuwane przez `purgeExpired` |
| `invitations` | `invitation_id`, `device_id`, `expires_at_ms`, `accepted_by_device_id`, `encrypted_keys_b` | zaproszenie do parowania; po przyjęciu zawiera zapieczętowane klucze urządzenia B (relay ich nie czyta) | ważne 24 h (`INVITATION_TTL_MS`), po tym usuwane przez `purgeExpired` |
| `mailboxes` | `pair_mailbox_id`, `device_id_a`, `device_id_b`, `created_at_ms`, `closed_at_ms` | skrzynka pary: powiązanie dwóch identyfikatorów urządzeń | otwarta do rozłączenia; zamknięta czeka na odbiór przez partnera najwyżej 30 dni (`CLOSING_TTL_MS`) |
| `envelopes` | `seq`, `envelope_id`, `pair_mailbox_id`, `body`, `received_at_ms` | koperty: zaszyfrowane treści (relay ich nie odszyfrowuje), rozmiar i czas; `body` zawiera m.in. `senderDeviceId` | do potwierdzenia odbioru przez partnera, najwyżej 30 dni (`ENVELOPE_TTL_DAYS` w `packages/protocol/src/limits.ts`) |

Relay trzyma ponadto w pamięci liczniki żądań na urządzenie (limit zapytań). Nie trafiają do bazy ani do kopii zapasowych (`retention.ts`).

**Retencja.** `retention.ts` ustala górną granicę 14 dni dla danych technicznych (NFR-PRV-05). Wymienione okresy (5 minut, 24 godziny) mieszczą się w tej granicy. Okres 30 dni dla kopert i zamkniętych skrzynek jest dłuższy niż 14 dni: to zamierzone okno na odbiór przez offline'owego partnera (spec §7.4), ale należy je jawnie opisać w polityce i DPIA. Do weryfikacji z prawnikiem.

**Push.** Relay przechowuje token push i platformę. Ładunek push to stały znacznik `sync` bez identyfikatorów i treści (`services/relay/src/push.ts`). Implementacja wysyłki do APNs i FCM wchodzi w M9.4; do tego czasu w repozytorium jest tylko interfejs `PushSender`. Analiza przekazywania tokenów do Apple i Google: do weryfikacji z prawnikiem.

## 3. Logi

Logi relaya (`services/relay/src/logging.ts`) zawierają wyłącznie:

| Pole | Zawartość |
|---|---|
| `level`, `time`, `msg` | poziom, czas, stały komunikat: `incoming request`, `request completed`, `request error`, `route not found` |
| `reqId` | kolejny numer żądania w obrębie procesu (np. `req-1`), dodawany domyślnie przez Fastify |
| `req.method` | metoda HTTP |
| `req.url` | wzorzec trasy, np. `/v1/pairs/:id/ws`; dla nieznanej trasy `unmatched` |
| `res.statusCode` | status odpowiedzi |
| `responseTime` | czas obsługi (domyślne pole Fastify) |
| `err.type`, `err.code`, `err.statusCode` | tylko dla błędów, bez komunikatu i stosu |

Nie są logowane: treść żądań, nagłówki (podpis, identyfikator urządzenia), tokeny push, rzeczywiste ścieżki z identyfikatorami, zapytania URL ani adres IP. Pole `hostname` i `pid` są wyłączone (`base: null`).

Rotacja: sterownik `json-file` Dockera trzyma do 3 plików po 10 MB na usługę (`docs/deploy-oracle.md`, sekcja „Logi”). Caddy nie ma logów dostępu. Limit 14 dni dla logów technicznych wynika z NFR-PRV-05; sama rotacja jest ograniczona rozmiarem, nie czasem, więc zgodność okresu z 14 dniami trzeba potwierdzić przy wdrożeniu (do weryfikacji z prawnikiem).

## 4. Dostawca hostingu

- **Dostawca:** Oracle Cloud Always Free, region Frankfurt (`docs/deploy-oracle.md`, sekcja 1). Na jednym serwerze działają Caddy (HTTPS, wersja web) i relay.
- **Dane po stronie dostawcy:** baza relaya z sekcji 2 (wolumen `relay-data`), logi kontenerów z sekcji 3, adresy IP i metadane ruchu sieciowego na poziomie infrastruktury Oracle (`docs/deploy-oracle.md`, sekcja 10).
- **Kopie zapasowe:** `deploy/backup.sh` robi codziennie (przykład crona z dokumentu wdrożenia) spójną kopię bazy do `deploy/backups/relay-<data>.db` i zostawia 14 najnowszych. Kopia zawiera te same tabele co relay, więc podlega tym samym zasadom: zamknięte skrzynki i koperty starsze niż 14 dni mogą jeszcze istnieć w kopii do jej rotacji. Dokument zaleca okresowe pobieranie kopii poza serwer (`scp`); te egzemplarze trzeba objąć usuwaniem.
- **Umowa powierzenia:** dokument wdrożenia każe zaakceptować Oracle Data Processing Agreement. Stan podpisania: wymaga właściciela; ocena: do weryfikacji z prawnikiem.

## 5. Czego brak (stan techniczny)

- Brak SDK reklamowych i analitycznych oraz zewnętrznego zgłaszania awarii (NFR-PRV-04).
- Model danych i API relaya nie mają pól lokalizacji, statusu obecności ani potwierdzeń odczytu (FR-SEC-03).
