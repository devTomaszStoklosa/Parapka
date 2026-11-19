# Rejestr czynności przetwarzania dla relaya (szkic)

> **SZKIC — wymaga przeglądu prawnika przed publikacją.**
> Szkic rejestru z art. 30 RODO dla relaya. Opisuje stan techniczny na gałęzi `main`; nie jest oceną zgodności z prawem. Wszystkie oceny prawne: do weryfikacji z prawnikiem. Źródło faktów: `docs/data-inventory.md` (dalej: „inwentarz”). Politykę dla osoby opisuje `docs/privacy-policy.md`.

## Administrator

- Administrator: `[DO UZUPEŁNIENIA]`
- Adres i dane kontaktowe: `[DO UZUPEŁNIENIA]`
- Inspektor ochrony danych (jeśli wymagany): `[DO UZUPEŁNIENIA]`
- Podmiot przetwarzający: dostawca hostingu, Oracle Cloud Always Free, region Frankfurt (`docs/deploy-oracle.md`; inwentarz §4). Umowa powierzenia: stan podpisania `[DO UZUPEŁNIENIA]`.

## Czynności

Wszystkie czynności dotyczą osób korzystających z aplikacji w parze. Dane treści są szyfrowane end-to-end na telefonach; relay nie odszyfrowuje kopert (inwentarz §2).

| Czynność | Cel | Kategorie osób i danych | Odbiorcy | Przekazania poza EOG | Terminy usunięcia | Środki bezpieczeństwa |
|---|---|---|---|---|---|---|
| Rejestracja urządzenia i uwierzytelnianie | rozpoznanie urządzenia, ochrona dostępu | użytkownicy; losowy identyfikator urządzenia, klucz publiczny podpisu, czas rejestracji, wyzwania (inwentarz §2: `devices`, `challenges`) | hosting (Oracle) | brak według dokumentu wdrożenia (region Frankfurt, `docs/deploy-oracle.md`); ocena: do weryfikacji z prawnikiem | urządzenie: do usunięcia („Usuń wszystkie moje dane”); wyzwania: 5 minut | brak imion, e-maili, numerów telefonu (NFR-PRV-03); podpisy kluczem urządzenia; limit zapytań na urządzenie w pamięci (inwentarz §2) |
| Parowanie | połączenie dwóch urządzeń w parę | użytkownicy; identyfikator zaproszenia i urządzenia, zapieczętowane klucze urządzenia B (relay ich nie czyta) (inwentarz §2: `invitations`) | hosting (Oracle) | jak wyżej | 24 godziny | klucze zapieczętowane, nieczytelne dla relaya |
| Skrzynka pary | powiązanie urządzeń i dostarczanie kopert | użytkownicy; powiązanie dwóch identyfikatorów urządzeń, czasy (inwentarz §2: `mailboxes`) | hosting (Oracle) | jak wyżej | do rozłączenia; zamknięta skrzynka najwyżej 30 dni na odbiór (`CLOSING_TTL_MS`) | usunięcie urządzenia i rozłączenie z aplikacji (`apps/mobile/src/data-control/delete-all.ts`) |
| Przekazywanie zaszyfrowanych kopert | dostarczenie danych jednej osoby jej partnerowi, w tym gotowych wskazówek zdrowotnych (RODO art. 9) | użytkownicy; zaszyfrowana treść, rozmiar, czas, identyfikator nadawcy w kopercie (inwentarz §2: `envelopes`). Dane cyklu źródłowe nie opuszczają telefonu, w kopercie jest tylko gotowa wskazówka (`apps/mobile/src/cycle/hint-codec.ts`; inwentarz §1.4) | hosting (Oracle); partner z pary | jak wyżej | do potwierdzenia odbioru przez partnera, najwyżej 30 dni (`ENVELOPE_TTL_DAYS`, `packages/protocol/src/limits.ts`) | szyfrowanie end-to-end (libsodium, `packages/crypto/src/envelope.ts`); zgoda z FR-PAIR-03. Okres 30 dni > 14 dni (NFR-PRV-05): do weryfikacji z prawnikiem |
| Tokeny push (od M9) | powiadomienia push bez treści | użytkownicy; platforma i token push (inwentarz §2: `devices`) | hosting; Apple (APNs) i Google (FCM) od M9.4 | tak, możliwe przekazanie tokenów Apple i Google; analiza: do weryfikacji z prawnikiem | do usunięcia urządzenia | ładunek push to stały znacznik `sync`, bez identyfikatorów i treści (`services/relay/src/push.ts`). Wysyłka jeszcze nie istnieje (interfejs `PushSender`) |
| Logi techniczne relaya | diagnostyka i bezpieczeństwo działania | użytkownicy; metoda HTTP, wzorzec trasy, status, czas obsługi, numer żądania, typ i kod błędu (inwentarz §3; `services/relay/src/logging.ts`) | hosting (Oracle) | jak wyżej | rotacja: 3 pliki po 10 MB (`docs/deploy-oracle.md`, „Logi”); granica 14 dni (NFR-PRV-05) niepotwierdzona czasowo, rotacja zależy od rozmiaru | brak adresów IP, identyfikatorów, nagłówków i treści w logach; Caddy bez logów dostępu |
| Kopie zapasowe bazy relaya | odtworzenie po awarii | jak w tabelach `devices`, `invitations`, `mailboxes`, `envelopes` (inwentarz §4) | hosting (Oracle); właściciel, jeśli pobiera kopie poza serwer (`scp`) | jak wyżej | 14 najnowszych kopii (`deploy/backup.sh`); zamknięte skrzynki i koperty starsze niż 14 dni mogą istnieć w kopii do rotacji; egzemplarze poza serwerem trzeba usuwać osobno | kopia tych samych danych, z zaszyfrowanymi kopertami; liczniki żądań poza kopią (`retention.ts`) |
| Hosting relaya | udostępnienie infrastruktury | użytkownicy; baza relaya, logi kontenerów, adresy IP i metadane ruchu na poziomie infrastruktury Oracle (inwentarz §4) | Oracle jako podmiot przetwarzający | brak według dokumentu wdrożenia (Frankfurt); ocena: do weryfikacji z prawnikiem | według czynności powyżej; dane infrastruktury Oracle: `[DO UZUPEŁNIENIA]` | HTTPS przez Caddy; umowa powierzenia (Oracle Data Processing Agreement, `docs/deploy-oracle.md`, sekcja 10), stan `[DO UZUPEŁNIENIA]` |

## Czego relay nie przetwarza

- Danych cyklu w postaci źródłowej (`cycle-settings`, `period-logs`, `wellbeing-entries`): zostają na telefonie (inwentarz §1.4).
- Imion, e-maili i numerów telefonu (inwentarz §2; NFR-PRV-03).
- Lokalizacji, statusu obecności i potwierdzeń odczytu (inwentarz §5; FR-SEC-03).
- Analityki, reklam i zewnętrznego zgłaszania awarii (inwentarz §5; NFR-PRV-04).

## Prawa osób

Eksport: `apps/mobile/src/data-control/export-data.ts` (FR-SEC-05). Usunięcie: `apps/mobile/src/data-control/delete-all.ts` (FR-SEC-04). Opis dla osoby: `docs/privacy-policy.md`, sekcja 7.

## Do rozstrzygnięcia

- Dane administratora i podstawa prawna dla danych technicznych.
- Okres 30 dni, retencja logów i kopii (inwentarz §2, §3, §4).
- Umowa powierzenia z Oracle i analiza tokenów push (`docs/release-checklist.md`, poz. 4).
