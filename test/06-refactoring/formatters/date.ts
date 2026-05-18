export function formatDate(dateStr: string): string {
  if (!dateStr) return '';

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return '';
}