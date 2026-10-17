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
    LIST.forEach(function (c) { c[1].forEach(function (p) { OPTIONS.push(c[0] + ' - ' + p); }); });

    window.SLCDepartments = {
        list: LIST,
        options: OPTIONS,
        // Fills a <select>, grouped by college, keeping the first (placeholder) option.
        fillSelect: function (select) {
            LIST.forEach(function (c) {
                const group = document.createElement('optgroup');
                group.label = c[0];
                c[1].forEach(function (p) {
                    const o = document.createElement('option');
                    o.value = o.textContent = c[0] + ' - ' + p;
                    group.appendChild(o);
                });
                select.appendChild(group);
            });
        }
    };
})();
