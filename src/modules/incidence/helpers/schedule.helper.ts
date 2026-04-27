export const getScheduleFromTime = (date: Date): number => {
  const hour = new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' })).getHours();
  if (hour <= 1) return 1;
  if (hour <= 3) return 2;
  if (hour <= 5) return 3;
  if (hour <= 7) return 4;
  if (hour <= 9) return 5;
  if (hour <= 11) return 6;
  if (hour <= 13) return 7;
  if (hour <= 15) return 8;
  if (hour <= 17) return 9;
  if (hour <= 19) return 10;
  if (hour <= 21) return 11;
  return 12;
};
