/**
 * Crawler module - handles authentication and page fetching
 */

import { config } from './config.js';
import { parseHtml } from './parser.js';
import crypto from 'crypto';

/**
 * Extracts cookies from response headers
 * @param {Response} response - Fetch API response object
 * @returns {string} Cookie string to be used in subsequent requests
 */
function extractCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie();

  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    return '';
  }

  // Extract cookie name=value pairs (ignore attributes like Path, HttpOnly, etc.)
  const cookies = setCookieHeaders.map(header => {
    const cookiePart = header.split(';')[0];
    return cookiePart.trim();
  });

  return cookies.join('; ');
}

/**
 * Extracts CSRF token from login page HTML
 * @param {string} html - Login page HTML
 * @returns {string|null} CSRF token or null if not found
 */
function extractCsrfToken(html) {
  // Look for: login[_token] in a hidden input field
  const tokenMatch = html.match(/name=["\']login\[_token\]["\'][^>]*value=["\'](.*?)["\']/i) ||
                     html.match(/value=["\'](.*?)["\'"][^>]*name=["\']login\[_token\]["\']/i);

  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1];
  }

  console.warn('Warning: CSRF token not found in login page');
  return null;
}

/**
 * Extracts RSA public key from login page HTML
 * @param {string} html - Login page HTML
 * @returns {string|null} RSA public key or null if not found
 */
function extractPublicKey(html) {
  // Look for the public key in the JavaScript
  const keyMatch = html.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/);

  if (keyMatch && keyMatch[0]) {
    return keyMatch[0];
  }

  console.warn('Warning: RSA public key not found in login page');
  return null;
}

/**
 * Encrypts password using RSA public key
 * @param {string} password - Plain text password
 * @param {string} publicKeyPem - RSA public key in PEM format
 * @returns {string} Base64-encoded encrypted password
 */
function encryptPassword(password, publicKeyPem) {
  try {
    const buffer = Buffer.from(password, 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return encrypted.toString('base64');
  } catch (error) {
    throw new Error(`Password encryption failed: ${error.message}`);
  }
}

/**
 * Step 0: Fetch login page to get CSRF token and RSA public key
 * @returns {Promise<{csrfToken: string, publicKey: string}>}
 */
async function fetchLoginPage() {
  try {
    const response = await fetch(config.loginPageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => 'Could not read response body');
      throw new Error(`Failed to fetch login page: ${response.status} ${response.statusText}. Response: ${bodyText.substring(0, 500)}`);
    }

    const html = await response.text();

    const csrfToken = extractCsrfToken(html);
    const publicKey = extractPublicKey(html);

    if (!csrfToken) {
      throw new Error('CSRF token not found in login page');
    }

    if (!publicKey) {
      throw new Error('RSA public key not found in login page');
    }

    return { csrfToken, publicKey };
  } catch (error) {
    console.error('Fetch login page error details:', {
      message: error.message,
      url: config.loginPageUrl,
      stack: error.stack,
    });
    throw new Error(`Fetch login page error: ${error.message}`);
  }
}

/**
 * Step 1: Perform login and obtain session credentials
 * @param {string} csrfToken - CSRF token from login page
 * @param {string} publicKey - RSA public key from login page
 * @returns {Promise<string>} Cookie string for authenticated requests
 */
async function login(csrfToken, publicKey) {
  try {
    // Encrypt password
    const encryptedPassword = encryptPassword(config.password, publicKey);

    // Prepare form data with correct field names
    const formData = new URLSearchParams({
      'login[_token]': csrfToken,
      'login[username]': config.username,
      'login[password]': config.password,
      'login[encrypted_password]': encryptedPassword,
    });

    const response = await fetch(config.loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Referer': config.loginPageUrl,
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Successful login should return 302 redirect
    if (response.status !== 302) {
      const bodyText = await response.text().catch(() => 'Could not read response body');
      throw new Error(`Login failed: ${response.status} ${response.statusText}. Expected 302 redirect. Response: ${bodyText.substring(0, 500)}`);
    }

    const cookies = extractCookies(response);

    if (!cookies) {
      throw new Error('No session cookies received from login response');
    }

    return cookies;
  } catch (error) {
    console.error('Login error details:', {
      message: error.message,
      url: config.loginUrl,
      stack: error.stack,
    });
    throw new Error(`Login error: ${error.message}`);
  }
}

/**
 * Step 2: Fetch target page using authenticated session
 * @param {string} cookies - Cookie string from login step
 * @returns {Promise<Object>} Parsed response data
 */
async function fetchTargetPage(cookies) {
  try {
    const headers = {
      'Cookie': cookies,
    };

    const response = await fetch(config.targetUrl, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => 'Could not read response body');
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}. Response: ${bodyText.substring(0, 500)}`);
    }

    // Get response as HTML
    const html = await response.text();

    // Parse HTML to extract structured data
    const parsedData = parseHtml(html);

    return parsedData;
  } catch (error) {
    console.error('Fetch target page error details:', {
      message: error.message,
      url: config.targetUrl,
      stack: error.stack,
    });
    throw new Error(`Fetch error: ${error.message}`);
  }
}

/**
 * Main crawl function - performs full crawl workflow
 * @returns {Promise<Object>} Crawl results
 */
export async function crawl() {
  try {
    console.log('Starting crawl...');

    // Step 0: Fetch login page to get CSRF token and RSA public key
    console.log('Step 0: Fetching login page...');
    const { csrfToken, publicKey } = await fetchLoginPage();
    console.log('Login page fetched, CSRF token and RSA key extracted');

    // Step 1: Login
    console.log('Step 1: Authenticating...');
    const cookies = await login(csrfToken, publicKey);
    console.log('Authentication successful');

    // Step 2: Fetch target page
    console.log('Step 2: Fetching target page...');
    const parsedData = await fetchTargetPage(cookies);
    console.log('Target page fetched and parsed successfully');

    return {
      success: true,
      ...parsedData,
    };
  } catch (error) {
    console.error('Crawl failed:', error.message);
    console.error('Error stack:', error.stack);
    return {
      success: false,
      error: error.message,
      errorStack: error.stack,
      errorDetails: {
        name: error.name,
        cause: error.cause,
      },
    };
  }
}
