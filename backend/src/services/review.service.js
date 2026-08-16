const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { sanitizeText } = require('../utils/sanitize');

async function createReview(user, { inquiryId, rating, text }) {
  if (!inquiryId) throw new HttpError(400, 'Inquiry ID is required', 'ERR_INPUT');

  // Verify the inquiry exists and belongs to the current user
  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, coupleUserId: user.id },
    include: { review: true }
  });

  if (!inquiry) {
    throw new HttpError(404, 'Inquiry not found or not associated with your account', 'ERR_NO_INQUIRY');
  }

  // Prevent duplicate reviews
  if (inquiry.review) {
    throw new HttpError(400, 'You have already submitted a review for this inquiry', 'ERR_DUPLICATE_REVIEW');
  }

  const ratingVal = parseFloat(rating);
  if (isNaN(ratingVal) || ratingVal < 1 || ratingVal > 5) {
    throw new HttpError(400, 'Rating must be a number between 1 and 5', 'ERR_INPUT');
  }

  const sanitizedText = sanitizeText(text || '', 500);
  if (!sanitizedText.trim()) {
    throw new HttpError(400, 'Review text is required', 'ERR_INPUT');
  }

  // Create the review
  const review = await prisma.review.create({
    data: {
      vendorId: inquiry.vendorId,
      inquiryId: inquiry.id,
      name: user.name || 'Anonymous Couple',
      rating: ratingVal,
      text: sanitizedText
    }
  });

  // Automatically recalculate the vendor's average rating and total review count
  const aggregate = await prisma.review.aggregate({
    where: { vendorId: inquiry.vendorId },
    _avg: { rating: true },
    _count: { id: true }
  });

  const newAvg = parseFloat((aggregate._avg.rating || ratingVal).toFixed(1));
  const newCount = aggregate._count.id || 1;

  await prisma.vendor.update({
    where: { id: inquiry.vendorId },
    data: {
      rating: newAvg,
      ratingCount: newCount
    }
  });

  return review;
}

module.exports = {
  createReview
};
