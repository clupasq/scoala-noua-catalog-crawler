/**
 * HTML parser module - extracts structured data from scoalanoua.ro pages
 */

import * as cheerio from 'cheerio';

/**
 * Extracts student name from the page
 * @param {Object} $ - Cheerio instance
 * @returns {string} Student name
 */
function parseStudentName($) {
  const nameElement = $('#bigTITle');
  if (nameElement.length > 0) {
    // Remove the image tag and get text
    const nameText = nameElement.clone().children('img').remove().end().text().trim();
    return nameText;
  }
  return 'Unknown';
}

/**
 * Parses a single subject row from the grades table
 * @param {Object} row - Cheerio row element
 * @returns {Object|null} Subject data or null if it's the total row
 */
function parseSubjectRow(row) {
  const cells = row.find('td');

  if (cells.length < 5) {
    return null;
  }

  const subjectName = cells.eq(0).text().trim();

  // Skip the "Total" row
  if (subjectName === 'Total') {
    return null;
  }

  // Extract individual grades
  const gradesCell = cells.eq(1);
  const grades = [];
  gradesCell.find('.gradeBox .gradeBoxNr').each((i, elem) => {
    const gradeText = cheerio.load(elem).text().trim();
    const grade = parseInt(gradeText, 10);
    if (!isNaN(grade)) {
      grades.push(grade);
    }
  });

  // Extract average (in red)
  const averageCell = cells.eq(2);
  let average = null;
  const avgElement = averageCell.find('.gradeBox .gradeBoxNr[style*="color:red"]');
  if (avgElement.length > 0) {
    const avgText = avgElement.text().trim();
    const avgValue = parseFloat(avgText);
    if (!isNaN(avgValue)) {
      average = avgValue;
    }
  }

  // Extract unexcused absences (blue)
  const unexcusedCell = cells.eq(3);
  const unexcusedText = unexcusedCell.find('.gradeBoxNr').text().trim();
  const unexcusedAbsences = parseInt(unexcusedText, 10) || 0;

  // Extract excused absences (green)
  const excusedCell = cells.eq(4);
  const excusedText = excusedCell.find('.gradeBoxNr').text().trim();
  const excusedAbsences = parseInt(excusedText, 10) || 0;

  return {
    name: subjectName,
    grades: grades,
    average: average,
    unexcusedAbsences: unexcusedAbsences,
    excusedAbsences: excusedAbsences,
  };
}

/**
 * Parses the summary (Total) row from the grades table
 * @param {Object} row - Cheerio row element
 * @returns {Object|null} Summary data or null if not found
 */
function parseSummaryRow(row) {
  const cells = row.find('td');

  if (cells.length < 5) {
    return null;
  }

  const subjectName = cells.eq(0).text().trim();

  // Only process the "Total" row
  if (subjectName !== 'Total') {
    return null;
  }

  // Extract overall average (in red)
  const averageCell = cells.eq(2);
  let overallAverage = null;
  const avgElement = averageCell.find('.gradeBoxNr[style*="color:red"]');
  if (avgElement.length > 0) {
    const avgText = avgElement.text().trim();
    const avgValue = parseFloat(avgText);
    if (!isNaN(avgValue)) {
      overallAverage = avgValue;
    }
  }

  // Extract total unexcused absences (blue)
  const unexcusedCell = cells.eq(3);
  const unexcusedText = unexcusedCell.find('.gradeBoxNr').text().trim();
  const totalUnexcusedAbsences = parseInt(unexcusedText, 10) || 0;

  // Extract total excused absences (green)
  const excusedCell = cells.eq(4);
  const excusedText = excusedCell.find('.gradeBoxNr').text().trim();
  const totalExcusedAbsences = parseInt(excusedText, 10) || 0;

  return {
    overallAverage: overallAverage,
    totalUnexcusedAbsences: totalUnexcusedAbsences,
    totalExcusedAbsences: totalExcusedAbsences,
  };
}

/**
 * Parses the grades summary table
 * @param {Object} $ - Cheerio instance
 * @returns {Object} Parsed subjects and summary data
 */
function parseGradesTable($) {
  const subjects = [];
  let summary = {
    overallAverage: null,
    totalUnexcusedAbsences: 0,
    totalExcusedAbsences: 0,
  };

  const table = $('#summary');
  if (table.length === 0) {
    console.warn('Grades table not found');
    return { subjects, summary };
  }

  // Parse each row in tbody
  table.find('tbody tr').each((i, row) => {
    const $row = cheerio.load(row);

    // Try to parse as subject row
    const subjectData = parseSubjectRow($row('tr'));
    if (subjectData) {
      subjects.push(subjectData);
      return;
    }

    // Try to parse as summary row
    const summaryData = parseSummaryRow($row('tr'));
    if (summaryData) {
      summary = summaryData;
    }
  });

  return { subjects, summary };
}

/**
 * Main HTML parsing function
 * @param {string} html - HTML content from scoalanoua.ro
 * @returns {Object} Structured data
 */
export function parseHtml(html) {
  try {
    const $ = cheerio.load(html);

    // Extract grades table
    const { subjects, summary } = parseGradesTable($);

    return {
      summary: summary,
      subjects: subjects,
    };
  } catch (error) {
    throw new Error(`HTML parsing failed: ${error.message}`);
  }
}
