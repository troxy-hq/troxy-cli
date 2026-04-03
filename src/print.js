/** Print a simple ASCII table. */
export function table(headers, rows) {
  const cols = headers.length;
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length))
  );

  const line = () => '  ' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '';
  const row  = (cells, pad = ' ') =>
    '  ' + cells.map((c, i) => ` ${String(c ?? '').padEnd(widths[i], pad)} `).join('│');

  console.log(row(headers));
  console.log('  ' + widths.map(w => '─'.repeat(w + 2)).join('┼'));
  rows.forEach(r => console.log(row(r)));
  console.log();
}
