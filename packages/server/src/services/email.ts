import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || "VibeStack <noreply@vibestack.build>";

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — verification email not sent. Code:", code);
    return false;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Verify your VibeStack account",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #7c3aed; margin: 0;">VibeStack</h1>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin: 0 0 8px;">Your verification code is:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e; margin: 16px 0;">${code}</div>
            <p style="font-size: 14px; color: #888; margin: 16px 0 0;">Enter this code in VibeStack to verify your email.</p>
          </div>
          <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 24px;">If you didn't sign up for VibeStack, ignore this email.</p>
        </div>
      `,
    });
    console.log(`Verification email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("Failed to send verification email:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
