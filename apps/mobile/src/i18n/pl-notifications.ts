export const plNotifications = {
  choreReminder: {
    title: "Obowiązek: {title}",
    body: "Zajrzyj do Parapki.",
  },
  checkin: {
    title: "Check-in",
    body: "Czas na cotygodniowy check-in.",
  },
  partnerHint: {
    title: "Wskazówka na dziś",
    body: "Wskazówka na dziś jest gotowa",
  },
  wellbeing: {
    title: "Chwila dla siebie",
    body: "Jak się dziś czujesz? Możesz zapisać krótką notatkę.",
  },
  /** The partner took over a thing; the verb follows the form of the partner (NFR-UX-05). */
  handoverTaken: {
    feminine: { title: "{name} przejęła: {title}" },
    masculine: { title: "{name} przejął: {title}" },
    neutral: { title: "{name} przejmuje: {title}" },
    /** The profile of the partner has not arrived yet: no name. */
    anonymous: { title: "Rzecz została przejęta: {title}" },
    body: "Zajrzyj do Parapki.",
    untitled: "rzecz wspólna",
  },
  checkinResults: {
    title: "Wyniki check-inu są gotowe",
    body: "Zajrzyj do Parapki.",
  },
  pairConnected: {
    title: "Para została połączona",
    body: "Zajrzyj do Parapki.",
  },
  pairDisconnected: {
    title: "Para została rozłączona",
    body: "Zajrzyj do Parapki.",
  },
  /** One text for every type in the discreet mode (FR-NOT-04). */
  discreet: {
    title: "Parapka",
    body: "masz nowe przypomnienie",
  },
  digest: {
    title: "Parapka",
    body: "Masz {count} nowe przypomnienia",
  },
  settings: {
    title: "Powiadomienia",
    discreet: {
      label: "Tryb dyskretny",
      hint: "Poza aplikacją widać tylko słowo „Parapka” i tekst „masz nowe przypomnienie”. Szczegóły są dopiero w aplikacji.",
    },
    types: {
      group: "Rodzaje powiadomień",
      "chore-reminder": "Przypomnienia o obowiązkach",
      checkin: "Przypomnienie o check-inie",
      "partner-hint": "Wskazówka na dziś",
      wellbeing: "Przypomnienie o wpisie samopoczucia",
      "handover-taken": "Partner przejmuje rzecz",
      "checkin-results": "Wyniki check-inu są gotowe",
      "pair-status": "Zmiana stanu pary",
    },
    times: {
      title: "Godziny",
      quietFrom: "Cisza od (GG:MM)",
      quietTo: "Cisza do (GG:MM)",
      hintTime: "Godzina wskazówki dnia (GG:MM)",
      hint: "W godzinach ciszy powiadomienia czekają do jej końca.",
      save: "Zapisz godziny",
      invalid: "Wpisz godzinę w formacie GG:MM, na przykład 07:30.",
      failed: "Nie udało się zapisać. Spróbuj ponownie.",
    },
    permission: {
      title: "Powiadomienia w przeglądarce",
      enable: "Włącz powiadomienia",
      granted: "Powiadomienia przeglądarki są włączone.",
      denied:
        "Powiadomienia są zablokowane w tej przeglądarce. Możesz to zmienić w ustawieniach strony: kliknij ikonę kłódki przy adresie i zezwól na powiadomienia.",
      unsupported:
        "Ta przeglądarka nie pokazuje powiadomień systemowych. Gdy aplikacja jest otwarta, pokażemy je jako baner.",
      openTabOnly:
        "W przeglądarce powiadomienia działają tylko przy otwartej karcie z Parapką.",
    },
    failed: "Nie udało się zapisać zmiany. Spróbuj ponownie.",
  },
  banner: {
    close: "Zamknij",
  },
} as const;
