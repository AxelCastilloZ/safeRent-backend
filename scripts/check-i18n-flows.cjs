// Invoked by preview-i18n.cjs --check. Real HTTP/JWT/guards, disposable DB transaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PropertyFile } = require('../dist/src/property/entities/property-file.entity');
const { MessageFile } = require('../dist/src/messages/message-file/entities/message-file.entity');

module.exports = async function checkFlows({ runner, accounts, password, base }) {
  const results = [];
  const attachment = path.resolve('.tmp', `i18n-${randomUUID()}.png`);
  fs.mkdirSync(path.dirname(attachment), { recursive: true });
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1sAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(attachment, bytes, { flag: 'wx' });
  try {
    for (const language of ['es', 'en', 'fr', 'pt']) {
      let requests = 0;
      const tokens = {};
      async function api(method, route, role, body, status = 200) {
        const headers = { 'Accept-Language': language };
        if (tokens[role]) headers.Authorization = `Bearer ${tokens[role]}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(base + route, { method, headers,
          body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const data = response.status === 204 ? null : await response.json();
        assert.equal(response.status, status, `${language} ${role || 'visitor'} ${method} ${route}: ${data?.code || response.status}`);
        requests++;
        return data;
      }
      for (const role of ['CLIENT', 'OWNER', 'ADMIN']) {
        const login = await api('POST', '/auth/login', null, { email: accounts[role].email, password });
        assert.ok(login.access_token); tokens[role] = login.access_token;
        await api('PATCH', '/auth/language', role, { preferredLanguage: language });
        const profile = await api('GET', '/auth/profile', role);
        assert.equal(profile.preferredLanguage, language);
        assert.deepEqual(profile.roles, [role]);
        assert.equal(profile.email, accounts[role].email);
      }
      const invalid = await api('POST', '/properties', 'OWNER', { title: '' }, 400);
      assert.equal(invalid.code, 'VALIDATION_FAILED'); assert.ok(invalid.details.length);
      await api('GET', '/properties/admin/all', 'CLIENT', undefined, 403);
      await api('PATCH', '/auth/language', 'OWNER', { preferredLanguage: 'de' }, 400);
      const catalog = await api('GET', '/service');
      assert.ok(catalog.length); assert.ok(catalog.every(item => item.catalogCode || item.translations));
      const property = await api('POST', '/properties', 'OWNER', {
        title: `I18n QA ${language}`, description: 'Contenido de usuario: á é ç ã', cost: 500,
        address: 'San José', latitude: 9.935, longitude: -84.084, typeOfCoin: 'CRC',
        serviceIds: [catalog[0].id], ownerId: accounts.ADMIN.id,
      }, 201);
      assert.equal(property.status, 'DRAFT'); assert.equal(property.ownerId, accounts.OWNER.id);
      await api('GET', `/properties/active/${property.id}`, null, undefined, 404);
      await api('PATCH', `/properties/${property.id}/publish`, 'OWNER', undefined, 400);
      const edited = await api('PATCH', `/properties/${property.id}`, 'OWNER', { status: 'ACTIVE', isActive: true, ownerId: accounts.ADMIN.id, rooms: 2 });
      assert.equal(edited.status, 'DRAFT'); assert.equal(edited.ownerId, accounts.OWNER.id);
      await runner.manager.save(PropertyFile, [0, 1, 2].map(index => ({ property: { id: property.id },
        path: attachment, fileName: `qa-${index}.png`, mimeType: 'image/png', size: bytes.length })));
      assert.equal((await api('PATCH', `/properties/${property.id}/publish`, 'OWNER')).status, 'PENDING');
      await api('PATCH', `/properties/${property.id}/review`, 'OWNER', { status: 'ACTIVE' }, 403);
      assert.equal((await api('PATCH', `/properties/${property.id}/review`, 'ADMIN', { status: 'CHANGES_REQUESTED', note: 'QA: revisar ubicación' })).status, 'CHANGES_REQUESTED');
      await api('PATCH', `/properties/${property.id}/publish`, 'OWNER');
      assert.equal((await api('PATCH', `/properties/${property.id}/review`, 'ADMIN', { status: 'ACTIVE' })).status, 'ACTIVE');
      const published = await api('GET', `/properties/active/${property.id}`);
      assert.equal(published.title, `I18n QA ${language}`);
      assert.deepEqual(Object.keys(published.owner).sort(), ['id', 'name']);
      await api('PATCH', `/properties/${property.id}`, 'CLIENT', { title: 'Injected' }, 403);
      await api('POST', '/conversations', null, { propertyId: property.id }, 401);
      const conversation = await api('POST', '/conversations', 'CLIENT', { propertyId: property.id, participantIds: [accounts.ADMIN.id, accounts.OWNER.id] }, 201);
      assert.ok(conversation.id);
      assert.deepEqual(conversation.participants.map(item => item.id).sort(), [accounts.CLIENT.id, accounts.OWNER.id].sort());
      const repeated = await api('POST', '/conversations', 'CLIENT', { propertyId: property.id, participantIds: [accounts.CLIENT.id, accounts.OWNER.id] }, 201);
      assert.equal(repeated.id, conversation.id);
      const message = await api('POST', `/conversations/${conversation.id}/messages`, 'CLIENT', { message: 'QA: mensaje de prueba á é ç ã', senderId: accounts.ADMIN.id }, 201);
      assert.equal(message.sender.id, accounts.CLIENT.id);
      await api('GET', `/conversations/${conversation.id}`, 'ADMIN', undefined, 403);
      const messages = await api('GET', `/conversations/${conversation.id}/messages`, 'OWNER');
      assert.ok(messages.some(item => item.id === message.id));
      await api('PATCH', `/conversations/${conversation.id}/read`, 'OWNER');
      const file = await runner.manager.save(MessageFile, { message: { id: message.id }, path: attachment,
        fileName: 'qa-á.png', mimeType: 'image/png', size: bytes.length });
      const files = await api('GET', `/messages/${message.id}/files`, 'OWNER');
      assert.ok(files.some(item => item.id === file.id));
      const download = await fetch(`${base}/messages/${message.id}/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${tokens.OWNER}` }, signal: AbortSignal.timeout(15000) });
      assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes); requests++;
      await api('GET', `/messages/${message.id}/files/${file.id}/download`, 'ADMIN', undefined, 403);
      // The recipient cannot alter the sender's files; the guard rejects before filesystem work.
      await api('DELETE', `/messages/${message.id}/files/${file.id}`, 'OWNER', undefined, 403);
      const invalidUpload = new FormData(); invalidUpload.append('files', new Blob(['QA'], { type: 'text/plain' }), 'qa.txt');
      const rejected = await fetch(`${base}/messages/${message.id}/files`, { method: 'POST',
        headers: { Authorization: `Bearer ${tokens.CLIENT}`, 'Accept-Language': language }, body: invalidUpload, signal: AbortSignal.timeout(15000) });
      assert.equal(rejected.status, 400); assert.ok((await rejected.json()).code); requests++;
      await api('POST', `/reservations/conversation/${conversation.id}`, 'CLIENT', undefined, 403);
      const reservation = await api('POST', `/reservations/conversation/${conversation.id}`, 'OWNER', undefined, 201);
      assert.equal(reservation.reservedTenantId, accounts.CLIENT.id);
      const reserved = await api('GET', '/properties/me/reserved', 'CLIENT');
      assert.ok(reserved.some(item => item.id === property.id));
      await api('PUT', `/saved-properties/${property.id}`, 'CLIENT');
      assert.ok((await api('GET', '/saved-properties/ids', 'CLIENT')).includes(property.id));
      const comment = await api('POST', `/comments/property/${property.id}`, 'CLIENT', { content: 'QA: expérience / experiência' }, 201);
      await api('POST', `/comments/property/${property.id}`, 'CLIENT', { content: 'duplicate' }, 409);
      await api('PATCH', `/comments/${comment.id}/moderation`, 'CLIENT', { hidden: true, note: 'QA' }, 403);
      await api('PATCH', `/comments/${comment.id}/moderation`, 'ADMIN', { hidden: true, note: 'QA temporal' });
      assert.equal((await api('GET', `/comments/property/${property.id}`)).length, 0);
      await api('PATCH', `/comments/${comment.id}/moderation`, 'ADMIN', { hidden: false });
      assert.equal((await api('GET', `/comments/property/${property.id}`))[0].content, 'QA: expérience / experiência');
      await api('DELETE', `/reservations/property/${property.id}`, 'OWNER');
      assert.ok(!(await api('GET', '/properties/me/reserved', 'CLIENT')).some(item => item.id === property.id));
      await api('DELETE', `/saved-properties/${property.id}`, 'CLIENT');
      const direct = await api('POST', '/conversations/direct', 'ADMIN', { userId: accounts.CLIENT.id }, 201);
      await api('GET', `/conversations/${direct.id}`, 'CLIENT');
      await api('GET', `/conversations/${direct.id}`, 'OWNER', undefined, 403);
      results.push({ language, requests, passed: true, propertyId: property.id, conversationId: conversation.id });
      console.log(`Flujos ${language}: ${requests} solicitudes verificadas.`);
    }
    return { date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }), method: 'Real local HTTP/JWT/guards/PostgreSQL; outer transaction rolled back',
      checks: results, scope: ['profile', 'draft/publish/review', 'public/private access', 'conversations/messages/read', 'attachments/download/access/type', 'reserve/release', 'saved properties', 'comment/moderation', 'direct conversations'],
      limitations: ['Does not emulate browser rendering or external mail/address providers', 'Physical devices and editorial group review remain external checks'] };
  } finally {
    // Only this UUID-named file created above is removed; existing uploads are untouched.
    fs.unlinkSync(attachment);
  }
};
