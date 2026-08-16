/**
 * URL-slug helpers shared by vendor/venue signup and admin creation flows.
 */

/**
 * Convert a string into a URL-safe slug (lowercase, hyphen-separated).
 * @param {string} s - Raw input, e.g. "Raj's Wedding Co."
 * @returns {string} e.g. "rajs-wedding-co"
 */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Generate a slug guaranteed to be unique in the given Prisma table,
 * appending an incrementing suffix ("-2", "-3", ...) on collision.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} table - Prisma model name, e.g. "vendor"
 * @param {string} base - Raw string to slugify
 * @returns {Promise<string>} A slug not currently used by `table.slug`
 */
async function uniqueSlug(prisma, table, base) {
  let s = slugify(base) || 'vendor';
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await prisma[table].findUnique({ where: { slug: s } }).catch(() => null);
    if (!exists) return s;
    i += 1;
    s = `${slugify(base)}-${i}`;
  }
}

module.exports = { slugify, uniqueSlug };
