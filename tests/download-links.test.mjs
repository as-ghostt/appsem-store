import test from 'node:test';
import assert from 'node:assert/strict';
import { validatedPlayStoreDownloadUrl, validatedGithubApkDownloadUrl } from '../src/services/safeDownloadUrl.js';

test('No se ofrece navegación a Admin como descarga', () => {
  const admin = 'https://appsem-store-admin.pages.dev/apps/new';
  assert.equal(validatedPlayStoreDownloadUrl(admin), null);
  assert.equal(validatedGithubApkDownloadUrl(admin), null);
  assert.equal(validatedPlayStoreDownloadUrl('https://appsem-store-public.vercel.app/apps/Biblia-Universal/Politicas-de-privacidad/'), null);
});
test('Conservar un enlace de Google Play válido', () => {
  const url = 'https://play.google.com/store/apps/details?id=com.appsmarttechnology.authpro&pcampaignid=web_share';
  assert.equal(validatedPlayStoreDownloadUrl(url), url);
});
test('Conservar una descarga oficial de Github Releases', () => {
  const url = 'https://github.com/as-ghostt/appsem-store/releases/download/apk-botshow-v1.0.0/BotShow.apk';
  assert.equal(validatedGithubApkDownloadUrl(url), url);
  assert.equal(validatedGithubApkDownloadUrl('https://github.com/as-ghostt/appsem-store/releases'), null);
});
