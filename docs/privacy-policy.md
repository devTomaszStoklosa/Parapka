# Polityka prywatności (szkic)

> **SZKIC — wymaga przeglądu prawnika przed publikacją.**
> Dokument opisuje stan techniczny aplikacji na gałęzi `main`, prostym językiem. Nie jest oceną zgodności z prawem. Wszystkie oceny prawne: do weryfikacji z prawnikiem. Fakty o danych pochodzą z `docs/data-inventory.md` (dalej: „inwentarz”); przy każdym punkcie podajemy sekcję inwentarza albo plik w repozytorium.

## 1. Kto przetwarza Twoje dane

- Administrator danych: `[DO UZUPEŁNIENIA]`
- Adres administratora: `[DO UZUPEŁNIENIA]`
- Kontakt w sprawach prywatności: `[DO UZUPEŁNIENIA]`
- Hosting serwera pośredniczącego (relaya): Oracle Cloud Always Free, region Frankfurt (UE). Szczegóły wdrożenia: `docs/deploy-oracle.md`; inwentarz §4.

Dane przetwarzają trzy miejsca: **Twój telefon**, **relay** (serwer, przez który przechodzą zaszyfrowane wiadomości między Tobą a partnerem) i **hosting**, na którym działa relay.

## 2. Jakie dane i gdzie leżą

### Na Twoim telefonie

Twoje dane leżą w lokalnej bazie na telefonie (inwentarz §1; `apps/mobile/src/data/local-database.ts`). Nie są synchronizowane z partnerem m.in.: zgody, dane cyklu, reakcje na wskazówki, własne odpowiedzi ankiety o wskazówkach, ustawienia powiadomień i blokady oraz prywatne obowiązki i rzeczy do pamiętania (inwentarz §1.1–§1.5).

- **Do partnera trafiają, jako zaszyfrowane koperty przez relay**: Twój profil z onboardingu (dopiero po zgodzie, `sync-profile`; inwentarz §1.1), wspólne obowiązki, ich odhaczenia i wspólne rzeczy do pamiętania (inwentarz §1.2), wspólny harmonogram check-inu oraz Twoje odpowiedzi check-inu po zapieczętowaniu i ujawnieniu (inwentarz §1.3) i gotowa wskazówka (niżej).

- **Dane cyklu** (`cycle-settings`, `period-logs`, `wellbeing-entries`) nie opuszczają telefonu (inwentarz §1.4). To dane o zdrowiu (RODO art. 9).
- **Do partnera trafia tylko gotowa wskazówka**: jej tekst, kategoria, dzień i status (`apps/mobile/src/cycle/hint-codec.ts`, typ `SentHint`). Nie wysyłamy fazy cyklu, szablonu wskazówki ani dat miesiączki (inwentarz §1.4, kolekcja `cycle-hints`).
- **Reakcja na wskazówkę** zostaje na Twoim telefonie (`apps/mobile/src/cycle/hint-reaction-repository.ts`; inwentarz §1.4, `hint-reactions`).
- **Klucze** szyfrujące leżą w osobnym magazynie kluczy na telefonie, nie są synchronizowane ani eksportowane (inwentarz §1, „Magazyn kluczy”).
- **Raport do badań** liczymy lokalnie; to same liczby (`apps/mobile/src/research/`, inwentarz §1.6). Nic z niego nie wychodzi z telefonu, dopóki sama/sam nie klikniesz „udostępnij”.
- **Powiadomienia** są lokalne (`apps/mobile/src/notifications/`; inwentarz §1.5).

Uwaga o stanie technicznym: szyfrowana baza SQLCipher oraz Keychain/Keystore na telefonach to etap M9 (inwentarz §1; `docs/release-checklist.md`, uwagi). Wersja web służy tylko do testów.

### Na relayu

Wszystko, co idzie do partnera, jest szyfrowane end-to-end na Twoim telefonie (libsodium, `packages/crypto/src/envelope.ts`). Relay przechowuje tylko zaszyfrowane koperty i nie umie ich odczytać (inwentarz §2). Relay zna:

| Dane | Po co | Jak długo (inwentarz §2) |
|---|---|---|
| losowy identyfikator urządzenia i klucz publiczny | rozpoznanie urządzenia | do usunięcia urządzenia („Usuń wszystkie moje dane”) |
| wyzwania uwierzytelniające | potwierdzenie, że to Twoje urządzenie | 5 minut |
| zaproszenia do parowania | połączenie z partnerem | 24 godziny |
| skrzynka pary (powiązanie dwóch identyfikatorów urządzeń) | dostarczanie kopert | do rozłączenia; po rozłączeniu najwyżej 30 dni na odbiór przez partnera |
| zaszyfrowane koperty (treść, rozmiar, czas) | dostarczenie danych partnerowi | do potwierdzenia odbioru przez partnera, najwyżej 30 dni |
| token powiadomień push i platforma | powiadomienia push (dopiero od M9) | do usunięcia urządzenia |

Relay nie zna imion, e-maili ani numerów telefonu (inwentarz §2; NFR-PRV-03). Okres 30 dni jest dłuższy niż 14 dni dla danych technicznych; to okno na odbiór przez partnera, który był offline (inwentarz §2, „Retencja”). Ocena: do weryfikacji z prawnikiem.

