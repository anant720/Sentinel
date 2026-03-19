// Uses Brevo Transactional Email REST API (HTTPS/443) instead of SMTP
// Render free tier blocks outbound SMTP (port 587), so HTTP API is required.

function getInviteTemplate(inviteLink: string, orgName: string, role: string, message?: string) {
    const messageHtml = message ? `
        <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-left: 4px solid #3b82f6; color: #4a5568; font-style: italic;">
            "${message}"
        </div>
    ` : '';

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0f1320; padding: 24px; text-align: center; border-bottom: 2px solid #3b82f6;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Sentinel Core</h1>
        </div>
        <div style="padding: 32px 24px; background-color: #ffffff;">
            <h2 style="color: #1a202c; font-size: 24px; margin-top: 0;">You've been invited</h2>
            <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                You have been invited to join the <strong>${orgName}</strong> organization on Sentinel Core as a <strong>${role.replace('_', ' ').toUpperCase()}</strong>.
            </p>
            ${messageHtml}
            <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteLink}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation</a>
            </div>
            <p style="color: #718096; font-size: 14px; margin-bottom: 0;">
                This link will expire in exactly 1 hour for security reasons.<br/>
                If you did not expect this invitation, you can safely ignore this email.
            </p>
        </div>
        <div style="background-color: #f7fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0;">
            Sentinel Core Security Operations Platform
        </div>
    </div>
    `;
}

export class MailerService {
    static async sendInvite(toEmail: string, rawToken: string, orgName: string, role: string, message?: string) {
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const inviteLink = `${baseUrl}/invite/${rawToken}`;

        const apiKey = process.env.BREVO_API_KEY;

        // No API key configured — dev mode fallback
        if (!apiKey) {
            console.log('\n' + '='.repeat(60));
            console.log('  📧  INVITE LINK (BREVO_API_KEY not set — dev mode)');
            console.log('='.repeat(60));
            console.log(`  To:      ${toEmail}`);
            console.log(`  Org:     ${orgName}`);
            console.log(`  Role:    ${role}`);
            console.log(`  Link:    ${inviteLink}`);
            console.log('='.repeat(60) + '\n');
            return;
        }

        const senderName = process.env.SMTP_FROM_NAME || 'Sentinel Core Security';
        const senderEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '';

        const payload = {
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail }],
            subject: `You have been invited to ${orgName} on Sentinel Core`,
            htmlContent: getInviteTemplate(inviteLink, orgName, role, message)
        };
        console.log(`[Mailer] Preparing to send invite via Brevo API...`);
        console.log(`[Mailer]    - To: ${toEmail}`);
        console.log(`[Mailer]    - Sender: ${senderName} <${senderEmail}>`);

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000) // 15s timeout
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(`[Mailer] ❌ Brevo API error (${response.status}): ${errorBody}`);
            } else {
                const result = await response.json() as { messageId?: string };
                console.log(`[Mailer] ✅ Invite sent successfully!`);
                console.log(`[Mailer]    - To: ${toEmail}`);
                console.log(`[Mailer]    - From: ${senderEmail}`);
                console.log(`[Mailer]    - MessageId: ${result?.messageId}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[Mailer] ❌ Failed to send invite to ${toEmail}: ${msg}`);
        }
    }
}
