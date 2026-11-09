/**
 * GameQuest mail relay (Google Apps Script web app).
 *
 * Render's free plan blocks outgoing SMTP, so the API sends email over HTTPS to this script,
 * which sends it from your Gmail account (about 100 emails a day on a personal account).
 *
 * Setup:
 * 1. script.google.com > New project, paste this file.
 * 2. Project Settings > Script properties > add RELAY_SECRET = a long random string.
 * 3. Deploy > New deployment > type "Web app":
 *      Execute as: Me
 *      Who has access: Anyone            <- not "Anyone with a Google account"
 *    Authorise the Gmail permission when asked.
 * 4. Copy the Web app URL (ends in /exec) into MAIL_RELAY_URL on Render, and the same secret into MAIL_RELAY_SECRET.
 * 5. After editing this code: Deploy > Manage deployments > edit > Version: New version. The /exec URL stays the same.
 */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (!secret || body.secret !== secret) return reply({ ok: false, error: 'Unauthorized' });
    if (!body.to || !body.subject) return reply({ ok: false, error: 'Missing to or subject' });
    if (MailApp.getRemainingDailyQuota() < 1) return reply({ ok: false, error: 'Daily Gmail quota used up' });

    MailApp.sendEmail({
      to: body.to,
      subject: body.subject,
      body: body.text || '',
      htmlBody: body.html || undefined,
      name: 'GameQuest',
    });
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

// Opening the /exec URL in a browser shows this, which confirms the deployment is reachable.
function doGet() {
  return reply({ ok: true, service: 'gamequest-mail-relay', quotaLeft: MailApp.getRemainingDailyQuota() });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
