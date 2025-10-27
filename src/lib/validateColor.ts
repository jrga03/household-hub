/**
 * Color Validation Utilities
 *
 * Validates and sanitizes hex color codes to prevent CSS injection attacks.
 * Category colors come from the database and should be validated before
 * using in inline styles to prevent XSS vulnerabilities.
 *
 * @module validateColor
 */

/**
 * Default fallback color (gray-500) used when validation fails
 */
const DEFAULT_COLOR = "#6B7280";

/**
 * Validates and sanitizes hex color codes to prevent CSS injection.
 * Only allows standard hex formats: #RGB or #RRGGBB
 *
 * While colors come from the database (not direct user input), this provides
 * defense-in-depth security. A malicious database entry could potentially
 * inject CSS via inline styles without validation.
 *
 * @param color - Color string to validate (typically from database)
 * @returns Sanitized hex color or default gray if invalid
 *
 * @example
 * sanitizeHexColor('#FF5733')  // '#FF5733' (valid)
 * sanitizeHexColor('#F37')     // '#F37' (valid short form)
 * sanitizeHexColor('red')      // '#6B7280' (invalid, returns default)
 * sanitizeHexColor('#FF5733; position: fixed') // '#6B7280' (injection attempt blocked)
 * sanitizeHexColor(null)       // '#6B7280' (handles null gracefully)
 * sanitizeHexColor(undefined)  // '#6B7280' (handles undefined gracefully)
 *
 * @security Prevents CSS injection attacks via malicious color values
 */
export function sanitizeHexColor(color: string | null | undefined): string {
  // Handle null/undefined gracefully
  if (!color || typeof color !== "string") {
    return DEFAULT_COLOR;
  }

  // Trim whitespace
  const trimmed = color.trim();

  // Validate hex format: # followed by exactly 3 or 6 hexadecimal digits
  // This regex ensures no additional characters (like semicolons) can slip through
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

  if (hexPattern.test(trimmed)) {
    return trimmed;
  }

  // Log warning in development for debugging (production builds will strip this)
  if (import.meta.env.DEV) {
    console.warn(
      `[validateColor] Invalid color format: "${color}". Using default ${DEFAULT_COLOR}`
    );
  }

  return DEFAULT_COLOR;
}

/**
 * Type guard for valid hex colors.
 * Useful in TypeScript for narrowing types based on validation.
 *
 * @param color - Color string to check
 * @returns True if color is a valid hex format
 *
 * @example
 * const color = getCategoryColor();
 * if (isValidHexColor(color)) {
 *   // TypeScript knows color is valid here
 *   applyColor(color);
 * } else {
 *   // Handle invalid color
 *   applyColor(DEFAULT_COLOR);
 * }
 */
export function isValidHexColor(color: string): boolean {
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  return hexPattern.test(color);
}

/**
 * Validates color and throws descriptive error if invalid.
 * Useful for form validation where you want to show specific errors to users.
 *
 * @param color - Color string to validate
 * @throws {Error} If color format is invalid
 *
 * @example
 * try {
 *   validateColorOrThrow(userInput);
 *   await saveCategory({ color: userInput });
 * } catch (error) {
 *   setFormError(error.message);
 * }
 */
export function validateColorOrThrow(color: string): void {
  if (!isValidHexColor(color)) {
    throw new Error(`Invalid color format: "${color}". Expected hex format like #FF5733 or #F37`);
  }
}

/**
 * Re-export default color for convenience
 */
export { DEFAULT_COLOR };
