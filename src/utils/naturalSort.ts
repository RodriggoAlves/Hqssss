export const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
};
