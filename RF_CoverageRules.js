/**
 * Pure calculation of plan start / next due dates from ProductTypes.COVERAGESTARTRULE.
 * Reads and writes nothing. Dates are Date objects (time ignored) or dd/mm/yyyy / yyyy-mm-dd text.
 */
var RF_COVERAGE_RULES = ['1st Next Month', 'Start of Current Month', 'Today Plus 1 Month', 'Next Day'];
var RF_OVERDUE_GRACE_DAYS = 7;

function RF_coverageParseDate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

function RF_coverageAddMonths_(d, n) {
  var y = d.getUTCFullYear(), mo = d.getUTCMonth() + n, day = d.getUTCDate();
  var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(day, last)));
}

function RF_coverageAddDays_(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function RF_coverageIso_(d) {
  return d ? d.toISOString().slice(0, 10) : '';
}

function RF_coverageNormaliseRule_(rule) {
  var r = String(rule || '').trim().toLowerCase().replace(/\s+/g, ' ');
  var aliases = { 'startnextmonth': '1st next month', 'oneday pass': 'next day', 'oneday': 'next day' };
  if (aliases[r]) r = aliases[r];
  for (var i = 0; i < RF_COVERAGE_RULES.length; i++) {
    if (RF_COVERAGE_RULES[i].toLowerCase() === r) return RF_COVERAGE_RULES[i];
  }
  return '';
}

/**
 * @param {string} rule   COVERAGESTARTRULE value
 * @param {*} currentDue  Member NEXTPAYMENTDUE (start of next unpaid period), may be blank
 * @param {*} today       Posting date
 * @param {number} months COVERAGEMONTHS (ignored for Next Day)
 * @return {{ok:boolean, rule:string, startDate:string, nextDue:string, message:string}}
 */
function RF_calculateCoverage(rule, currentDue, today, months) {
  var out = { ok: false, rule: '', startDate: '', nextDue: '', message: '' };
  var r = RF_coverageNormaliseRule_(rule);
  var t = RF_coverageParseDate_(today);
  var due = RF_coverageParseDate_(currentDue);
  var n = Number(months) || 0;
  if (!r) { out.message = 'Unknown or blank coverage start rule: ' + rule; return out; }
  if (!t) { out.message = 'Posting date is missing or invalid.'; return out; }
  out.rule = r;

  var start;
  if (r === 'Next Day') {
    out.ok = true;
    out.startDate = RF_coverageIso_(RF_coverageAddDays_(t, 1));
    out.message = 'Session starts the next day. Plan dates are not changed.';
    return out;
  }
  if (n < 1) { out.message = 'Coverage months must be 1 or more for this rule.'; return out; }

  if (r === '1st Next Month') {
    var firstNext = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
    start = (due && due.getTime() > firstNext.getTime()) ? due : firstNext;
  } else if (r === 'Start of Current Month') {
    if (!due) { out.message = 'No current due date; use another start rule.'; return out; }
    var days = Math.round((t.getTime() - due.getTime()) / 86400000);
    if (days < 0) { out.message = 'Plan is not overdue; use 1st Next Month.'; return out; }
    if (days > RF_OVERDUE_GRACE_DAYS) {
      out.message = 'Overdue by ' + days + ' days; maximum is ' + RF_OVERDUE_GRACE_DAYS + '. Not allowed.';
      return out;
    }
    start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  } else {
    start = t;
  }

  out.ok = true;
  out.startDate = RF_coverageIso_(start);
  out.nextDue = RF_coverageIso_(RF_coverageAddMonths_(start, n));
  return out;
}

function RF_testCoverageRules() {
  var cases = [
    ['1st Next Month', '', '2026-11-06', 1],
    ['1st Next Month', '01/12/2026', '2026-11-25', 1],
    ['1st Next Month', '01/02/2027', '2026-11-25', 3],
    ['Start of Current Month', '01/11/2026', '2026-11-06', 1],
    ['Start of Current Month', '01/11/2026', '2026-11-09', 1],
    ['Start of Current Month', '01/12/2026', '2026-11-25', 1],
    ['Today Plus 1 Month', '', '2026-01-31', 1],
    ['Today Plus 1 Month', '', '2026-11-06', 3],
    ['Next Day', '', '2026-11-06', 0],
    ['Bogus', '', '2026-11-06', 1]
  ];
  cases.forEach(function (c) {
    Logger.log(JSON.stringify(c) + ' => ' + JSON.stringify(RF_calculateCoverage(c[0], c[1], c[2], c[3])));
  });
}
