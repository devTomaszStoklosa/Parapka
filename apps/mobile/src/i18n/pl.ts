export const pl = {
  app: {
    loading: "Wczytywanie…",
    error: "Nie udało się uruchomić aplikacji. Spróbuj otworzyć ją ponownie.",
  },
  home: {
    title: "Parapka",
    subtitle: "Aplikacja dla par",
    hintWindow: "Okno podpowiedzi (dni):",
  },
  tabs: {
    today: "Dziś",
    cycle: "Cykl",
    planner: "Planer",
    head: "Głowa",
    settings: "Ustawienia",
  },
  screens: {
    today: { title: "Dziś" },
    cycle: { title: "Cykl" },
    planner: { title: "Planer" },
    head: { title: "Głowa" },
    settings: { title: "Ustawienia" },
    push: "Otwórz ekran",
    pop: "Wstecz",
    depth: "Poziom stosu: {level}",
  },
  pairing: {
    title: "Para",
    invite: "Zaproś partnera",
    cancel: "Anuluj",
    retry: "Spróbuj ponownie",
    close: "Zamknij",
    paste: {
      label: "Wklej link zaproszenia",
      connect: "Połącz",
    },
    newInvite: "Nowe zaproszenie",
    paired: "Jesteście w parze.",
    unavailable:
      "Nie można teraz połączyć się z serwerem. Sprawdź internet i spróbuj później.",
    invitation: {
      title: "Zaproszenie",
      instruction:
        "Poproś partnera, aby zeskanował ten kod w aplikacji albo otworzył link.",
      qrLabel: "Kod QR z zaproszeniem",
      copy: "Kopiuj link",
      copied: "Link skopiowany.",
      copyFailed: "Nie udało się skopiować linku. Spróbuj jeszcze raz.",
      expires: "Ważne do {time}",
      waiting: "Czekamy na partnera…",
    },
    safety: {
      title: "Kod bezpieczeństwa",
      instruction:
        "Porównaj ten kod z kodem na telefonie partnera. Jeśli są takie same, potwierdź.",
      same: "Kody są takie same",
      different: "Różnią się",
    },
    rejected:
      "Para została odrzucona. Kody się różniły, więc nic nie zostało zapisane.",
    errors: {
      alreadyPaired: "Najpierw rozłącz obecną parę.",
      expired: "Zaproszenie wygasło.",
      offline: "Brak połączenia z serwerem. Spróbuj ponownie za chwilę.",
      invalidInvitation:
        "To nie jest poprawne zaproszenie. Poproś partnera o nowe.",
      inviterPaired: "Ta osoba jest już w parze z kimś innym.",
      invalid:
        "Odpowiedź partnera jest nieprawidłowa. Utwórz nowe zaproszenie.",
    },
  },
  consent: {
    title: "Co widzi partner",
    intro:
      "Zdecyduj osobno, co z tego, co wpisujesz, zobaczy partner. Nic nie jest wysyłane, dopóki nie zapiszesz wyboru.",
    always:
      "Twoje imię i forma gramatyczna są zawsze udostępniane partnerowi, bo bez nich aplikacja nie może zwracać się do Was poprawnie.",
    deletion:
      "Gdy wyłączysz kategorię albo się rozłączycie, poprosimy urządzenie partnera o usunięcie tych danych. Jest to możliwe tylko w miarę możliwości technicznych, więc nie możemy tego zagwarantować.",
    changeLater: "Zgody zmienisz w każdej chwili w Ustawienia → Prywatność.",
    save: "Zapisz wybór",
    saveFailed: "Nie udało się zapisać wyboru. Spróbuj jeszcze raz.",
    settings: {
      title: "Prywatność",
      none: "Zgody ustalisz po połączeniu w parę.",
    },
    categories: {
      CYCLE_HINTS: {
        title: "Wskazówki dotyczące cyklu",
        description:
          "Partner zobaczy tylko tekst wskazówki na dziś i historię 14 dni, bez dat i danych cyklu.",
      },
      CHECKIN: {
        title: "Wspólne sprawdzenie samopoczucia",
        description:
          "Partner zobaczy Twoje odpowiedzi dopiero, gdy oboje je wypełnicie.",
      },
      SHARED_CHORES: {
        title: "Wspólne obowiązki",
        description:
          "Partner zobaczy obowiązki, które dzielicie, wraz z tym, kto je wykonuje.",
      },
      SHARED_MENTAL_LOAD: {
        title: "Wspólne obciążenie mentalne",
        description:
          "Partner zobaczy sprawy, które dzielicie, i to, kto się nimi zajmuje.",
      },
      ONBOARDING_GOALS: {
        title: "Cele ze startu",
        description:
          "Partner zobaczy cele wybrane na początku, w tej samej formie, w jakiej je wpisano.",
      },
    },
  },
  lock: {
    veil: "Parapka jest zablokowana, gdy nie jest na pierwszym planie.",
    pin: {
      unlockTitle: "Podaj PIN",
      currentTitle: "Podaj obecny PIN",
      newTitle: "Ustaw nowy PIN",
      setTitle: "Ustaw PIN",
      confirmTitle: "Powtórz PIN",
      digit: "Cyfra {position} z 6",
      mismatch: "Wpisane PIN-y różnią się. Wpisz nowy PIN jeszcze raz.",
      wrong: "To nie jest zapisany PIN. Spróbuj jeszcze raz.",
      delay: "Kolejna próba będzie możliwa za {seconds} s.",
      forgot: "Nie pamiętam PIN-u",
    },
    reset: {
      title: "Reset aplikacji",
      description:
        "Bez PIN-u nie da się odblokować aplikacji. Reset usuwa z tego urządzenia wszystkie dane lokalne i klucze. Tej operacji nie można cofnąć.",
      continue: "Rozumiem, dalej",
      confirmTitle: "Potwierdź reset",
      confirmDescription:
        "Zostaną usunięte wszystkie dane i klucze na tym urządzeniu. Czy na pewno chcesz zresetować aplikację?",
      confirm: "Tak, usuń wszystko",
      cancel: "Anuluj",
    },
  },
  onboarding: {
    back: "Wstecz",
    next: "Dalej",
    finish: "Zaczynamy",
    stepOf: "Krok {current} z {total}",
    name: {
      title: "Jak mamy się do Ciebie zwracać?",
      hint: "Wystarczy samo imię albo przezwisko. Możesz je później zmienić.",
      label: "Imię",
    },
    form: {
      title: "W jakiej formie mamy do Ciebie mówić?",
      hint: "Dzięki temu teksty w aplikacji będą brzmiały naturalnie.",
    },
    formFeminine: "Żeńskiej („jesteś gotowa”)",
    formMasculine: "Męskiej („jesteś gotowy”)",
    formNeutral: "Neutralnej („masz wszystko gotowe”)",
    adult: {
      title: "Pełnoletność",
      hint: "Parapka jest przeznaczona dla osób, które skończyły 18 lat.",
      confirm: {
        feminine: "Potwierdzam, że jestem pełnoletnia",
        masculine: "Potwierdzam, że jestem pełnoletni",
        neutral: "Potwierdzam, że mam skończone 18 lat",
      },
      required: "Bez tego potwierdzenia nie możemy iść dalej.",
    },
    tenure: {
      title: "Jak długo jesteście razem?",
      hint: "Odpowiedz tak, jak czujesz. Nie ma tu dobrych ani złych odpowiedzi.",
      "<1": "Krócej niż rok",
      "1-3": "1–3 lata",
      "3-7": "3–7 lat",
      "7-15": "7–15 lat",
      "15+": "15 lat i więcej",
    },
    children: {
      title: "Czy macie dzieci?",
      yes: "Tak",
      no: "Nie",
      count: "Liczba dzieci",
      invalid: "Podaj liczbę dzieci od 1 do 20.",
    },
    goals: {
      title: "Co jest dla Was teraz ważne?",
      hint: "Możesz wybrać kilka rzeczy albo żadnej. Cele są domyślnie prywatne.",
      "time-together": "Czas razem",
      conversation: "Rozmowa",
      chores: "Podział obowiązków",
      closeness: "Bliskość",
      passion: "Namiętność",
      "fewer-arguments": "Mniej kłótni",
      other: "Inne",
      otherLabel: "Co jeszcze jest ważne?",
      share: "Pokaż moje cele partnerowi",
      shareHint: "Wyłączone: cele widzisz tylko Ty.",
    },
    cycle: {
      title: "Czy masz cykl miesiączkowy?",
      hint: "Od tego zależy, czy pokażemy zakładkę Cykl. Możesz to zmienić w Ustawieniach.",
      yes: "Tak, mam cykl",
      no: "Nie",
      "not-now": "Nie teraz",
    },
    disclaimer: {
      title: "Zanim ustawimy cykl",
      text: "To nie jest metoda antykoncepcji ani narzędzie medyczne. Wyliczenia są tylko orientacyjnym szacunkiem.",
      confirm: "Rozumiem",
    },
    cycleSetup: {
      title: "Ustawienia cyklu",
      lastPeriod: "Początek ostatniej miesiączki (RRRR-MM-DD)",
      cycleLength: "Długość cyklu w dniach (21–45)",
      periodLength: "Długość miesiączki w dniach (2–10)",
      unknown: "Nie wiem, zostaw wartości domyślne",
      unknownHint:
        "Zostanie 28 dni cyklu i 5 dni miesiączki, a szacunki będą mniej pewne.",
      invalid:
        "Sprawdź wartości: data ma mieć postać RRRR-MM-DD, a długości mieszczą się w podanych zakresach.",
    },
    pin: {
      title: "Blokada PIN-em",
      text: "Możesz zabezpieczyć aplikację PIN-em. Możesz to też zrobić później w Ustawieniach.",
      set: "Ustaw PIN",
      skip: "Pomiń na razie",
      isSet: "PIN jest ustawiony.",
      isSkipped: "Pominięto. Blokadę włączysz w Ustawieniach.",
    },
    device: {
      title: "Twoje dane są u Ciebie",
      text: "Dane są tylko na tym urządzeniu. Utrata urządzenia to utrata danych prywatnych.",
      partner:
        "Aplikacja działa także bez pary. Partnera możesz dodać później.",
    },
  },
  greeting: {
    ready: {
      feminine: "{name}, jesteś gotowa.",
      masculine: "{name}, jesteś gotowy.",
      neutral: "{name}, masz już wszystko gotowe.",
    },
  },
} as const;
