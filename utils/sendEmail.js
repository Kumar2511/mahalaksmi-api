import nodemailer from "nodemailer";

// ==========================================
// Create Gmail Transporter
// ==========================================
//
// IMPORTANT:
// The transporter is created only when needed.
// This ensures process.env is already loaded
// before EMAIL_USER / EMAIL_PASS are read.
//

const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      "EMAIL_USER or EMAIL_PASS is missing from environment variables."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",

    auth: {
      user,
      pass,
    },
  });
};

// ==========================================
// Verify SMTP Configuration
// ==========================================

export const verifyEmailTransporter =
  async () => {
    try {
      const transporter =
        createTransporter();

      await transporter.verify();

      console.log(
        "✅ Email transporter is ready"
      );

      return true;
    } catch (error) {
      console.error(
        "❌ Email transporter error:",
        error.message
      );

      return false;
    }
  };

// ==========================================
// Send OTP Email
// ==========================================

export const sendOtpEmail = async ({
  email,
  otp,
  purpose = "email verification",
}) => {
  try {
    if (!email || !otp) {
      throw new Error(
        "Email and OTP are required."
      );
    }

    const transporter =
      createTransporter();

    const purposeText =
      purpose ===
      "admin-email-change"
        ? "confirm your new administrator email address"
        : purpose ===
          "password-reset"
          ? "reset your password"
          : "verify your email address";

    const subject =
      purpose ===
      "admin-email-change"
        ? "Confirm Your Admin Email - Mahalaksmi Jewellery"
        : purpose ===
          "password-reset"
          ? "Password Reset OTP - Mahalaksmi Jewellery"
          : "Verify Your Email - Mahalaksmi Jewellery";

    await transporter.sendMail({
      from:
        `"Mahalaksmi Jewellery" <${process.env.EMAIL_USER}>`,

      to: email,

      subject,

      html: `
        <!DOCTYPE html>

        <html>
          <head>
            <meta charset="UTF-8" />

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            />

            <title>
              Mahalaksmi Jewellery
            </title>
          </head>

          <body
            style="
              margin:0;
              padding:0;
              background:#f7f3ea;
              font-family:Arial,Helvetica,sans-serif;
              color:#3a2528;
            "
          >

            <div
              style="
                max-width:600px;
                margin:40px auto;
                padding:20px;
              "
            >

              <div
                style="
                  background:#ffffff;
                  border:1px solid #eadfd5;
                  border-radius:18px;
                  padding:36px 28px;
                  box-shadow:0 10px 35px rgba(58,37,40,0.06);
                "
              >

                <!-- BRAND -->

                <div
                  style="
                    text-align:center;
                    margin-bottom:28px;
                  "
                >

                  <div
                    style="
                      font-family:Georgia,serif;
                      font-size:26px;
                      font-weight:bold;
                      letter-spacing:1px;
                      color:#3a2528;
                    "
                  >
                    Mahalaksmi Jewellery
                  </div>

                  <div
                    style="
                      margin-top:8px;
                      font-size:10px;
                      letter-spacing:4px;
                      text-transform:uppercase;
                      color:#c98c78;
                    "
                  >
                    Secure Account Verification
                  </div>

                </div>

                <!-- TITLE -->

                <h2
                  style="
                    margin:0 0 14px;
                    text-align:center;
                    font-family:Georgia,serif;
                    font-size:24px;
                    color:#3a2528;
                  "
                >
                  Verify Your Email
                </h2>

                <!-- MESSAGE -->

                <p
                  style="
                    font-size:15px;
                    line-height:1.7;
                    color:#66595a;
                  "
                >
                  Hello,
                </p>

                <p
                  style="
                    font-size:15px;
                    line-height:1.7;
                    color:#66595a;
                  "
                >
                  Use the verification code below to
                  ${purposeText}.
                </p>

                <!-- OTP -->

                <div
                  style="
                    margin:30px 0;
                    padding:24px;
                    background:#faf7f2;
                    border:1px solid #eadfd5;
                    border-radius:14px;
                    text-align:center;
                  "
                >

                  <div
                    style="
                      font-size:11px;
                      letter-spacing:3px;
                      text-transform:uppercase;
                      color:#9b8582;
                      margin-bottom:12px;
                    "
                  >
                    Verification Code
                  </div>

                  <div
                    style="
                      font-size:34px;
                      font-weight:bold;
                      letter-spacing:9px;
                      color:#3a2528;
                    "
                  >
                    ${otp}
                  </div>

                </div>

                <!-- EXPIRY -->

                <p
                  style="
                    font-size:13px;
                    line-height:1.6;
                    color:#75696a;
                  "
                >
                  This verification code is valid for
                  <strong>10 minutes</strong>.
                </p>

                <p
                  style="
                    font-size:13px;
                    line-height:1.6;
                    color:#75696a;
                  "
                >
                  If you did not request this verification
                  code, you can safely ignore this email.
                </p>

                <!-- DIVIDER -->

                <hr
                  style="
                    border:0;
                    border-top:1px solid #eee5dc;
                    margin:28px 0;
                  "
                />

                <!-- FOOTER -->

                <p
                  style="
                    margin:0;
                    text-align:center;
                    font-size:11px;
                    line-height:1.6;
                    color:#a69a99;
                  "
                >
                  © ${new Date().getFullYear()}
                  Mahalaksmi Jewellery
                  <br />
                  This is an automated security email.
                </p>

              </div>

            </div>

          </body>
        </html>
      `,
    });

    console.log(
      `✅ OTP email sent to ${email}`
    );

    return true;

  } catch (error) {
    console.error(
      "❌ OTP Email Error:",
      error.message
    );

    return false;
  }
};

// ==========================================
// Backward-Compatible Email Function
// ==========================================
//
// Existing controller can continue using:
//
// sendEmail(email, otp)
//

const sendEmail = async (
  email,
  otp
) => {
  return sendOtpEmail({
    email,
    otp,
    purpose:
      "email verification",
  });
};

export default sendEmail;