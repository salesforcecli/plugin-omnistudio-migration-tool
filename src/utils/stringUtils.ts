/**
 * Replaces placeholders in a string with corresponding values from arguments.
 * Placeholders are in the format {key}.
 *
 * @param formatString The string containing placeholders (e.g., "Hello, {name}!")
 * @param args Either an object where keys match placeholders, or a rest parameter array where indices match placeholders.
 * @returns The formatted string.
 */
export function formatUnicorn(
  formatString: string,
  ...args: Array<string | number | Record<string, string | number>>
): string {
  let str = formatString.toString();

  if (args.length > 0) {
    const actualArgs = typeof args[0] === 'string' || typeof args[0] === 'number' ? args : args[0];

    for (const key in actualArgs) {
      if (Object.prototype.hasOwnProperty.call(actualArgs, key)) {
        str = str.replace(new RegExp('\\{' + key + '\\}', 'gi'), String(actualArgs[key]));
      }
    }
  }

  return str;
}

export function getMigrationHeading(name: string): string {
  if (name.toLowerCase().includes('data')) {
    return 'Data Mappers';
  } else if (name.toLowerCase().includes('flexcard')) {
    return 'Flexcards';
  } else if (name.toLowerCase().includes('omniscript')) {
    return 'Omniscripts';
  } else if (name.toLowerCase().includes('integration')) {
    return 'Integration Procedures';
  } else if (name.toLowerCase().includes('number')) {
    return 'Omni Global Auto Numbers';
  } else {
    return name;
  }
}

/**
 * Escapes HTML special characters to prevent XSS and ensure content is displayed as plain text.
 * Converts characters like <, >, &, ", ' to their HTML entity equivalents.
 *
 * @param text - The text to escape
 * @returns The escaped HTML string
 */
export function escapeHtml(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips HTML tags and decodes common HTML entities for clean plain-text output (e.g., CSV values).
 *
 * @param str - The string potentially containing HTML
 * @returns The plain-text string
 */
export function stripHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Escapes a value for CSV format.
 * Wraps in quotes if it contains commas, quotes, or newlines.
 *
 * @param value - The value to escape
 * @returns The CSV-safe string
 */
export function escapeCSVValue(value: string): string {
  if (value == null) return '""';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const AssessmentStatusPriority = {
  Failed: 0,
  'Needs manual intervention': 1,
  Warnings: 2,
  'Ready for migration': 3,
};

export function getUpdatedAssessmentStatus(
  currentStatus: 'Warnings' | 'Needs manual intervention' | 'Ready for migration' | 'Failed',
  newStatus: 'Warnings' | 'Needs manual intervention' | 'Ready for migration' | 'Failed'
): 'Warnings' | 'Needs manual intervention' | 'Ready for migration' | 'Failed' {
  const currentPriority = AssessmentStatusPriority[currentStatus];
  const newPriority = AssessmentStatusPriority[newStatus];
  return currentPriority > newPriority ? newStatus : currentStatus;
}
