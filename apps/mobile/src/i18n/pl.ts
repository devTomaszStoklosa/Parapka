export const pl = {
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
  greeting: {
    ready: {
      feminine: "{name}, jesteś gotowa.",
      masculine: "{name}, jesteś gotowy.",
      neutral: "{name}, masz już wszystko gotowe.",
    },
  },
} as const;
