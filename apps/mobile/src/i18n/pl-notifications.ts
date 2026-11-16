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
  banner: {
    close: "Zamknij",
  },
} as const;
