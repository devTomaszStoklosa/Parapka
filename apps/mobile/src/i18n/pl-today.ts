export const plToday = {
  hint: {
    title: "Wskazówka na dziś · {name}",
    titleNoName: "Wskazówka na dziś od partnera",
    none: "Dziś brak wskazówki",
    reactions: "Twoja reakcja",
    done: "Zrobione",
    notToday: "Nie dziś",
    history: "Poprzednie wskazówki",
    dayLabel: "{weekday}, {date}",
    weekdays: {
      "0": "niedz.",
      "1": "pon.",
      "2": "wt.",
      "3": "śr.",
      "4": "czw.",
      "5": "pt.",
      "6": "sob.",
    },
    failed: "Nie udało się. Spróbuj jeszcze raz.",
    chip: "Wskazówka na dziś",
    privacy:
      "Ta wskazówka powstała na drugim telefonie w Waszej parze. Dane, z których powstała, zostają na tamtym telefonie.",
    categories: {
      relief: "Odciążenie",
      tenderness: "Czułość",
      attention: "Uwaga",
      space: "Przestrzeń",
      appreciation: "Docenienie",
    },
  },
  chores: {
    title: "Obowiązki na dziś",
    today: "Na dziś",
    none: "Na dziś nie masz obowiązków.",
    openPlanner: "Otwórz planer",
  },
} as const;
