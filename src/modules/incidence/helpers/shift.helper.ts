export const getShiftFromTime = (date: Date): number => {
  const hour = new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' })).getHours();
  if (hour >= 6 && hour < 14) return 1;
  if (hour >= 14 && hour < 22) return 2;
  return 3;
};
