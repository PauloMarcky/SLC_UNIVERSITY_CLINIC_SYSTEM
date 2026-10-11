(() => {
  const body = document.querySelector('main table tbody');
  const searchInput = document.querySelector('.toolbar input[aria-label="Search"]');

  if (!body) return;

  let students = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function render(list) {
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="11">No students found.</td></tr>';
      return;
    }

    body.innerHTML = list.map(student => `
      <tr>
        <td>${escapeHtml(student.id)}</td>
        <td><a href="../nurse/record-detail.html?id=${encodeURIComponent(student.id)}">${escapeHtml(student.name)}</a></td>
        <td>${escapeHtml(student.college)}</td>
        <td>${escapeHtml(student.course)}</td>
        <td>${escapeHtml(student.year)}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    `).join('');
  }

  async function loadStudents() {
    try {
      const response = await fetch('../api/patients?search=', {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();
      students = Array.isArray(data.patients)
        ? data.patients.filter(student => student.category === 'student')
        : [];

      render(students);
    } catch (error) {
      body.innerHTML = '<tr><td colspan="11">Unable to load student records.</td></tr>';
      console.error(error);
    }
  }

  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    render(students.filter(student =>
      String(student.id).toLowerCase().includes(query) ||
      String(student.name).toLowerCase().includes(query)
    ));
  });

  loadStudents();
})();