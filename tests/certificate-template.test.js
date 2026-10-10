import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCertificate } from '../server/certificate-template.js';

const certificate = {
    id: 12, patientId: 'TEST-001', patientName: 'Test Patient',
    patient: { college: 'Test College', course: 'Test Course', year: 3 },
    type: 'Medical Certificate', certificateDate: '2026-10-09', purpose: 'Test purpose',
    findings: 'Test findings', recommendations: 'Test recommendations', otherDetails: '',
    status: 'Approved', approvedByName: 'Dr. Test Reviewer', approvedAt: '2026-10-09T04:00:00.000Z'
};

test('official output requires Approved status and recorded doctor approval', () => {
    for (const status of ['Draft', 'Pending Approval', 'Returned for Revision']) {
        assert.throws(() => renderCertificate({ ...certificate, status }, {}, { official: true }), { status: 403 });
    }
    for (const approval of [{ approvedByName: '' }, { approvedAt: null }]) {
        assert.throws(() => renderCertificate({ ...certificate, ...approval }, {}, { official: true }), { status: 403 });
    }
});

test('official certificate includes configured identity, approval, and a physical signature space', () => {
    const html = renderCertificate(certificate, { universityName: 'Test University', clinicName: 'Test Clinic', clinicAddress: 'Campus A' }, { official: true });
    for (const expected of ['Test University', 'Test Clinic', 'Campus A', 'Test Patient', 'TEST-001', 'Test findings', 'Dr. Test Reviewer', 'October 9, 2026', 'Space for doctor to sign', 'Signature of Approving Doctor', 'size: A4', 'window.print()']) assert.ok(html.includes(expected), expected);
    assert.match(html, /\.toolbar\s*\{\s*display:\s*none\s*!important/);
    assert.match(html, /class="signature-space"/);
    assert.doesNotMatch(html, /<nav|<aside/);
});

test('previews of every status remain marked and cannot print as an official copy', () => {
    for (const status of ['Draft', 'Pending Approval', 'Returned for Revision', 'Approved']) {
        const html = renderCertificate({ ...certificate, status });
        assert.match(html, /body class="preview"/);
        assert.match(html, /NOT AN OFFICIAL/);
        assert.match(html, /body\.preview \.certificate \{ display: none !important/);
        assert.doesNotMatch(html, /<script>|id="print-certificate"/);
    }
});

test('stored certificate fields and clinic configuration cannot inject executable HTML', () => {
    const malicious = '<script>alert("x")</script> & <img src=x onerror=alert(1)>';
    const html = renderCertificate({ ...certificate, patientName: malicious, findings: malicious, approvedByName: malicious }, { universityName: malicious }, { official: true });
    assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img'));
    assert.doesNotMatch(html, /<script>alert|<img src=x/);
});

test('multiline and long certificate content is retained for paginated printing', () => {
    const findings = 'Detailed test finding.\n'.repeat(400);
    const html = renderCertificate({ ...certificate, findings }, {}, { official: true });
    assert.ok(html.includes(findings));
    assert.ok(html.includes('white-space: pre-wrap'));
    assert.ok(html.includes('overflow-wrap: anywhere'));
    assert.doesNotMatch(html, /overflow:\s*hidden/);
});
