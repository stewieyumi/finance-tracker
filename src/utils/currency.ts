export const formatPHP = (
  amount: number,
  options?: {
    showSign?: boolean;
    decimals?: number;
  }
): string => {
  const decimals = options?.decimals ?? 2;
  const showSign = options?.showSign ?? false;

  const sign = amount < 0 ? "-" : showSign && amount > 0 ? "+" : "";
  const absoluteAmount = Math.abs(amount);

  return `${sign}₱${absoluteAmount.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};