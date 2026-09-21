export const formatOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const formatShortDate = (dateStr?: string) => {
  if (!dateStr) return "";

  const parts = dateStr.split("-");

  if (parts.length !== 3) return dateStr;

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const mIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  return `${monthNames[mIndex] || parts[1]} ${day}`;
};
