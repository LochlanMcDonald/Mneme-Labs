// Best-effort transactional email via Azure Communication Services.
//
// Configured by app settings; when any is missing, sendEmail is a no-op
// (logs and returns false) so the app keeps working without email set up:
//   ACS_EMAIL_CONNECTION_STRING  ACS resource connection string
//   EMAIL_SENDER                 verified sender address
//   ADMIN_NOTIFY_EMAIL           where new-question alerts go
//
// See groundwork/docs/pro-tier.md for setup.

const ADMIN_NOTIFY_EMAIL = () => String(process.env.ADMIN_NOTIFY_EMAIL || '').trim();

async function sendEmail({ to, subject, text }, context) {
  const conn = process.env.ACS_EMAIL_CONNECTION_STRING;
  const sender = String(process.env.EMAIL_SENDER || '').trim();
  if (!conn || !sender || !to) {
    context?.log?.('Email not configured; skipping notification');
    return false;
  }
  try {
    // Lazily required so the function app runs even if the package or the
    // configuration is absent.
    const { EmailClient } = require('@azure/communication-email');
    const client = new EmailClient(conn);
    const poller = await client.beginSend({
      senderAddress: sender,
      content: { subject, plainText: text },
      recipients: { to: [{ address: to }] },
    });
    await poller.pollUntilDone();
    return true;
  } catch (err) {
    context?.error?.('Failed to send email', err);
    return false;
  }
}

module.exports = { sendEmail, ADMIN_NOTIFY_EMAIL };
