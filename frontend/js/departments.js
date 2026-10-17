/* SLC colleges and programs. The Department dropdown stores "College - Program". */
(function () {
    'use strict';
    const BSBA = 'Bachelor of Science in Business Administration';
    const BSED = 'Bachelor of Secondary Education';
    const LIST = [
        ['College of Accountancy', ['Bachelor of Science in Accountancy', 'Bachelor of Science in Accounting Information System']],
        ['College of Arts and Sciences', ['Bachelor of Arts in Political Science', 'Bachelor of Arts in Journalism', 'Bachelor of Arts in Philosophy', 'Bachelor of Science in Psychology', 'Bachelor of Science in Social Work']],
        ['College of Business Education', [BSBA + ' (Major in Human Resources Management)', BSBA + ' (Major in Financial Management)', BSBA + ' (Major in Marketing Management)', 'Bachelor of Science in Office Administration', 'Bachelor of Science in Hospitality Management', 'Bachelor of Science in Tourism Management']],
        ['College of Criminology', ['Bachelor of Science in Criminology']],
        ['College of Education', ['Bachelor of Elementary Education', 'Bachelor of Secondary Early Childhood Education', 'Bachelor of Physical Education', BSED + ' (Major in English)', BSED + ' (Major in Filipino)', BSED + ' (Major in Mathematics)', BSED + ' (Major in Sciences)', BSED + ' (Major in Social Studies)']],
        ['College of Engineering and Architecture', ['Bachelor of Science in Civil Engineering', 'Bachelor of Science in Electronics Engineering', 'Bachelor of Science in Computer Engineering', 'Bachelor of Science in Architecture', 'Bachelor of Science in Geodetic Engineering']],
        ['College of Information Technology', ['Bachelor of Science in Information Technology', 'Bachelor of Library and Information Science']],
        ['College of Law', ['Juris Doctor (Bachelor of Laws)']],
        ['College of Medicine and Allied Medical Programs', ['Bachelor of Science in Medical Laboratory Science', 'Bachelor of Science in Radiologic Technology', 'Bachelor of Science in Pharmacy', 'Bachelor of Science in Physical Therapy']],
        ['College of Nursing, Public Health and Midwifery', ['Bachelor of Science in Nursing', 'Bachelor of Science in Midwifery', 'Bachelor of Science in Public Health']]
    ];
    const OPTIONS = [];
    // Capital letters only: "College of Information Technology" -> "CIT".
    const abbr = function (text) { return text.replace(/[^A-Z]/g, ''); };
    // How many programs would get each short label. Civil and Computer Engineering are both "BSCE".
    const SHORT_USES = {};
    LIST.forEach(function (c) {
        c[1].forEach(function (p) {
            const key = abbr(c[0]) + ' - ' + abbr(p);
            SHORT_USES[key] = (SHORT_USES[key] || 0) + 1;
        });
    });
    // Short label for one program. If two programs share a label, the word before the last word is added: "CEA - BSCE (Civil)".
    const shortLabel = function (college, program) {
        const key = abbr(college) + ' - ' + abbr(program);
        if (SHORT_USES[key] > 1) {
            const words = program.split(' ');
            return key + ' (' + words[words.length - 2] + ')';
        }
        return key;
    };
    LIST.forEach(function (c) { c[1].forEach(function (p) { OPTIONS.push(c[0] + ' - ' + p); }); });

    // Saved value ("College" or "College - Program") -> short label.
    const SHORT_BY_VALUE = {};
    LIST.forEach(function (c) {
        SHORT_BY_VALUE[c[0]] = abbr(c[0]);
        c[1].forEach(function (p) { SHORT_BY_VALUE[c[0] + ' - ' + p] = shortLabel(c[0], p); });
    });

    window.SLCDepartments = {
        list: LIST,
        options: OPTIONS,
        // Short label for a saved department. Anything not in the list (old or custom values) is returned unchanged.
        short: function (value) {
            return Object.prototype.hasOwnProperty.call(SHORT_BY_VALUE, value) ? SHORT_BY_VALUE[value] : value;
        },
        // Fills a <select>, grouped by college, keeping the first (placeholder) option.
        fillSelect: function (select, opts) {
            const short = !!(opts && opts.short);   // short labels only change the text; the saved value stays the full name
            LIST.forEach(function (c) {
                const group = document.createElement('optgroup');
                group.label = short ? abbr(c[0]) : c[0];
                c[1].forEach(function (p) {
                    const o = document.createElement('option');
                    o.value = c[0] + ' - ' + p;
                    o.textContent = short ? shortLabel(c[0], p) : o.value;
                    if (short) o.title = o.value;
                    group.appendChild(o);
                });
                select.appendChild(group);
            });
        }
    };
})();
