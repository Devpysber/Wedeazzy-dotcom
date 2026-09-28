/**
 * Couple <-> vendor chat.
 *
 * A Conversation belongs to exactly one enquiry and has exactly two
 * participants: the couple who sent it and the vendor listing's owner. Admin
 * can read every conversation through the admin-only functions at the bottom,
 * but is never a participant: admin reads never change readAt, and nothing
 * returned to a couple or vendor reveals that admin access exists.
 */

const prisma = require('../config/db');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');

const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 300;

// One shape for "not yours" and "does not exist", so guessing ids reveals nothing.
const notFound = () => new HttpError(404, 'Conversation not found', 'ERR_NOT_FOUND');

/**
 * Create the conversation for an enquiry, if the enquiry came from a signed-in
 * couple. Anonymous public-site enquiries have no couple account to chat with.
 * Idempotent: an enquiry never gets a second conversation.
 */
async function ensureForEnquiry(enquiry) {
  if (!enquiry || !enquiry.coupleUserId) return null;
  const couple = await prisma.couple.findUnique({ where: { userId: enquiry.coupleUserId }, select: { id: true } });
  if (!couple) return null;
  return prisma.conversation.upsert({
    where: { enquiryId: enquiry.id },
    update: {},
    create: { enquiryId: enquiry.id, coupleId: couple.id, vendorId: enquiry.vendorId },
  });
}

/** Where-clause for the conversations this user takes part in. */
function participantWhere(user) {
  if (user.role === 'couple') return { couple: { userId: user.id } };
  if (user.role === 'vendor') return { vendor: { userId: user.id } };
  return null;
}

const conversationInclude = {
  enquiry: { select: { id: true, eventDate: true, guests: true, budget: true, notes: true, createdAt: true } },
  couple: { select: { id: true, user: { select: { id: true, name: true } } } },
  vendor: { select: { id: true, businessName: true, category: true, city: true, slug: true, userId: true } },
};

/**
 * The other side of the conversation, from the viewer's point of view.
 * Deliberately contains no contact details: those stay in the enquiry flow.
 */
function counterpart(conv, role) {
  if (role === 'couple') {
    return { name: conv.vendor.businessName, subtitle: [conv.vendor.category, conv.vendor.city].filter(Boolean).join(' · '), slug: conv.vendor.slug };
  }
  return { name: (conv.couple.user && conv.couple.user.name) || 'Couple', subtitle: 'Enquiry for ' + conv.vendor.businessName };
}

async function loadForParticipant(user, conversationId) {
  const where = participantWhere(user);
  if (!where || !conversationId) throw notFound();
  const conv = await prisma.conversation.findFirst({
    where: { id: String(conversationId), ...where },
    include: conversationInclude,
  });
  if (!conv) throw notFound();
  return conv;
}

function shapeMessage(m, viewerId) {
  return { id: m.id, message: m.message, createdAt: m.createdAt, fromMe: m.senderId === viewerId, readAt: m.senderId === viewerId ? m.readAt : undefined };
}

