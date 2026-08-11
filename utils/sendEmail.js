import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: `"Mahalaksmi Jewellery" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - Mahalaksmi Jewellery",

      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px">
          <h2 style="color:#3A2528;text-align:center;">
            Mahalaksmi Jewellery
          </h2>

          <p>Hello,</p>

          <p>Thank you for registering with <b>Mahalaksmi Jewellery</b>.</p>

          <p>Your verification code is:</p>

          <div style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#3A2528;text-align:center;margin:30px 0;">
            ${otp}
          </div>

          <p>This OTP is valid for <b>10 minutes</b>.</p>

          <p>If you didn't request this, you can safely ignore this email.</p>

          <hr />

          <p style="font-size:12px;color:#888;text-align:center;">
            © ${new Date().getFullYear()} Mahalaksmi Jewellery
          </p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error("Email Error:", error);
    return false;
  }
};

export default sendEmail;