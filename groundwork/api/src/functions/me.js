const { app } = require('@azure/functions');
const {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const { tableClient, principalFrom, entitlements, isAdmin } = require('../lib/common');

// Panel installers live as private blobs (a public repo's releases cannot
// be gated). Download keys map to stable blob names the release workflow
// overwrites on each version, so this list never changes per release.
const PANEL_CONTAINER = 'panel';
const PANEL_BLOBS = {
  'mac-arm64': 'panel-mac-arm64.dmg',
  'mac-x64': 'panel-mac-x64.dmg',
  'win-x64': 'panel-win-x64.exe',
};
const SAS_MINUTES = 10;

/** Short-lived read link for one installer blob. */
function panelDownloadUrl(key) {
  const conn = process.env.STORAGE_CONNECTION_STRING || '';
  const name = conn.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = conn.match(/AccountKey=([^;]+)/)?.[1];
  if (!name || !accountKey) throw new Error('Storage connection string is not usable for SAS');
  const blobName = PANEL_BLOBS[key];
  const credential = new StorageSharedKeyCredential(name, accountKey);
  const expiresOn = new Date(Date.now() + SAS_MINUTES * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: PANEL_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential,
  ).toString();
  return `https://${name}.blob.core.windows.net/${PANEL_CONTAINER}/${blobName}?${sas}`;
}

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request, context) => {
    const principal = principalFrom(request);
    if (!principal) {
      return { status: 401, jsonBody: { error: 'Not signed in' } };
    }
    try {
      const client = tableClient();
      await client.createTable().catch(() => {});
      const ent = await entitlements(client, principal.userId);
      const admin = isAdmin(principal.userId);

      // Download path: /api/me?panelDownload=mac-arm64 hands an entitled
      // user (or an admin, for testing) a link that expires in minutes.
      const downloadKey = new URL(request.url).searchParams.get('panelDownload');
      if (downloadKey) {
        if (!(downloadKey in PANEL_BLOBS)) {
          return { status: 400, jsonBody: { error: 'Unknown download' } };
        }
        if (!ent.panel && !admin) {
          return { status: 403, jsonBody: { error: 'Panel is part of the Panel subscription' } };
        }
        try {
          return { jsonBody: { url: panelDownloadUrl(downloadKey) } };
        } catch (err) {
          context.error('Failed to issue download link', err);
          return { status: 500, jsonBody: { error: 'Could not issue a download link' } };
        }
      }

      return {
        jsonBody: {
          userId: principal.userId,
          userDetails: String(principal.userDetails || ''),
          pro: ent.pro,
          panel: ent.panel,
          admin,
        },
      };
    } catch (err) {
      context.error('Failed to read entitlement', err);
      return { status: 500, jsonBody: { error: 'Failed to load account' } };
    }
  },
});