/** Conversation list for a couple or vendor, newest activity first. */
async function listForUser(user) {
  const where = participantWhere(user);
  if (!where) return [];
  const convs = await prisma.conversation.findMany({
    where,
    include: {
      ...conversationInclude,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const unread = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: convs.map((c) => c.id) }, senderId: { not: user.id }, readAt: null },
    _count: { _all: true },
  });
  const unreadBy = Object.fromEntries(unread.map((u) => [u.conversationId, u._count._all]));

  return convs
    .map((c) => {
      const last = c.messages[0] || null;
      return {
        id: c.id,
        enquiryId: c.enquiryId,
        with: counterpart(c, user.role),
        lastMessage: last ? { message: last.message.slice(0, 140), createdAt: last.createdAt, fromMe: last.senderId === user.id } : null,
        unread: unreadBy[c.id] || 0,
        updatedAt: last ? last.createdAt : c.createdAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function unreadCount(user) {
  const where = participantWhere(user);
  if (!where) return 0;
  return prisma.message.count({
    where: { conversation: where, senderId: { not: user.id }, readAt: null },
  });
}

/**
 * Full history for a participant. Opening the conversation marks the other
 * side's messages as read (never the viewer's own).
 */
async function getMessages(user, conversationId) {
  const conv = await loadForParticipant(user, conversationId);
  await prisma.message.updateMany({
    where: { conversationId: conv.id, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  });
  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  return {
    conversation: { id: conv.id, enquiryId: conv.enquiryId, with: counterpart(conv, user.role), enquiry: conv.enquiry },
    messages: messages.reverse().map((m) => shapeMessage(m, user.id)),
  };
}

async function sendMessage(user, conversationId, text) {
  const body = String(text == null ? '' : text).replace(/\r\n/g, '\n').trim();
  if (!body) throw new HttpError(400, 'Message cannot be empty', 'ERR_INPUT');
  if (body.length > MAX_MESSAGE_LENGTH) throw new HttpError(400, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters`, 'ERR_INPUT');
  const conv = await loadForParticipant(user, conversationId);
  const m = await prisma.message.create({ data: { conversationId: conv.id, senderId: user.id, message: body } });
  logger.info({ conversationId: conv.id, messageId: m.id }, 'Chat message sent');
  return shapeMessage(m, user.id);
}

/**
 * Open (or create) the conversation for one of the viewer's own enquiries.
 * Covers enquiries sent before chat existed.
 */
async function openForEnquiry(user, enquiryId) {
  const where = user.role === 'couple' ? { coupleUserId: user.id }
    : user.role === 'vendor' ? { vendor: { userId: user.id } }
    : null;
  if (!where || !enquiryId) throw notFound();
  const enquiry = await prisma.inquiry.findFirst({ where: { id: String(enquiryId), ...where } });
  if (!enquiry) throw notFound();
  const conv = await ensureForEnquiry(enquiry);
  if (!conv) throw new HttpError(404, 'Chat is only available for enquiries sent from a couple account', 'ERR_NO_CHAT');
  return { id: conv.id };
}

/* ---------------- Admin (read-only, never marks anything read) ---------------- */

async function adminList({ q } = {}) {
  const term = String(q || '').trim();
  const convs = await prisma.conversation.findMany({
    where: term ? {
      OR: [
        { vendor: { businessName: { contains: term } } },
        { couple: { user: { name: { contains: term } } } },
        { couple: { user: { email: { contains: term } } } },
      ],
    } : {},
    include: {
      couple: { select: { user: { select: { name: true, email: true } } } },
      vendor: { select: { businessName: true, category: true, city: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: true } },
    },
    take: 500,
  });
  return convs
    .map((c) => ({
      id: c.id,
      enquiryId: c.enquiryId,
      couple: { name: c.couple.user && c.couple.user.name, email: c.couple.user && c.couple.user.email },
      vendor: { businessName: c.vendor.businessName, category: c.vendor.category, city: c.vendor.city },
      messageCount: c._count.messages,
      lastMessage: c.messages[0] ? { message: c.messages[0].message.slice(0, 140), createdAt: c.messages[0].createdAt } : null,
      createdAt: c.createdAt,
      updatedAt: c.messages[0] ? c.messages[0].createdAt : c.createdAt,
    }))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function adminGet(conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: String(conversationId || '') },
    include: {
      ...conversationInclude,
      couple: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!conv) throw notFound();
  const coupleUserId = conv.couple.user && conv.couple.user.id;
  return {
    conversation: {
      id: conv.id,
      enquiryId: conv.enquiryId,
      enquiry: conv.enquiry,
      couple: { name: conv.couple.user && conv.couple.user.name, email: conv.couple.user && conv.couple.user.email },
      vendor: { businessName: conv.vendor.businessName, category: conv.vendor.category, city: conv.vendor.city },
      createdAt: conv.createdAt,
    },
    messages: conv.messages.map((m) => ({
      id: m.id,
      message: m.message,
      createdAt: m.createdAt,
      readAt: m.readAt,
      from: m.senderId === coupleUserId ? 'couple' : m.senderId === conv.vendor.userId ? 'vendor' : 'other',
    })),
  };
}

module.exports = {
  ensureForEnquiry,
  listForUser,
  unreadCount,
  getMessages,
  sendMessage,
  openForEnquiry,
  adminList,
  adminGet,
  MAX_MESSAGE_LENGTH,
};
