/**
 * A lightweight CSV parser/stringifier for the zX application.
 * Handles headers, quoted values, and different newline characters.
 */

export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(csv: string): CsvData {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string) => {
    const result = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = values[i] || ''
    })
    return row
  })

  return { headers, rows }
}

export function stringifyCsv(data: CsvData): string {
  const { headers, rows } = data
  const headerLine = headers.join(',')
  const rowLines = rows.map(row => {
    return headers.map(header => {
      const value = row[header] || ''
      // Basic quote handling if value contains comma or quote
      if (value.includes(',') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }).join(',')
  })
  
  return [headerLine, ...rowLines].join('\n')
}
