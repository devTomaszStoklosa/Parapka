/** The texts of the "Head" screen; `pl.head` is this object. */
export const plHead = {
  empty: "Nic tu jeszcze nie ma. Wpisz pierwszą rzecz, o której pamiętasz.",
  failed: "Nie udało się wczytać rzeczy. Spróbuj ponownie później.",
  categories: {
    children: "Dzieci",
    home: "Dom",
    finances: "Finanse",
    health: "Zdrowie",
    "family-and-friends": "Rodzina i znajomi",
    other: "Inne",
  },
  weights: { "1": "Mała", "2": "Średnia", "3": "Duża" },
  carriers: {
    me: "Ty",
    partner: "Partner",
    both: "Oboje",
    none: "Bez przypisania",
  },
  due: "Termin {date}",
  actions: {
    takeOver: "Przejmuję",
    done: "Załatwione",
    label: "{action}: {title}",
    failed: "Nie udało się. Spróbuj jeszcze raz.",
  },
  archive: {
    title: "Archiwum ({count})",
    closed: "Zamknięto {date}",
  },
  add: {
    title: "Co masz w głowie?",
    submit: "Dodaj",
    more: "Więcej",
    less: "Mniej",
    category: "Kategoria",
    carrier: "Kto nosi w głowie",
    carrierOptions: { me: "Ja", partner: "Partner", both: "Oboje" },
    weight: "Waga",
    dueDate: "Termin (RRRR-MM-DD, może być pusty)",
    errors: {
      titleEmpty: "Wpisz, co chcesz zapamiętać.",
      titleTooLong: "Tytuł może mieć najwyżej 80 znaków.",
      dueDate: "Wpisz termin w formacie RRRR-MM-DD.",
      failed: "Nie udało się. Spróbuj jeszcze raz.",
    },
  },
} as const;
