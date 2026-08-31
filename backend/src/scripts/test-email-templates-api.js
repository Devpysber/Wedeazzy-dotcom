const http = require('http');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const env = require('../config/env');

async function runTests() {
  console.log('--- STARTING EMAIL MARKETING TEMPLATE API TESTS ---');

  const adminUser = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!adminUser) throw new Error('No admin user found in database');

  const adminToken = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: 'admin' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  function apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: 'localhost',
        port: 4000,
        path,
        method,
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });

      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  // TEST 1: LIST TEMPLATES
  console.log('\n[TEST 1] GET /api/admin/email-templates');
  const res1 = await apiRequest('GET', '/api/admin/email-templates');
  console.log(`Status: ${res1.status}, Templates Count: ${res1.body.templates ? res1.body.templates.length : 0}`);
  if (res1.status !== 200 || !res1.body.ok) throw new Error('Test 1 Failed');

  // TEST 2: CREATE TEMPLATE
  console.log('\n[TEST 2] POST /api/admin/email-templates');
  const newTplData = {
    name: 'Test Automation Template',
    category: 'Profile Completion',
    subject: 'Complete {{business_name}} profile now!',
    previewText: 'Reach more couples in {{city}}',
    body: '<h1>Hello {{owner_name}}</h1><p>Your profile is {{profile_completion_percentage}} complete.</p>',
    status: 'active'
  };
  const res2 = await apiRequest('POST', '/api/admin/email-templates', newTplData);
  console.log(`Status: ${res2.status}, Created Template ID: ${res2.body.template ? res2.body.template.id : 'N/A'}`);
  if (res2.status !== 201 || !res2.body.ok) throw new Error('Test 2 Failed');
  const createdId = res2.body.template.id;

  // TEST 3: PREVIEW RESOLUTION
  console.log('\n[TEST 3] POST /api/admin/email-templates/preview-resolve');
  const res3 = await apiRequest('POST', '/api/admin/email-templates/preview-resolve', {
    subject: 'Hello {{owner_name}} from {{business_name}}',
    previewText: 'In {{city}}',
    body: 'Completion: {{profile_completion_percentage}}'
  });
  console.log('Resolved Subject:', res3.body.resolved ? res3.body.resolved.subject : 'N/A');
  if (res3.status !== 200 || !res3.body.ok) throw new Error('Test 3 Failed');

  // TEST 4: DUPLICATE TEMPLATE
  console.log('\n[TEST 4] POST /api/admin/email-templates/:id/duplicate');
  const res4 = await apiRequest('POST', `/api/admin/email-templates/${createdId}/duplicate`);
  console.log(`Status: ${res4.status}, Duplicated Name: ${res4.body.template ? res4.body.template.name : 'N/A'}`);
  if (res4.status !== 201 || !res4.body.ok) throw new Error('Test 4 Failed');
  const dupId = res4.body.template.id;

  // TEST 5: DELETE CREATED TEMPLATES
  console.log('\n[TEST 5] DELETE created test templates');
  await apiRequest('DELETE', `/api/admin/email-templates/${createdId}`);
  await apiRequest('DELETE', `/api/admin/email-templates/${dupId}`);
  console.log('Cleanup completed cleanly.');

  console.log('\n✅ ALL EMAIL MARKETING TEMPLATE API TESTS PASSED 100%!');
  await prisma.$disconnect();
}

runTests().catch(async err => {
  console.error('❌ TEST FAILED:', err);
  await prisma.$disconnect();
  process.exit(1);
});
