import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter: nodemailer.Transporter | null = null;

// Initialize mailer only if env vars exist
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === '465',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        connectionTimeout: 10000,  // 10s to establish connection
        greetingTimeout: 10000,    // 10s for SMTP greeting
        socketTimeout: 15000,      // 15s for socket inactivity
        logger: false,
        debug: false
    });
}

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
        // Send to frontend via the correct /invite/:token route
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const inviteLink = `${baseUrl}/invite/${rawToken}`;

        if (!transporter) {
            console.log('\n' + '='.repeat(60));
            console.log('  📧  INVITE LINK (SMTP not configured — dev mode)');
            console.log('='.repeat(60));
            console.log(`  To:      ${toEmail}`);
            console.log(`  Org:     ${orgName}`);
            console.log(`  Role:    ${role}`);
            console.log(`  Link:    ${inviteLink}`);
            console.log('='.repeat(60) + '\n');
            console.log('  👆 Share this link with the invitee to accept the invitation.');
            console.log('='.repeat(60) + '\n');
            return;
        }

        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"Sentinel Core" <noreply@sentinel.local>',
                to: toEmail,
                subject: `You have been invited to ${orgName} on Sentinel Core`,
                html: getInviteTemplate(inviteLink, orgName, role, message),
                // Disable SendGrid / Mailgun tracking heuristics headers for privacy hardening
                headers: {
                    'X-Mailgun-Track': 'no',
                    'X-Mailgun-Track-Clicks': 'no',
                    'X-Mailgun-Track-Opens': 'no',
                    'X-SMTPAPI': '{"filters":{"clicktrack":{"settings":{"enable":0}},"opentrack":{"settings":{"enable":0}}}}'
                }
            });
            console.log(`✅ Sent invite email to ${toEmail}`);
        } catch (error) {
            console.error(`❌ Failed to send invite email to ${toEmail}:`, error);
        }
    }
}
