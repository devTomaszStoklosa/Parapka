/** The texts of the check-in schedule setting; `pl.checkin` is this object. */
export const plCheckin = {
  title: "Check-in",
  current: "Check-in: {day}, {time}",
  description: "Wspólny dla Was obojga. Zmiana dotyczy też partnera.",
  failed: "Nie udało się. Spróbuj jeszcze raz.",
  dayGroup: "Dzień check-inu",
  hourGroup: "Godzina check-inu",
  minuteGroup: "Minuty check-inu",
  hour: "Godzina {hour}",
  hourEarlier: "Wcześniejsza godzina",
  hourLater: "Późniejsza godzina",
  minute: "Minuta {minute}",
  days: {
    monday: "Poniedziałek",
    tuesday: "Wtorek",
    wednesday: "Środa",
    thursday: "Czwartek",
    friday: "Piątek",
    saturday: "Sobota",
    sunday: "Niedziela",
  },
} as const;
