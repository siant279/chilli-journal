/** Strip the auto-generated stats block from the top of a journal entry body. */

export function isStatsHeaderLine(line: string): boolean {
  const t = line.trim()
  return (
    /^Start:\s/.test(t) ||
    /^Location:\s/.test(t) ||
    /^Weather:\s/.test(t) ||
    /^Distance:\s/.test(t) ||
    /^Moving time:\s/.test(t) ||
    /^Elapsed:\s/.test(t) ||
    /^Elevation gain:\s/.test(t)
  )
}

export function stripLeadingStatsHeader(entry: string): string {
  const lines = entry.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }
    if (isStatsHeaderLine(line)) {
      i++
      continue
    }
    break
  }
  return lines.slice(i).join('\n').trimStart()
}
