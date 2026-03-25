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

export async function notifyNewSignup(email: string): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: "hello@vibestack.build",
      subject: `New signup: ${email}`,
      html: `<p>New user signed up: <strong>${email}</strong></p><p>Time: ${new Date().toISOString()}</p>`,
    });
  } catch {
    // Don't block signup if notification fails
  }
}

export async function sendTeamInviteEmail(to: string, teamName: string, invitedBy: string): Promise<boolean> {
  if (!resend) {
    console.warn(`RESEND_API_KEY not set — team invite email not sent to ${to} for team "${teamName}"`);
    return false;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're invited to join "${teamName}" on VibeStack`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #7c3aed; margin: 0;">VibeStack</h1>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin: 0 0 8px;"><strong>${invitedBy}</strong> invited you to join</p>
            <div style="font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 16px 0;">${teamName}</div>
            <p style="font-size: 14px; color: #888; margin: 16px 0 0;">Log in to VibeStack to accept the invite.</p>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://vibestack.build/projects" style="display: inline-block; padding: 12px 32px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Go to VibeStack</a>
          </div>
          <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 24px;">If you don't have a VibeStack account, sign up first and the invite will be waiting for you.</p>
        </div>
      `,
    });
    console.log(`Team invite email sent to ${to} for team "${teamName}"`);
    return true;
  } catch (err) {
    console.error("Failed to send team invite email:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — password reset email not sent. Code:", code);
    return false;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Reset your VibeStack password",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #7c3aed; margin: 0;">VibeStack</h1>
          </div>
          <div style="background: #f9fafb; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="font-size: 16px; color: #333; margin: 0 0 8px;">Your password reset code is:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e; margin: 16px 0;">${code}</div>
            <p style="font-size: 14px; color: #888; margin: 16px 0 0;">This code expires in 15 minutes.</p>
          </div>
          <p style="font-size: 12px; color: #aaa; text-align: center; margin-top: 24px;">If you didn't request a password reset, ignore this email.</p>
        </div>
      `,
    });
    console.log(`Password reset email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("Failed to send password reset email:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function sendWelcomeEmail(to: string): Promise<boolean> {
  if (!resend) return false;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to VibeStack — let's build something",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; font-weight: 700; color: #7c3aed; margin: 0;">Welcome to VibeStack</h1>
          </div>
          <p style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 16px;">
            You're verified and ready to go. Here's how to get started:
          </p>
          <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="font-size: 15px; color: #333; margin: 0 0 12px; line-height: 1.5;">
              <strong>1. Create a project</strong> — Give it a name and describe what you want to build.
            </p>
            <p style="font-size: 15px; color: #333; margin: 0 0 12px; line-height: 1.5;">
              <strong>2. Chat with Claude</strong> — Ask questions, get suggestions, iterate on your idea.
            </p>
            <p style="font-size: 15px; color: #333; margin: 0; line-height: 1.5;">
              <strong>3. Deploy</strong> — Click Apply & Deploy and your app is live with a real URL, database, and HTTPS.
            </p>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="https://vibestack.build/projects" style="display: inline-block; padding: 12px 32px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Start building</a>
          </div>
          <p style="font-size: 14px; color: #888; line-height: 1.5; margin-bottom: 8px;">
            Your free plan includes 1 project, 10 deploys, and 50 AI chats per month. Need more? <a href="https://vibestack.build/billing" style="color: #7c3aed; text-decoration: none;">Upgrade anytime</a>.
          </p>
          <p style="font-size: 14px; color: #888; line-height: 1.5;">
            Questions? Just reply to this email or reach us at <a href="mailto:hello@vibestack.build" style="color: #7c3aed; text-decoration: none;">hello@vibestack.build</a>.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="font-size: 12px; color: #aaa; text-align: center;">VibeStack — Describe it. Ship it.</p>
        </div>
      `,
    });
    console.log(`Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("Failed to send welcome email:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
