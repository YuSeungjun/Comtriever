const hasApiKeyCredentials = Boolean(
  process.env.APPLE_API_KEY
  && process.env.APPLE_API_KEY_ID
  && process.env.APPLE_API_ISSUER,
);

const hasAppleIdCredentials = Boolean(
  process.env.APPLE_ID
  && process.env.APPLE_APP_SPECIFIC_PASSWORD
  && process.env.APPLE_TEAM_ID,
);

const hasKeychainProfile = Boolean(
  process.env.APPLE_KEYCHAIN
  && process.env.APPLE_KEYCHAIN_PROFILE,
);

const hasCertificateFile = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);

if (!hasApiKeyCredentials && !hasAppleIdCredentials && !hasKeychainProfile) {
  fail([
    'Missing Apple notarization credentials.',
    'Set one of these before running npm run dist:mac:',
    '- APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER',
    '- APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID',
    '- APPLE_KEYCHAIN, APPLE_KEYCHAIN_PROFILE',
    '',
    'For local-only packaging without trusted distribution, run npm run dist:mac:unsigned.',
  ]);
}

if (!hasCertificateFile) {
  console.warn(
    [
      'Warning: CSC_LINK/CSC_KEY_PASSWORD are not set.',
      'electron-builder can still use a Developer ID Application certificate from the local Keychain.',
      'If no Developer ID certificate is available, npm run dist:mac will fail because forceCodeSigning is enabled.',
    ].join('\n'),
  );
}

function fail(lines) {
  console.error(lines.join('\n'));
  process.exit(1);
}
