import { Link } from "react-router-dom";

const colors = {
  bg: "#0a0a0f",
  card: "#12121a",
  border: "#1e1e30",
  text: "#e0e0e0",
  muted: "#888",
  accent: "#7c3aed",
  link: "#60a5fa",
};

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: colors.bg,
    color: colors.text,
    overflowY: "auto",
    padding: "2rem 1rem 4rem",
  },
  container: {
    maxWidth: 760,
    margin: "0 auto",
  },
  back: {
    color: colors.link,
    textDecoration: "none",
    fontSize: "0.9rem",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: "2rem",
  },
  h1: {
    fontSize: "2.4rem",
    fontWeight: 700,
    marginBottom: "0.5rem",
    background: `linear-gradient(135deg, ${colors.accent}, #a78bfa)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontSize: "1rem",
    color: colors.muted,
    marginBottom: "2.5rem",
    lineHeight: 1.6,
  },
  section: {
    marginBottom: "2.25rem",
  },
  h2: {
    fontSize: "1.35rem",
    fontWeight: 600,
    marginBottom: "0.75rem",
    color: colors.text,
  },
  h3: {
    fontSize: "1.1rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: colors.text,
  },
  p: {
    fontSize: "0.95rem",
    lineHeight: 1.75,
    color: "#bbb",
    marginBottom: "0.75rem",
  },
  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: "1.5rem",
    marginBottom: "1.5rem",
  },
  list: {
    paddingLeft: "1.25rem",
    marginBottom: "0.75rem",
  },
  li: {
    fontSize: "0.95rem",
    lineHeight: 1.75,
    color: "#bbb",
    marginBottom: "0.35rem",
  },
  divider: {
    border: "none",
    borderTop: `1px solid ${colors.border}`,
    margin: "3rem 0",
  },
  contact: {
    color: colors.link,
    textDecoration: "none",
  },
};

export default function Privacy() {
  return (
    <div style={s.page}>
      <div style={s.container}>
        <Link to="/" style={s.back}>&larr; Back to home</Link>

        {/* ---- PRIVACY POLICY ---- */}
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.subtitle}>
          Last updated: March 23, 2026. This policy describes how VibeStack
          ("we", "us", "our") collects, uses, and protects your information.
        </p>

        <div style={s.section}>
          <h2 style={s.h2}>Information We Collect</h2>
          <div style={s.card}>
            <h3 style={s.h3}>Account Information</h3>
            <p style={s.p}>
              When you create a VibeStack account, we collect your email address
              and any profile information you choose to provide. If you sign up
              via a third-party authentication provider, we receive basic profile
              data from that provider.
            </p>

            <h3 style={s.h3}>Application Data</h3>
            <p style={s.p}>
              We store the project descriptions you submit, the generated source
              code, and any data your deployed applications collect (such as form
              submissions stored in your app's database). This data is necessary
              to provide the service.
            </p>

            <h3 style={s.h3}>Usage Data</h3>
            <p style={s.p}>
              We collect standard usage information including pages viewed,
              features used, browser type, IP address, and timestamps. This helps
              us improve the platform and diagnose issues.
            </p>

            <h3 style={s.h3}>Payment Information</h3>
            <p style={{ ...s.p, marginBottom: 0 }}>
              Payment processing is handled entirely by{" "}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={s.contact}>
                Stripe
              </a>
              . We do not store your credit card number, CVV, or full payment
              details on our servers. We receive only a transaction reference and
              basic billing details (such as the last four digits of your card)
              from Stripe.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>How We Use Your Information</h2>
          <div style={s.card}>
            <ul style={s.list}>
              <li style={s.li}>To provide, maintain, and improve the VibeStack platform</li>
              <li style={s.li}>To generate and deploy applications based on your descriptions</li>
              <li style={s.li}>To process payments and manage your subscription</li>
              <li style={s.li}>To send transactional emails (account confirmation, deployment notifications, billing receipts)</li>
              <li style={s.li}>To respond to support requests and communicate with you</li>
              <li style={s.li}>To detect and prevent abuse, fraud, or security threats</li>
              <li style={s.li}>To analyze aggregate usage trends and improve our AI models' performance</li>
            </ul>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We do not sell your personal information. We do not use your data
              for advertising. We do not share your project descriptions or
              generated code with other users.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Third-Party Services</h2>
          <div style={s.card}>
            <p style={s.p}>We use the following third-party services to operate VibeStack:</p>
            <ul style={s.list}>
              <li style={s.li}>
                <strong style={{ color: colors.text }}>Anthropic</strong> — Your
                project descriptions are sent to Anthropic's Claude API for code
                generation. Anthropic's{" "}
                <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={s.contact}>
                  privacy policy
                </a>{" "}
                governs their handling of this data. Anthropic does not use API
                inputs to train their models.
              </li>
              <li style={s.li}>
                <strong style={{ color: colors.text }}>Stripe</strong> — Handles
                all payment processing. See{" "}
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={s.contact}>
                  Stripe's privacy policy
                </a>
                .
              </li>
              <li style={s.li}>
                <strong style={{ color: colors.text }}>Resend</strong> — Handles
                transactional email delivery. See{" "}
                <a href="https://resend.com/privacy" target="_blank" rel="noopener noreferrer" style={s.contact}>
                  Resend's privacy policy
                </a>
                .
              </li>
            </ul>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We do not share your data with any other third parties except as
              required by law.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Cookies</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              VibeStack uses essential cookies to maintain your login session and
              remember your preferences. We do not use advertising cookies or
              third-party tracking cookies. Our analytics are based on
              server-side logging, not browser-based trackers.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Data Storage and Security</h2>
          <div style={s.card}>
            <p style={s.p}>
              Your data is stored on secure servers. Each deployed application
              runs in an isolated container, ensuring that one user's data cannot
              be accessed by another user's application. All data in transit is
              encrypted via HTTPS/TLS.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              While we implement industry-standard security measures, no system
              is 100% secure. We encourage you to use a strong, unique password
              for your VibeStack account.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Data Retention</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We retain your account data and project data for as long as your
              account is active. If you delete your account, we will delete your
              personal information and project data within 30 days, except where
              we are required to retain it for legal or compliance purposes.
              Backups may persist for up to 90 days after deletion.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Your Rights</h2>
          <div style={s.card}>
            <p style={s.p}>You have the right to:</p>
            <ul style={s.list}>
              <li style={s.li}>Access the personal data we hold about you</li>
              <li style={s.li}>Request correction of inaccurate data</li>
              <li style={s.li}>Request deletion of your data and account</li>
              <li style={s.li}>Export your project source code and database contents</li>
              <li style={s.li}>Withdraw consent for non-essential data processing</li>
            </ul>
            <p style={{ ...s.p, marginBottom: 0 }}>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:hello@vibestack.build" style={s.contact}>
                hello@vibestack.build
              </a>
              .
            </p>
          </div>
        </div>

        <hr style={s.divider} />

        {/* ---- TERMS OF SERVICE ---- */}
        <h1 style={{ ...s.h1, marginTop: 0 }}>Terms of Service</h1>
        <p style={s.subtitle}>
          Last updated: March 23, 2026. By using VibeStack, you agree to these
          terms.
        </p>

        <div style={s.section}>
          <h2 style={s.h2}>Overview</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              VibeStack provides an AI-powered platform for generating and
              deploying web applications. These terms govern your use of the
              VibeStack website, dashboard, API, and all deployed applications.
              By creating an account or using the service, you agree to these
              terms in full.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Your Account</h2>
          <div style={s.card}>
            <p style={s.p}>
              You are responsible for maintaining the security of your account
              credentials. You are responsible for all activity that occurs under
              your account. You must be at least 13 years old to use VibeStack.
              If you are using VibeStack on behalf of an organization, you
              represent that you have the authority to bind that organization to
              these terms.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We reserve the right to suspend or terminate accounts that violate
              these terms, engage in abusive behavior, or pose a security risk to
              the platform.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Acceptable Use</h2>
          <div style={s.card}>
            <p style={s.p}>You may not use VibeStack to:</p>
            <ul style={s.list}>
              <li style={s.li}>Build applications that are illegal or promote illegal activity</li>
              <li style={s.li}>Distribute malware, phishing pages, or deceptive content</li>
              <li style={s.li}>Infringe on the intellectual property rights of others</li>
              <li style={s.li}>Harass, abuse, or harm other users or individuals</li>
              <li style={s.li}>Attempt to gain unauthorized access to other users' data or applications</li>
              <li style={s.li}>Overload or disrupt the platform's infrastructure</li>
              <li style={s.li}>Resell access to the platform without authorization</li>
            </ul>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We reserve the right to remove any application that violates these
              guidelines without prior notice.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Intellectual Property</h2>
          <div style={s.card}>
            <p style={s.p}>
              You retain full ownership of the applications you build on
              VibeStack, including the generated source code and any data your
              applications collect. You may export, modify, and redistribute your
              code at any time.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              The VibeStack platform itself — including our brand, logo,
              dashboard interface, documentation, and proprietary infrastructure
              — remains our intellectual property. You may not copy, modify, or
              reverse-engineer the platform.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Billing and Cancellation</h2>
          <div style={s.card}>
            <p style={s.p}>
              Paid plans are billed monthly through Stripe. You can upgrade,
              downgrade, or cancel at any time from your dashboard. Cancellations
              take effect at the end of the current billing period — you will not
              be charged again, and you retain access to paid features until the
              period ends.
            </p>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We do not offer refunds for partial months. If we make significant
              changes to pricing, we will notify you at least 30 days in advance.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Service Availability</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We strive for high uptime but do not guarantee 100% availability.
              The platform may experience downtime for maintenance, updates, or
              unforeseen issues. We are not liable for any losses resulting from
              service interruptions. For mission-critical applications, we
              recommend maintaining your own backups and having a contingency
              plan.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Limitation of Liability</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              VibeStack is provided "as is" without warranties of any kind. To
              the maximum extent permitted by law, we are not liable for any
              indirect, incidental, or consequential damages arising from your
              use of the platform. Our total liability is limited to the amount
              you have paid us in the 12 months preceding the claim.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Changes to These Terms</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              We may update these terms from time to time. When we make
              significant changes, we will notify you via email or through the
              dashboard. Continued use of VibeStack after changes take effect
              constitutes acceptance of the updated terms.
            </p>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.h2}>Contact</h2>
          <div style={s.card}>
            <p style={{ ...s.p, marginBottom: 0 }}>
              For questions about this Privacy Policy or Terms of Service,
              contact us at{" "}
              <a href="mailto:hello@vibestack.build" style={s.contact}>
                hello@vibestack.build
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
