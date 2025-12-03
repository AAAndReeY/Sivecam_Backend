export const getShiftFromTime = (date: Date): number => {
  const hour = Number(date.toISOString().split('T')[1].split(':')[0]);
  if (hour >= 6 && hour < 14) return 1;
  if (hour >= 14 && hour < 22) return 2;
  return 3;
};
