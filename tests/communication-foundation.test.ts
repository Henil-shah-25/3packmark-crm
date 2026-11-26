import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Msg91ProviderAdapter,
  calculateSmsSegments,
  interpolateTemplateVariables,
  getCommunicationAdapter,
} from '../src/lib/communication/adapter';
import { crmRepo } from '../src/lib/google-sheets/repository';
import { formatDateTime, DEFAULT_TIMEZONE } from '../src/lib/dateTime';

describe('Communication Centre & Customer Messaging Foundation Tests', { concurrency: 1 }, () => {
  // 1. PROVIDER ADAPTER & MSG91 PENDING ARCHITECTURE
  test('MSG91 Adapter strictly reports disconnected status and never fabricates delivery', async () => {
    const adapter = new Msg91ProviderAdapter();
    assert.equal(adapter.providerId, 'msg91');
    assert.deepEqual(adapter.supportedChannels, ['whatsapp', 'sms']);

    // Attempting WhatsApp send without provider connection
    const waResult = await adapter.sendMessage({
      workspaceId: 'ws-test',
      channel: 'whatsapp',
      recipient: '+919876543210',
      content: 'Hello from Developster CRM',
    });

    assert.equal(waResult.success, false, 'Must not claim success without configured provider');
    assert.equal(waResult.status, 'failed');
    assert.equal(waResult.errorCode, 'PROVIDER_NOT_CONNECTED');
    assert.match(waResult.error || '', /MSG91/i);

    // Attempting SMS send
    const smsResult = await adapter.sendMessage({
      workspaceId: 'ws-test',
      channel: 'sms',
      recipient: '+919876543210',
      content: 'Quick follow-up SMS',
    });
    assert.equal(smsResult.success, false);
    assert.equal(smsResult.status, 'failed');

    // Validation check
    const validation = await adapter.validateConfiguration('ws-test');
    assert.equal(validation.isValid, false, 'Validation must report false when provider is pending');

    // Message status inquiry
    const statusResp = await adapter.getMessageStatus('prov-msg-123');
    assert.equal(statusResp.status, 'failed');
  });

  // 2. SMS CHARACTER COUNTING & GSM SEGMENT BOUNDARY
  test('SMS segment calculator correctly parses standard GSM-7 vs Unicode boundaries', () => {
    // Standard GSM single segment (up to 160)
    const shortText = 'Hi customer, your consultation is confirmed.';
    const shortRes = calculateSmsSegments(shortText);
    assert.equal(shortRes.charCount, shortText.length);
    assert.equal(shortRes.segmentCount, 1);
    assert.equal(shortRes.isUnicode, false);
    assert.equal(shortRes.charsRemaining, 160 - shortText.length);

    // Multi-part GSM (concatenated at 153 chars/segment)
    const longText = 'A'.repeat(165);
    const longRes = calculateSmsSegments(longText);
    assert.equal(longRes.segmentCount, 2);
    assert.equal(longRes.isUnicode, false);
    assert.equal(longRes.charsRemaining, 2 * 153 - 165);

    // Unicode / Emojis / Indic scripts (70 char single segment boundary)
    const hindiText = 'नमस्ते ग्राहक, आपका स्वागत है।';
    const unicodeRes = calculateSmsSegments(hindiText);
    assert.equal(unicodeRes.isUnicode, true);
    assert.equal(unicodeRes.segmentCount, 1);
    assert.equal(unicodeRes.charsRemaining, 70 - hindiText.length);

    // Multi-part Unicode (concatenated at 67 chars/segment)
    const longUnicode = '🙏'.repeat(40); // 80 chars
    const multiUnicode = calculateSmsSegments(longUnicode);
    assert.equal(multiUnicode.isUnicode, true);
    assert.equal(multiUnicode.segmentCount, 2);
  });

  // 3. TEMPLATE VARIABLE INTERPOLATION
  test('Template engine safely interpolates customer and business variables', () => {
    const rawTemplate = 'Hello {{customer_name}}, your order {{order_id}} is ready at {{business_name}}. Handled by {{employee_name}}.';
    const variables = {
      customer_name: 'Ananya Sharma',
      business_name: 'Acme Retail India',
      employee_name: 'Aarav Mehta',
      order_id: 'ORD-99201',
    };

    const rendered = interpolateTemplateVariables(rawTemplate, variables);
    assert.equal(
      rendered,
      'Hello Ananya Sharma, your order ORD-99201 is ready at Acme Retail India. Handled by Aarav Mehta.'
    );

    // Missing variables should safely remain unchanged or intact
    const partialTemplate = 'Hello {{customer_name}}, token: {{missing_token}}';
    const partialRendered = interpolateTemplateVariables(partialTemplate, { customer_name: 'Vikram' });
    assert.equal(partialRendered, 'Hello Vikram, token: {{missing_token}}');
  });

  // 4. MULTI-WORKSPACE CONVERSATION ISOLATION & DRAFT LIFECYCLE
  test('Conversations and messages enforce strict multi-workspace isolation and draft persistence', async () => {
    const wsAlpha = `ws-comm-alpha-${Date.now()}`;
    const wsBeta = `ws-comm-beta-${Date.now()}`;

    // Create conversation in Workspace Alpha
    const convAlpha = await crmRepo.createConversation(wsAlpha, {
      workspaceId: wsAlpha,
      customerName: 'Priya Patel',
      customerPhone: '+919123456789',
      customerEmail: 'priya@example.com',
      channel: 'whatsapp',
      status: 'open',
      assignedEmployeeName: 'Agent A',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Initial message',
      lastMessageDirection: 'outbound',
      unreadCount: 0,
    });

    assert.ok(convAlpha.id);
    assert.equal(convAlpha.workspaceId, wsAlpha);

    // Workspace Beta must not see Alpha's conversations
    const betaConvs = await crmRepo.getConversations(wsBeta);
    assert.equal(betaConvs.length, 0, 'Workspace Beta must have zero access to Alpha conversations');

    const alphaConvs = await crmRepo.getConversations(wsAlpha);
    assert.equal(alphaConvs.length, 1);
    assert.equal(alphaConvs[0].customerName, 'Priya Patel');

    // Create Message Draft in Alpha
    const draftMsg = await crmRepo.createMessage(wsAlpha, {
      workspaceId: wsAlpha,
      conversationId: convAlpha.id,
      channel: 'whatsapp',
      direction: 'outbound',
      senderName: 'Agent A',
      recipient: '+919123456789',
      content: 'Draft proposal for website redesign',
      status: 'draft',
      metadata: {
        characterCount: 35,
      },
    });

    assert.equal(draftMsg.status, 'draft', 'Draft status must remain draft');

    // Verify parent conversation preview updated
    const updatedConv = await crmRepo.getConversationById(wsAlpha, convAlpha.id);
    assert.ok(updatedConv);
    assert.equal(updatedConv.lastMessagePreview, 'Draft proposal for website redesign');

    // Messages retrieval
    const messages = await crmRepo.getMessages(wsAlpha, convAlpha.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, draftMsg.id);
  });

  // 5. CUSTOMER TIMELINE AGGREGATION
  test('Customer timeline unifies messages, calls, and notes with Asia/Kolkata timestamps', async () => {
    const wsId = `ws-cust-timeline-${Date.now()}`;
    const custId = `cust-test-${Date.now()}`;

    // Add WhatsApp draft
    await crmRepo.createMessage(wsId, {
      workspaceId: wsId,
      conversationId: `conv-${Date.now()}`,
      customerId: custId,
      channel: 'whatsapp',
      direction: 'outbound',
      senderName: 'Sanjay',
      recipient: '+919999900000',
      content: 'WhatsApp welcome draft',
      status: 'draft',
    });

    // Add SMS draft
    await crmRepo.createMessage(wsId, {
      workspaceId: wsId,
      conversationId: `conv-${Date.now()}`,
      customerId: custId,
      channel: 'sms',
      direction: 'outbound',
      senderName: 'Sanjay',
      recipient: '+919999900000',
      content: 'SMS reminder draft',
      status: 'draft',
    });

    // Fetch customer timeline
    const timeline = await crmRepo.getCustomerTimeline(wsId, custId);
    assert.equal(timeline.length, 2);

    // Verify timestamps format properly in IST
    const istFormatted = formatDateTime(timeline[0].createdAt, { includeTimezoneName: true });
    assert.match(istFormatted, /IST/i, 'Timeline timestamps must format in Asia/Kolkata (IST)');
  });

  // 6. TEMPLATES REPOSITORY CRUD
  test('Communication templates support multi-channel creation, editing, and deletion', async () => {
    const wsId = `ws-tmpl-${Date.now()}`;

    const newTmpl = await crmRepo.createCommunicationTemplate(wsId, {
      workspaceId: wsId,
      name: 'Festive Offer (WhatsApp)',
      channel: 'whatsapp',
      category: 'Promotional',
      content: 'Happy Diwali {{customer_name}}! Exclusive discount from {{business_name}}.',
      variables: ['customer_name', 'business_name'],
      isExternalApproved: false,
    });

    assert.ok(newTmpl.id);
    assert.equal(newTmpl.channel, 'whatsapp');

    // Retrieve
    const fetched = await crmRepo.getCommunicationTemplates(wsId, 'whatsapp');
    const match = fetched.find((t) => t.id === newTmpl.id);
    assert.ok(match);
    assert.equal(match.name, 'Festive Offer (WhatsApp)');

    // Update
    const updated = await crmRepo.updateCommunicationTemplate(wsId, newTmpl.id, {
      category: 'Seasonal',
    });
    assert.equal(updated?.category, 'Seasonal');

    // Delete
    const deleted = await crmRepo.deleteCommunicationTemplate(wsId, newTmpl.id);
    assert.equal(deleted, true);
  });
});

