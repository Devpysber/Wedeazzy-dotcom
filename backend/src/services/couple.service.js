const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { slugify } = require('../utils/slug');
const { sendTemplate } = require('./whatsapp.service');
const env = require('../config/env');

/**
 * Fetch the couple profile for a user, or throw HttpError with the given
 * status/message. Used by every shortlist/task mutation below — they all
 * require an existing couple profile before acting.
 */
async function getCoupleOrThrow(userId, message, status = 404) {
  const couple = await prisma.couple.findUnique({ where: { userId } });
  if (!couple) throw new HttpError(status, message, 'ERR_NO_COUPLE');
  return couple;
}

async function upsertProfile(user, patch) {
  if (!patch) patch = {};
  const data = {
    partnerName: patch.partnerName ?? undefined,
    weddingDate: patch.weddingDate ? new Date(patch.weddingDate) : undefined,
    city: patch.city ?? undefined,
    citySlug: patch.city ? slugify(patch.city) : undefined,
    budgetMin: patch.budgetMin == null ? undefined : parseInt(patch.budgetMin, 10) || null,
    budgetMax: patch.budgetMax == null ? undefined : parseInt(patch.budgetMax, 10) || null,
    guestCount: patch.guestCount == null ? undefined : parseInt(patch.guestCount, 10) || null,
    vibe: patch.vibe ?? undefined,
    notes: patch.notes ?? undefined,
  };
  // Strip undefined so Prisma doesn't blow away existing values
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

  const existing = await prisma.couple.findUnique({ where: { userId: user.id } });
  let couple;
  if (!existing) {
    couple = await prisma.couple.create({ data: { userId: user.id, ...data } });
    
    // Skip if dummy Google phone placeholder
    if (user.phone && !user.phone.startsWith('google_')) {
      sendTemplate(user.phone, 'couple_welcome', {
        name: user.name || 'there',
        dashboardUrl: `${env.PUBLIC_BASE_URL}/dashboard.html`,
      }).catch(() => {});
    }
  } else {
    couple = await prisma.couple.update({ where: { id: existing.id }, data });
  }
  return couple;
}

async function getMyDashboard(user) {
  const couple = await prisma.couple.findUnique({ where: { userId: user.id } });
  if (!couple) return null;

  const [shortlists, inquiries, planTasks, bookings] = await Promise.all([
    prisma.shortlist.findMany({
      where: { coupleId: couple.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inquiry.findMany({
      where: { coupleUserId: user.id },
      include: {
        vendor: {
          select: {
            businessName: true,
            category: true,
            photos: { orderBy: { position: 'asc' }, take: 1 }
          }
        },
        review: true
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.planTask.findMany({
      where: { coupleId: couple.id },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.booking.findMany({
      where: { coupleId: couple.id },
      include: { vendor: { include: { photos: { take: 1, orderBy: { position: 'asc' } } } } },
      orderBy: { eventDate: 'desc' }
    })
  ]);

  // Hydrate vendor info for each shortlist row
  const vendorIds = shortlists.map(s => s.vendorId);
  const vendors = vendorIds.length
    ? await prisma.vendor.findMany({
        where: { id: { in: vendorIds } },
        include: { photos: { take: 1, orderBy: { position: 'asc' } } },
      })
    : [];
  const vByid = new Map(vendors.map(v => [v.id, v]));
  const fattenedShortlists = shortlists.map(s => ({ ...s, vendor: vByid.get(s.vendorId) || null }));

  return { couple, shortlists: fattenedShortlists, inquiries, planTasks, bookings };
}

async function addShortlist(user, vendorId) {
  const couple = await getCoupleOrThrow(user.id, 'Create your couple profile first', 400);
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new HttpError(404, 'Vendor not found', 'ERR_NO_VENDOR');

  return prisma.shortlist.upsert({
    where: { coupleId_vendorId: { coupleId: couple.id, vendorId } },
    update: {},
    create: { coupleId: couple.id, vendorId },
  });
}

async function removeShortlist(user, vendorId) {
  const couple = await getCoupleOrThrow(user.id, 'No couple profile');
  await prisma.shortlist.deleteMany({ where: { coupleId: couple.id, vendorId } });
  return { ok: true };
}

async function updateTask(user, taskId, patch) {
  const couple = await getCoupleOrThrow(user.id, 'No couple profile found');

  const task = await prisma.planTask.findFirst({
    where: { id: taskId, coupleId: couple.id }
  });
  if (!task) throw new HttpError(404, 'Task not found', 'ERR_NO_TASK');

  const data = {
    title: patch.title ?? undefined,
    category: patch.category ?? undefined,
    done: patch.done == null ? undefined : !!patch.done,
  };
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

  return prisma.planTask.update({
    where: { id: taskId },
    data
  });
}

async function createTask(user, patch) {
  const couple = await getCoupleOrThrow(user.id, 'No couple profile found');

  if (!patch.title) throw new HttpError(400, 'Task title is required', 'ERR_INPUT');

  return prisma.planTask.create({
    data: {
      coupleId: couple.id,
      title: patch.title,
      category: patch.category || 'general',
      done: !!patch.done
    }
  });
}

async function deleteTask(user, taskId) {
  const couple = await getCoupleOrThrow(user.id, 'No couple profile found');

  const task = await prisma.planTask.findFirst({
    where: { id: taskId, coupleId: couple.id }
  });
  if (!task) throw new HttpError(404, 'Task not found', 'ERR_NO_TASK');

  await prisma.planTask.delete({
    where: { id: taskId }
  });
  return { ok: true };
}

module.exports = {
  upsertProfile,
  getMyDashboard,
  addShortlist,
  removeShortlist,
  createTask,
  updateTask,
  deleteTask,
};
