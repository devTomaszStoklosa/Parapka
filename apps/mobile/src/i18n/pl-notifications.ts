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
