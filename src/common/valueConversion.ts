export const optionalToNullableInt = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;

  const parsed = parseInt(`${value}`, 10);
  return isNaN(parsed) ? null : parsed;
};