### Logi i kopie zapasowe

- **Logi relaya** zawierają tylko metodę, wzorzec trasy, status, czas obsługi i numer żądania. Nie ma w nich adresów IP, identyfikatorów ani treści (inwentarz §3; `services/relay/src/logging.ts`). Logi rotują się: 3 pliki po 10 MB. Rotacja zależy od rozmiaru, nie od czasu (inwentarz §3).
- **Kopie zapasowe bazy relaya**: codziennie, 14 najnowszych (inwentarz §4; `deploy/backup.sh`). Kopia zawiera te same tabele co relay, więc zamknięte skrzynki i koperty mogą w niej istnieć do jej rotacji.
- **Hosting** (Oracle) widzi adresy IP i metadane ruchu sieciowego na poziomie infrastruktury (inwentarz §4; `docs/deploy-oracle.md`, sekcja 10).

## 3. Cel i podstawa

- **Dane cyklu** (zdrowie, RODO art. 9): przetwarzamy na podstawie Twojej wyraźnej zgody (art. 9 ust. 2 lit. a), zbieranej na ekranie zgody z zapisem daty i wersji tekstu (`apps/mobile/src/consent/consent-repository.ts`, FR-PAIR-03; `docs/release-checklist.md`, poz. 1). Na relayu dane cyklu są wyłącznie w zaszyfrowanych kopertach i w postaci gotowej wskazówki. Podstawa prawna: do weryfikacji z prawnikiem.
- **Dane techniczne relaya** (identyfikatory, koperty, logi): dostarczanie wiadomości między Tobą a partnerem i bezpieczeństwo działania. Podstawa prawna: `[DO UZUPEŁNIENIA]` (do weryfikacji z prawnikiem).

## 4. Odbiorcy

- Dostawca hostingu relaya: Oracle (inwentarz §4). Umowa powierzenia: stan podpisania `[DO UZUPEŁNIENIA]` (`docs/release-checklist.md`, poz. 4).
- Od etapu M9: Apple i Google jako operatorzy powiadomień push. Ładunek push to stały znacznik bez treści i identyfikatorów (inwentarz §2, „Push”; `services/relay/src/push.ts`). Wersja web nie używa pushy. Analiza przekazywania tokenów: do weryfikacji z prawnikiem.
- Partner z pary dostaje dane wymienione w sekcji 2 jako wysyłane do partnera (inwentarz §1.1–§1.4).

## 5. Brak profilowania i analityki

W aplikacji nie ma SDK reklamowych ani analitycznych ani zewnętrznego zgłaszania awarii (inwentarz §5; NFR-PRV-04). API relaya nie ma pól lokalizacji, statusu obecności ani potwierdzeń odczytu (inwentarz §5; FR-SEC-03).

## 6. Powiadomienia

Powiadomienia są lokalne. Tryb dyskretny jest domyślnie włączony: poza aplikacją widać tylko „Parapka” / „masz nowe przypomnienie” (`apps/mobile/src/notifications/delivery.ts`, `notification-settings.ts`; FR-NOT-04). Godziny ciszy domyślnie: 22:00–07:00 (`apps/mobile/src/notifications/quiet-hours.ts`).

## 7. Twoje prawa i jak z nich skorzystać w aplikacji

- **Przenoszenie danych (eksport)**: aplikacja tworzy plik JSON i oddaje go przez systemowe okno udostępniania, bez danych partnera (`apps/mobile/src/data-control/export-data.ts`; FR-SEC-05). Luki: lokalny dziennik `activity-log` nie wchodzi do eksportu (inwentarz §1.6), a po zapisaniu pliku poza aplikacją nie mamy nad nim kontroli.
- **Usunięcie danych**: „Usuń wszystkie moje dane” (`apps/mobile/src/data-control/delete-all.ts`; FR-SEC-04):
  1. aplikacja sprawdza, czy relay jest osiągalny;
  2. rozłącza parę (polecenie usunięcia trafia do partnera w miarę możliwości technicznych, FR-PAIR-07);
  3. usuwa Twoje urządzenie na relayu;
  4. na końcu czyści bazę i klucze na telefonie.

  Gdy relay jest nieosiągalny, operacja kończy się komunikatem i nie czyści telefonu, abyś mógł/mogła spróbować ponownie. Luka: kopie bazy relaya (14 najnowszych) znikają dopiero przy rotacji (inwentarz §4).
- **Wycofanie zgody**: zgodę można wyczyścić w aplikacji (inwentarz §1.1, `consent`).
- **Skarga do organu nadzorczego** (UODO): `[DO UZUPEŁNIENIA]` (do weryfikacji z prawnikiem).

## 8. Kontakt

`[DO UZUPEŁNIENIA]`

## 9. Znane luki do rozstrzygnięcia przed publikacją

- Podstawa prawna i okres 30 dni dla kopert (inwentarz §2).
- Rotacja logów ograniczona rozmiarem, nie czasem (inwentarz §3).
- Kopie `deploy/backup.sh` i pobrane poza serwer (inwentarz §4).
- Zakres pól `activity-log` i jego brak w eksporcie (inwentarz §1.6).
- Push (APNs, FCM), SQLCipher i Keychain/Keystore: M9.
- Umowa powierzenia z Oracle (inwentarz §4).
