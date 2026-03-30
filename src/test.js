#!/usr/bin/env node
/**
 * End-to-end test script for the crawler
 * Tests each step of the crawling process with assertions
 * Uses real credentials from .env file
 */

import "dotenv/config";
import { config, validateConfig } from "./config.js";
import crypto from "crypto";
import { parseHtml } from "./parser.js";

// ANSI color codes for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, "cyan");
}

function logSuccess(message) {
  log(`  ✓ ${message}`, "green");
}

function logError(message) {
  log(`  ✗ ${message}`, "red");
}

function logWarning(message) {
  log(`  ⚠ ${message}`, "yellow");
}

function assert(condition, message) {
  if (condition) {
    logSuccess(message);
    return true;
  } else {
    logError(message);
    return false;
  }
}

// Extract cookies from response
function extractCookies(response) {
  const setCookieHeaders = response.headers.getSetCookie();
  if (!setCookieHeaders || setCookieHeaders.length === 0) {
    return "";
  }
  const cookies = setCookieHeaders.map((header) => header.split(";")[0].trim());
  return cookies.join("; ");
}

// Extract CSRF token
function extractCsrfToken(html) {
  const tokenMatch =
    html.match(/name=["\']login\[_token\]["\'][^>]*value=["\'](.*?)["\']/i) ||
    html.match(/value=["\'](.*?)["\'"][^>]*name=["\']login\[_token\]["\']/i);
  return tokenMatch ? tokenMatch[1] : null;
}

// Extract RSA public key
function extractPublicKey(html) {
  const keyMatch = html.match(
    /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/,
  );
  return keyMatch ? keyMatch[0] : null;
}

// Encrypt password
function encryptPassword(password, publicKeyPem) {
  const buffer = Buffer.from(password, "utf8");
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    buffer,
  );
  return encrypted.toString("base64");
}

async function runTest() {
  let testsPassed = 0;
  let testsFailed = 0;

  log("\n========================================", "blue");
  log("  SCOALANOUA CRAWLER E2E TEST", "blue");
  log("========================================", "blue");

  try {
    // Validate config
    logStep("SETUP", "Validating configuration");
    validateConfig();
    logSuccess("Configuration valid");
    logSuccess(`Username: ${config.username}`);
    logSuccess(`Login URL: ${config.loginUrl}`);
    logSuccess(`Target URL: ${config.targetUrl}`);

    // STEP 0: Fetch login page
    logStep("STEP 0", "Fetching login page");
    const loginPageResponse = await fetch(config.loginPageUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
    });

    if (
      !assert(
        loginPageResponse.ok,
        `Login page responded with status ${loginPageResponse.status}`,
      )
    ) {
      testsFailed++;
      throw new Error("Failed to fetch login page");
    }
    testsPassed++;

    const loginPageHtml = await loginPageResponse.text();

    if (
      !assert(
        loginPageHtml.length > 1000,
        `Login page HTML length: ${loginPageHtml.length} bytes`,
      )
    ) {
      testsFailed++;
      throw new Error("Login page HTML too short");
    }
    testsPassed++;

    // Extract CSRF token
    const csrfToken = extractCsrfToken(loginPageHtml);
    if (
      !assert(
        csrfToken !== null,
        `CSRF token extracted: ${csrfToken ? csrfToken.substring(0, 20) + "..." : "NULL"}`,
      )
    ) {
      testsFailed++;
      logError(
        "CSRF token not found in HTML. The form structure may have changed.",
      );
      logError('Look for: <input name="login[_token]" value="...">');
      throw new Error("CSRF token missing");
    }
    testsPassed++;

    // Extract RSA public key
    const publicKey = extractPublicKey(loginPageHtml);
    if (
      !assert(
        publicKey !== null,
        `RSA public key extracted: ${publicKey ? "YES" : "NO"}`,
      )
    ) {
      testsFailed++;
      logError(
        "RSA public key not found in HTML. The JavaScript may have changed.",
      );
      logError("Look for: -----BEGIN PUBLIC KEY-----");
      throw new Error("RSA public key missing");
    }
    testsPassed++;

    if (
      !assert(publicKey.includes("BEGIN PUBLIC KEY"), "RSA key format valid")
    ) {
      testsFailed++;
      throw new Error("Invalid RSA key format");
    }
    testsPassed++;

    // STEP 1: Authenticate
    logStep("STEP 1", "Authenticating with credentials");

    const encryptedPassword = encryptPassword(config.password, publicKey);
    logSuccess(`Password encrypted: ${encryptedPassword.substring(0, 30)}...`);

    const formData = new URLSearchParams({
      "login[_token]": csrfToken,
      "login[username]": config.username,
      "login[password]": config.password,
      "login[encrypted_password]": encryptedPassword,
    });

    const loginResponse = await fetch(config.loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        Referer: config.loginPageUrl,
      },
      body: formData.toString(),
      redirect: "manual",
    });

    if (
      !assert(
        loginResponse.status === 302,
        `Login response status: ${loginResponse.status} (expected 302 redirect)`,
      )
    ) {
      testsFailed++;
      if (loginResponse.status === 200) {
        logError(
          "Got 200 instead of 302. Login may have failed - check credentials or form structure.",
        );
      }
      throw new Error(`Unexpected login response: ${loginResponse.status}`);
    }
    testsPassed++;

    const cookies = extractCookies(loginResponse);
    if (
      !assert(
        cookies.length > 0,
        `Session cookies received: ${cookies ? "YES" : "NO"}`,
      )
    ) {
      testsFailed++;
      logError(
        "No cookies in login response. Session management may have changed.",
      );
      throw new Error("No session cookies");
    }
    testsPassed++;

    logSuccess(`Cookies: ${cookies.substring(0, 50)}...`);

    const redirectLocation = loginResponse.headers.get("location");
    if (
      !assert(
        redirectLocation !== null,
        `Redirect location: ${redirectLocation || "NONE"}`,
      )
    ) {
      testsFailed++;
      logWarning("No redirect location header");
    } else {
      testsPassed++;
    }

    // STEP 2: Fetch target page
    logStep("STEP 2", "Fetching target page with session");

    const targetResponse = await fetch(config.targetUrl, {
      method: "GET",
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
    });

    if (
      !assert(targetResponse.ok, `Target page status: ${targetResponse.status}`)
    ) {
      testsFailed++;
      if (targetResponse.status === 403 || targetResponse.status === 401) {
        logError("Authentication failed. Check if credentials are correct.");
      }
      throw new Error("Failed to fetch target page");
    }
    testsPassed++;

    const targetHtml = await targetResponse.text();
    if (
      !assert(
        targetHtml.length > 5000,
        `Target page HTML length: ${targetHtml.length} bytes`,
      )
    ) {
      testsFailed++;
      logWarning(
        "Target page HTML seems too short. May not be the expected page.",
      );
    } else {
      testsPassed++;
    }

    // STEP 3: Parse HTML
    logStep("STEP 3", "Parsing HTML content");

    const parsed = parseHtml(targetHtml);

    // Validate summary
    if (!assert(parsed.summary !== undefined, "Summary object present")) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        typeof parsed.summary?.overallAverage === "number",
        `Overall average: ${parsed.summary?.overallAverage || "MISSING"}`,
      )
    ) {
      testsFailed++;
      logError(
        "Overall average not found. Check if Total row exists in table.",
      );
    } else {
      testsPassed++;
    }

    if (
      !assert(
        parsed.summary?.overallAverage >= 1 &&
          parsed.summary?.overallAverage <= 10,
        `Average in valid range (1-10): ${parsed.summary?.overallAverage}`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        typeof parsed.summary?.totalUnexcusedAbsences === "number",
        `Unexcused absences: ${parsed.summary?.totalUnexcusedAbsences ?? "MISSING"}`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        typeof parsed.summary?.totalExcusedAbsences === "number",
        `Excused absences: ${parsed.summary?.totalExcusedAbsences ?? "MISSING"}`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    // Validate subjects
    if (!assert(Array.isArray(parsed.subjects), "Subjects array present")) {
      testsFailed++;
      throw new Error("Subjects not parsed");
    }
    testsPassed++;

    if (
      !assert(
        parsed.subjects.length > 0,
        `Number of subjects: ${parsed.subjects.length}`,
      )
    ) {
      testsFailed++;
      logError(
        "No subjects found. Check if #summary table exists and has rows.",
      );
      throw new Error("No subjects parsed");
    }
    testsPassed++;

    if (
      !assert(
        parsed.subjects.length >= 10,
        `Subjects count reasonable (≥10): ${parsed.subjects.length}`,
      )
    ) {
      testsFailed++;
      logWarning(
        "Fewer subjects than expected. Some may not be parsing correctly.",
      );
    } else {
      testsPassed++;
    }

    // Validate first subject structure
    const firstSubject = parsed.subjects[0];
    if (
      !assert(
        firstSubject.name && firstSubject.name.length > 0,
        `First subject name: "${firstSubject.name}"`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        Array.isArray(firstSubject.grades),
        `First subject grades array: ${firstSubject.grades?.length || 0} grades`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        firstSubject.grades.length > 0,
        `First subject has grades: ${firstSubject.grades.length > 0 ? "YES" : "NO"}`,
      )
    ) {
      testsFailed++;
      logWarning("First subject has no grades");
    } else {
      testsPassed++;
    }

    if (firstSubject.average !== null) {
      if (
        !assert(
          firstSubject.average >= 1 && firstSubject.average <= 10,
          `First subject average valid: ${firstSubject.average}`,
        )
      ) {
        testsFailed++;
      } else {
        testsPassed++;
      }
    } else {
      logWarning("First subject has no average (may be intentional)");
      testsPassed++;
    }

    if (
      !assert(
        typeof firstSubject.unexcusedAbsences === "number",
        `Unexcused absences type valid: ${typeof firstSubject.unexcusedAbsences}`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    if (
      !assert(
        typeof firstSubject.excusedAbsences === "number",
        `Excused absences type valid: ${typeof firstSubject.excusedAbsences}`,
      )
    ) {
      testsFailed++;
    } else {
      testsPassed++;
    }

    // Display sample subjects
    logStep("SAMPLE", "First 3 subjects");
    parsed.subjects.slice(0, 3).forEach((subject, index) => {
      log(`  ${index + 1}. ${subject.name}`, "yellow");
      log(`     Grades: [${subject.grades.join(", ")}]`, "reset");
      log(
        `     Average: ${subject.average ?? "N/A"}, Absences: ${subject.unexcusedAbsences}/${subject.excusedAbsences}`,
        "reset",
      );
    });

    // SUCCESS
    log("\n========================================", "green");
    log("  ✓ ALL TESTS PASSED", "green");
    log("========================================", "green");
    log(`\n  Tests passed: ${testsPassed}`, "green");
    log(`  Tests failed: ${testsFailed}`, testsFailed > 0 ? "red" : "green");
    log("\n  The crawler is working correctly!\n", "green");

    process.exit(0);
  } catch (error) {
    log("\n========================================", "red");
    log("  ✗ TESTS FAILED", "red");
    log("========================================", "red");
    log(`\n  Error: ${error.message}`, "red");
    log(`\n  Tests passed: ${testsPassed}`, "green");
    log(`  Tests failed: ${testsFailed + 1}`, "red");
    log("\n  Check the error messages above for details.\n", "yellow");
    process.exit(1);
  }
}

runTest();
