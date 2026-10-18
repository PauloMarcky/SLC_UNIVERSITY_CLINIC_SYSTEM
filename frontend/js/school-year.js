/* School year picker, shared by the record lists, the student record and the statistics page.
   Records restart every school year but the old years stay on file: pick a year to see its records.
   Usage:  SchoolYear.mount(selectElement, { onChange, defaultAll, persist }).then(picker => ...)
     picker.value()      '' (all school years) or the id of the chosen school year, ready for ?schoolYear=
     picker.label()      name of the chosen year, or "All school years"
     picker.isCurrent()  true when the chosen year is today's school year
     picker.reset()      back to today's school year
   The choice is remembered for this browser session, so the pages stay on the same year (persist: false to skip).
   If the school years cannot be loaded, the picker is disabled and value() is '' so the page still shows its records. */
(function () {
    'use strict';
    const KEY = 'clinic-school-year';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let loading = null;

    // "2026-08-03" -> "Aug 3, 2026" (no Date object, so no timezone shift)
    function formatDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1] : '';
    }

    function load(force) {
        if (loading && !force) return loading;
        loading = fetch('/api/school-years', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (response) {
                if (response.status === 401) { window.location.assign('/index.html'); return new Promise(function () { }); }
                if (!response.ok) throw new Error('Could not load the school years.');
                return response.json();
            });
        loading.catch(function () { loading = null; });
        return loading;
    }

    function remembered() {
        try { return sessionStorage.getItem(KEY); } catch (_) { return null; }
    }
    function remember(value) {
        try { sessionStorage.setItem(KEY, value); } catch (_) { /* optional */ }
    }

    function unavailable(select) {
        select.replaceChildren();
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'School years unavailable';
        select.append(option);
        select.disabled = true;
        return { value: function () { return ''; }, label: function () { return 'All school years'; }, isCurrent: function () { return false; }, reset: function () { } };
    }

    async function mount(select, options) {
        options = options || {};
        const allowAll = options.allowAll !== false;
        const persist = options.persist !== false;
        let data;
        try { data = await load(); } catch (_) { return unavailable(select); }
        const years = data.schoolYears || [];
        const currentId = data.currentId == null ? '' : String(data.currentId);

        select.replaceChildren();
        years.forEach(function (year) {
            const option = document.createElement('option');
            option.value = String(year.id);
            option.textContent = year.label + (year.isCurrent ? ' (current)' : '');
            option.title = formatDate(year.startDate) + ' \u2013 ' + formatDate(year.endDate);
            select.append(option);
        });
        if (allowAll || !years.length) {
            const all = document.createElement('option');
            all.value = '';
            all.textContent = 'All school years';
            select.append(all);
        }
        const has = function (value) {
            return Array.prototype.some.call(select.options, function (o) { return o.value === value; });
        };
        const defaultValue = options.defaultAll && allowAll ? '' : (has(currentId) ? currentId : (select.options[0] ? select.options[0].value : ''));
        const saved = persist ? remembered() : null;
        select.value = saved !== null && has(saved) ? saved : defaultValue;
        select.disabled = false;

        const picker = {
            value: function () { return select.value; },
            label: function () {
                const chosen = select.options[select.selectedIndex];
                if (!select.value || !chosen) return 'All school years';
                return chosen.textContent.replace(/ \(current\)$/, '');
            },
            isCurrent: function () { return select.value !== '' && select.value === currentId; },
            reset: function () {
                select.value = has(currentId) ? currentId : defaultValue;
                if (persist) remember(select.value);
            }
        };
        select.addEventListener('change', function () {
            if (persist) remember(select.value);
            if (typeof options.onChange === 'function') options.onChange(picker);
        });
        return picker;
    }

    window.SchoolYear = { mount: mount, formatDate: formatDate };
})();
