export function isAllowedGoogleProfile(profile, allowedEmail) {
  return (
    profile?.email_verified === true &&
    typeof profile.email === "string" &&
    typeof allowedEmail === "string" &&
    profile.email.toLowerCase() === allowedEmail.toLowerCase()
  );
}
