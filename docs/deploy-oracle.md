# Wdrożenie na Oracle Cloud Always Free

Jeden serwer, jedna domena: Caddy (automatyczny HTTPS) serwuje wersję web i przekazuje ruch relaya (`/v1/*`, w tym WebSocket, oraz `/health`) do kontenera relaya. Wszystkie adresy w tej instrukcji są zastępcze.

## 1. Konto i instancja

1. Załóż konto na <https://www.oracle.com/cloud/free/>. Jako region domowy wybierz **Germany Central (Frankfurt)** (warunek UE). Regionu nie da się potem zmienić.
2. Utwórz instancję: Compute → Instances → Create instance.
   - Shape: **VM.Standard.A1.Flex** (ARM64, Ampere), np. 2 OCPU / 12 GB RAM.
   - Obraz: **Ubuntu 24.04** (aarch64).
   - Dodaj swój klucz publiczny SSH.
3. Instancje A1.Flex bywają niedostępne (błąd „Out of capacity"). Ponów próbę później albo wybierz inną domenę dostępności (Availability Domain).
4. Zapisz publiczny adres IP instancji (dalej `<IP>`). Warto zamienić go na rezerwowany (Networking → Reserved public IPs), żeby nie zmieniał się po wyłączeniu instancji.

## 2. Porty 80 i 443

Domyślnie Oracle blokuje ruch w dwóch miejscach.

1. **Security List albo NSG**: w sieci VCN dodaj reguły ingress dla `0.0.0.0/0`, TCP, porty docelowe `80` i `443`.
2. **iptables na Ubuntu**: obraz Oracle ma własne reguły. Dodaj wpisy przed regułą `REJECT` i zapisz:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo apt-get install -y iptables-persistent
   sudo netfilter-persistent save
   ```

   Numer pozycji (`6`) sprawdź przez `sudo iptables -L INPUT --line-numbers`: reguły muszą stać przed `REJECT`. Zapisz je (`netfilter-persistent save`) przed instalacją Dockera (krok 4). Porty publikowane przez Dockera idą przez łańcuch FORWARD, w który Docker sam wstawia swoje reguły, więc po instalacji Dockera nie zapisuj reguł ponownie.

## 3. Domena

Potrzebna jest nazwa DNS, której rekord A wskazuje na `<IP>`. Opcja bezpłatna: subdomena z [DuckDNS](https://www.duckdns.org/), np. `moja-parapka.duckdns.org`. Ustaw w niej `<IP>` i poczekaj na propagację. Caddy pobierze certyfikat Let's Encrypt dopiero, gdy domena wskazuje na serwer.

## 4. Docker i repozytorium

```bash
ssh ubuntu@<IP>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # wyloguj się i zaloguj ponownie
git clone <adres-repozytorium> Parapka
cd Parapka/deploy
cp env.example .env
```

W `.env` ustaw `PARAPKA_DOMAIN` na swoją domenę. `RELAY_ALLOWED_ORIGINS` ma wskazywać ten sam adres (`https://<domena>`). W pliku nie ma sekretów.

## 5. Build wersji web

Adres relaya wchodzi do aplikacji przy budowaniu (`EXPO_PUBLIC_RELAY_URL`). Wynik musi trafić do `deploy/web`.

Na serwerze, w kontenerze (bez instalowania Node na hoście; Ubuntu 24.04 ma w repozytorium starszy Node):

```bash
cd ~/Parapka
mkdir -p deploy/web
docker run --rm -v "$PWD":/app -w /app -e EXPO_PUBLIC_RELAY_URL=https://<domena> node:22 \
  sh -c "npm ci && npm run web:build -w @parapka/mobile"
cp -r apps/mobile/dist/. deploy/web/
```

Zamiast kontenera możesz zainstalować Node 22, np. przez NodeSource.

Albo lokalnie, a potem kopia:

```bash
npm ci
EXPO_PUBLIC_RELAY_URL=https://<domena> npm run web:build -w @parapka/mobile
ssh ubuntu@<IP> mkdir -p Parapka/deploy/web
scp -r apps/mobile/dist/. ubuntu@<IP>:Parapka/deploy/web/
```

## 6. Uruchomienie i sprawdzenie

Katalog `deploy/web` musi istnieć przed `docker compose up` (krok 5). Inaczej Docker utworzy pusty katalog należący do roota.

```bash
cd ~/Parapka/deploy
mkdir -p web
docker compose up -d --build
docker compose ps
curl https://<domena>/health      # {"status":"ok"}
```

Otwórz `https://<domena>` w przeglądarce. Relay działa jako użytkownik `node` (nie root), a baza leży w nazwanym wolumenie `relay-data` (`/data/relay.db`), więc przetrwa `docker compose down && docker compose up -d`.

### Test lokalny

Ten sam zestaw uruchomisz lokalnie: w `.env` ustaw `PARAPKA_DOMAIN=localhost` i `RELAY_ALLOWED_ORIGINS=https://localhost`, zbuduj web z `EXPO_PUBLIC_RELAY_URL=https://localhost`, skopiuj go do `deploy/web` i uruchom `docker compose up -d --build`. Caddy użyje własnego, wewnętrznego certyfikatu (przeglądarka zgłosi ostrzeżenie). Otwórz dwa konteksty przeglądarki i sparuj je przez relay.

### Logi

Logi kontenerów rotują się automatycznie: każda usługa (`relay`, `caddy`) trzyma do 3 plików po 10 MB (sterownik `json-file`). Obejrzysz je poleceniem:

```bash
docker compose logs relay           # dodaj -f, aby śledzić na żywo
```

Relay loguje tylko metodę, wzorzec trasy (np. `/v1/pairs/:id/ws`), status i czas żądania. Nie loguje identyfikatorów skrzynek, urządzeń ani zaproszeń, podpisów, tokenów push, treści żądań ani adresów IP. Żądanie bez dopasowanej trasy (404) ma w logu znacznik `unmatched` zamiast adresu. Caddy nie ma logów dostępu.

## 7. Aktualizacja

```bash
cd ~/Parapka
git pull
# zbuduj web ponownie (krok 5), jeśli zmienił się kod aplikacji
cd deploy
docker compose up -d --build
```

## 8. Kopia zapasowa i odtworzenie

`deploy/backup.sh` robi spójną kopię bazy (`VACUUM INTO`) do `deploy/backups/relay-<data>.db` i zostawia 14 najnowszych. Przykładowy wpis crona (`crontab -e`), codziennie o 3:15:

```cron
15 3 * * * /home/ubuntu/Parapka/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
```

Kopie warto okresowo pobierać poza serwer (`scp`).

Odtworzenie bazy z kopii:

```bash
cd ~/Parapka/deploy
docker compose stop relay
docker compose cp backups/relay-<data>.db relay:/data/relay.db
docker compose run --rm --no-deps -u root relay chown node:node /data/relay.db
docker compose start relay
```

## 9. Bezczynna instancja

Oracle może odebrać instancję Always Free uznaną za bezczynną (niskie użycie CPU, sieci i pamięci przez 7 dni). Jak temu zapobiec: przejdź na konto **Pay As You Go**. Zasoby w limitach Always Free nadal nie kosztują, a instancje nie są wtedy odbierane jako bezczynne. Ustaw też budżet z alertem (Billing → Budgets), by nie przekroczyć limitów przez pomyłkę.

## 10. Dane osobowe

Relay widzi wyłącznie zaszyfrowane koperty (spec §7), nie ma dostępu do treści. Mimo to Oracle jest podmiotem przetwarzającym dane (adresy IP, metadane): zaakceptuj umowę powierzenia, czyli Oracle Data Processing Agreement, dostępną w warunkach usług chmurowych Oracle.

## 11. Aplikacja mobilna

Aplikację mobilną buduje się z tym samym adresem relaya: `EXPO_PUBLIC_RELAY_URL=https://<domena>` ustawione przy budowaniu. Szczegóły budowania aplikacji natywnych opisuje osobne zadanie (M9).
