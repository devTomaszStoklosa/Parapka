export const plResearch = {
  title: "Raport do badania",
  show: "Pokaż raport do badania",
  hide: "Ukryj raport do badania",
  contains:
    "Raport to kilka liczb z tego telefonu: od ilu tygodni jesteście w parze, ile dni w czwartym tygodniu aplikacja była otwarta, jaka część tygodni check-inu została odkryta, średnie oceny wskazówek i podział obciążenia mentalnego.",
  excludes:
    "Raport nie zawiera treści, dat, imion ani innych danych prywatnych. Dziennik aktywności zostaje na tym telefonie i nie trafia do partnera.",
  manual:
    "Nic nie jest wysyłane samo. Raport wyjdzie z telefonu dopiero wtedy, gdy wybierzesz „Udostępnij raport” i wskażesz, gdzie go wysłać.",
  noPair: "Raport ma sens po sparowaniu. Wróć tu, gdy będziecie w parze.",
  pairDateUnknown:
    "Data sparowania nie jest znana, więc część liczb jest pusta.",
  loading: "Wczytywanie liczb…",
  share: "Udostępnij raport",
  failed: "Nie udało się. Możesz spróbować jeszcze raz, kiedy chcesz.",
  noData: "brak danych",
  header: "Raport do badania Parapka",
  version: "Wersja raportu",
  labels: {
    weeksSincePairing: "Tygodnie od sparowania",
    activeDaysWeek4: "Dni z aplikacją w 4. tygodniu",
    checkinRevealRate: "Odsetek odkrytych tygodni check-inu",
    hintFeedbackCount: "Liczba ocen wskazówek",
    hintFeedbackAccurate: "Średnia trafność wskazówek (1–5)",
    hintFeedbackNotPushy: "Średnia ocena braku nacisku (1–5)",
    mentalLoadWeek1: "Podział obciążenia w 1. tygodniu (Ty / partner)",
    mentalLoadWeek6: "Podział obciążenia w 6. tygodniu (Ty / partner)",
  },
} as const;
