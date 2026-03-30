/**
 * Configuration module - reads and validates environment variables
 */

export const config = {
  // Server configuration
  port: process.env.PORT || 1010,

  // Authentication credentials
  username: process.env.USERNAME,
  password: process.env.PASSWORD,

  // URLs for crawling
  loginPageUrl: process.env.LOGIN_PAGE_URL || 'https://www.scoalanoua.ro/',
  loginUrl: process.env.LOGIN_URL || 'https://www.scoalanoua.ro/login',
  targetUrl: process.env.TARGET_URL || 'https://www.scoalanoua.ro/elev?summary=1',
};

/**
 * Validates that all required environment variables are set
 * @throws {Error} if required variables are missing
 */
export function validateConfig() {
  const required = ['USERNAME', 'PASSWORD'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
