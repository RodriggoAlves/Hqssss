export const parseComicTitle = (filename: string) => {
  // Removes extension
  const name = filename.replace(/\.[^/.]+$/, "");
  
  // Try to match "Series #Issue" or "Series Issue"
  const match = name.match(/^(.*?)\s*(?:#|Vol\.?|v)?\s*(\d+(?:\.\d+)?)\s*(.*)$/i);
  
  if (match) {
    return {
      series: match[1].trim() || name,
      issue: match[2].trim(),
      subtitle: match[3].trim()
    };
  }
  
  return {
    series: name,
    issue: "",
    subtitle: ""
  };
};
