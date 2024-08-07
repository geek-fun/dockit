export const optionalToNullableInt = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  return parseInt(`${value}`, 10);
};
