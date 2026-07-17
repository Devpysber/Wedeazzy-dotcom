const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('./db');
const env = require('./env');
const logger = require('./logger');

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE.clientId || 'DUMMY_CLIENT_ID',
      clientSecret: env.GOOGLE.clientSecret || 'DUMMY_CLIENT_SECRET',
      callbackURL: env.GOOGLE.callbackUrl,
      proxy: true, // handles HTTPS load balancers on Render/Railway/Hostinger
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) {
          return done(new Error('Google Account does not share email address.'));
        }

        // Decode requested role from state
        const { state } = req.query || {};
        let role = 'couple';
        if (state) {
          try {
            const decoded = Buffer.from(String(state), 'base64').toString('utf8');
            const map = { user: 'couple', business: 'vendor', couple: 'couple', vendor: 'vendor', admin: 'admin' };
            role = map[decoded] || 'couple';
          } catch (_) {}
        }

        const { handleGoogleUser } = require('../services/googleAuth');
        const user = await handleGoogleUser({
          email,
          name: profile.displayName || 'Wedding User',
          googleId: profile.id,
          imageUrl: (profile.photos && profile.photos[0] && profile.photos[0].value) || null,
          requestedRole: role,
        });

        return done(null, user);
      } catch (err) {
        logger.error({ err }, 'Google OAuth Strategy error');
        return done(err);
      }
    }
  )
);

// Session serialization is required by Passport.js internally, 
// even if we run stateless JWT on top.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
