/* Reads an Excel file in the background so the page never freezes.
   Receives { buffer } and sends back progress messages and one final { type: 'done', ... }.
   Needs frontend/vendor/xlsx.full.min.js (SheetJS). Expected columns, in any order:
   Code, Last Name, First Name, Middle Name, Sex, Course, Year. */
'use strict';
importScripts('../vendor/xlsx.full.min.js');

const MAX_ROWS = 10000;
const HEADERS = {
    id: ['code', 'id', 'id no', 'id number', 'student id', 'student no', 'student number', 'identification no'],
    lastName: ['last name', 'lastname', 'surname', 'family name'],
    firstName: ['first name', 'firstname', 'given name', 'given names'],
    middleName: ['middle name', 'middlename'],
    gender: ['sex', 'gender'],
    course: ['course', 'program', 'programme'],
    year: ['year', 'year level', 'yr']
};

const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const norm = value => clean(value).toLowerCase().replace(/[._:]/g, ' ').replace(/\s+/g, ' ').trim();

// The header row is the first row (in the first 20) that has both a Last Name and a First Name column.
function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
        const columns = {};
        rows[r].forEach(function (cell, c) {
            const name = norm(cell);
            if (!name) return;
            Object.keys(HEADERS).forEach(function (key) {
                if (columns[key] === undefined && HEADERS[key].indexOf(name) !== -1) columns[key] = c;
            });
        });
        if (columns.lastName !== undefined && columns.firstName !== undefined) return { index: r, columns: columns };
    }
    return null;
}

// Same limits as backend/flow-store.js (registerPatient / identityFields).
function check(row) {
    const problems = [];
    if (!row.id) problems.push('Code is empty');
    else if (row.id.length > 50) problems.push('Code is longer than 50 characters');
    else if (!/^[A-Za-z0-9._-]+$/.test(row.id)) problems.push('Code may only have letters, numbers, dots, dashes and underscores');
    if (!row.lastName) problems.push('Last name is empty');
    if (!row.firstName) problems.push('First name is empty');
    if (row.lastName.length > 100 || row.firstName.length > 100 || row.middleName.length > 100) problems.push('A name is longer than 100 characters');
    if ((row.firstName + ' ' + row.middleName + ' ' + row.lastName).length > 200) problems.push('Full name is too long');
    const sex = row.sexRaw.toLowerCase();
    if (!sex) row.gender = '';
    else if (sex === 'm' || sex === 'male') row.gender = 'Male';
    else if (sex === 'f' || sex === 'female') row.gender = 'Female';
    else { row.gender = ''; problems.push('Sex must be M or F'); }
    if (row.course.length > 100) problems.push('Course is longer than 100 characters');
    if (row.year.length > 20) problems.push('Year is longer than 20 characters');
    return problems.join('; ');
}

self.onmessage = function (event) {
    try {
        self.postMessage({ type: 'progress', text: 'Reading the Excel file...' });
        const workbook = XLSX.read(new Uint8Array(event.data.buffer), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('The file has no sheets.');
        const sheet = workbook.Sheets[sheetName];
        self.postMessage({ type: 'progress', text: 'Finding the columns...' });
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
        const header = findHeader(rows);
        if (!header) {
            throw new Error('Could not find the header row. The first sheet needs the columns Code, Last Name and First Name (Middle Name, Sex, Course and Year are optional).');
        }
        const c = header.columns;
        if (c.id === undefined) throw new Error('The column "Code" was not found. It holds the student ID.');
        const body = rows.slice(header.index + 1);
        if (body.length > MAX_ROWS) {
            throw new Error('This file has ' + body.length.toLocaleString('en-US') + ' rows. The limit is ' + MAX_ROWS.toLocaleString('en-US') + ' per import; split the file and import it in parts.');
        }

        // With blankrows kept and the sheet starting at A1, array index + 1 is the row number shown in Excel.
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const firstRow = range.s.r + header.index + 2;
        const seen = Object.create(null);
        const out = [];
        let emptyRows = 0;
        const cell = (row, key) => c[key] === undefined ? '' : clean(row[c[key]]);
        body.forEach(function (row, i) {
            if (!row.some(value => clean(value))) { emptyRows++; return; }
            const item = {
                row: firstRow + i, id: cell(row, 'id'), lastName: cell(row, 'lastName'), firstName: cell(row, 'firstName'),
                middleName: cell(row, 'middleName'), sexRaw: cell(row, 'gender'), course: cell(row, 'course'), year: cell(row, 'year')
            };
            let problem = check(item);
            const key = item.id.toLowerCase();
            if (!problem && seen[key] !== undefined) problem = 'Same code as row ' + seen[key] + ' in this file';
            if (!problem) seen[key] = item.row;
            item.problem = problem;
            delete item.sexRaw;
            out.push(item);
            if (out.length % 2000 === 0) self.postMessage({ type: 'progress', text: 'Checking rows... ' + out.length.toLocaleString('en-US') });
        });
        self.postMessage({
            type: 'done', sheetName: sheetName, headerRow: firstRow - 1, rows: out, emptyRows: emptyRows,
            found: Object.keys(c)
        });
    } catch (error) {
        self.postMessage({ type: 'error', message: error && error.message ? error.message : 'The file could not be read. Is it a real .xlsx or .xls file?' });
    }
};
