Content:
(() => {
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get('id');

  const nameEl = document.getElementById('patient-name');
  const infoEl = document.getElementById('patient-info');
  const statusEl = document.getElementById('record-status');
  const summaryEl = document.getElementById('patient-summary');
  const contentEl = document.getElementById('record-content');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderRecord(record) {
    nameEl.textContent = `Patient Record: ${record.name}`;
    infoEl.textContent = `${record.id} | ${record.college} | ${record.course} ${record.year ? `${record.year}th Year` : ''}`;
    statusEl.textContent = 'Record loaded from the clinic database.';

    const latestVisit = record.visits?.[0];

    summaryEl.innerHTML = `
      <article class="card">
        <small>Student ID</small>
        <b>${escapeHtml(record.id)}</b>
      </article>
      <article class="card">
        <small>College</small>
        <b>${escapeHtml(record.college)}</b>
      </article>
      <article class="card">
        <small>Course</small>
        <b>${escapeHtml(record.course)}</b>
      </article>
      <article class="card">
        <small>Latest Visit</small>
        <b>${escapeHtml(latestVisit?.visitDate || 'No visits')}</b>
      </article>
    `;

    const visits = Array.isArray(record.visits) ? record.visits : [];

    const visitRows = visits.length
      ? visits.map(visit => `
          <tr>
            <td>${escapeHtml(visit.visitDate)}</td>
            <td>${escapeHtml(visit.visitType)}</td>
            <td>${escapeHtml(visit.diagnosis)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3">No visit history recorded.</td></tr>';

    contentEl.innerHTML = `
      <section class="box">
        <h3>Requirements</h3>
        <table>
          <tbody>
            <tr><td>Physical Exam</td><td>Not recorded</td></tr>
            <tr><td>Dental Examination</td><td>Not recorded</td></tr>
            <tr><td>Vaccination</td><td>Not recorded</td></tr>
            <tr><td>Laboratory Results</td><td>Not recorded</td></tr>
            <tr><td>Medical Certificate</td><td>Not recorded</td></tr>
          </tbody>
        </table>
        <p class="note">These requirements are not represented in the current patient/visit database schema.</p>
      </section>

      <section class="box">
        <h3>Visit History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Diagnosis</th>
            </tr>
          </thead>
          <tbody>${visitRows}</tbody>
        </table>
      </section>
    `;
  }

  async function loadRecord() {
    if (!patientId) {
      statusEl.textContent = 'No patient ID was provided.';
      return;
    }

    try {
      const response = await fetch(`../api/patients/${encodeURIComponent(patientId)}/record`, {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.record) {
        throw new Error('Patient record was not returned.');
      }

      renderRecord(data.record);
    } catch (error) {
      statusEl.textContent = 'Unable to load this patient record from the clinic database.';
      console.error(error);
    }
  }

  loadRecord();
})();