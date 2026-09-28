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

        // Account type (couple/vendor/admin) and intent (login/signup) the
        // user chose, carried through Google's redirect in `state`.
        const { handleGoogleUser, decodeOAuthState } = require('../services/googleAuth');
        const { role, intent } = decodeOAuthState((req.query || {}).state);

        const user = await handleGoogleUser({
          email,
          name: profile.displayName || 'Wedding User',
          googleId: profile.id,
          imageUrl: (profile.photos && profile.photos[0] && profile.photos[0].value) || null,
          requestedRole: role,
          intent,
          verifiedEmail: profile.emails[0].verified === true || profile.emails[0].verified === 'true',
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
