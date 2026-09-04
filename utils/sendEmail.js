import nodemailer from "nodemailer";

// ==========================================
// Create Gmail Transporter
// ==========================================
//
// Transporter is created only when required.
// This ensures environment variables are
// already loaded before they are accessed.
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
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    family: 4,

    auth: {
      user,
      pass,
    },
  });
};

// ==========================================
// HTML Escape Helper
// ==========================================

const escapeHtml = (value = "") => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// ==========================================
// Currency Formatter
// ==========================================

const formatCurrency = (amount = 0) => {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ==========================================
// Date Formatter
// ==========================================

const formatDate = (date) => {
  if (!date) return "Not available";

  try {
    return new Date(date).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  } catch {
    return "Not available";
  }
};

// ==========================================
// Date + Time Formatter
// ==========================================

const formatDateTime = (date) => {
  if (!date) return "Not available";

  try {
    return new Date(date).toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  } catch {
    return "Not available";
  }
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
      purpose === "admin-email-change"
        ? "confirm your new administrator email address"
        : purpose === "password-reset"
          ? "reset your password"
          : "verify your email address";

    const subject =
      purpose === "admin-email-change"
        ? "Confirm Your Admin Email - Mahalaksmi Jewellery"
        : purpose === "password-reset"
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

  <title>Mahalaksmi Jewellery</title>
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
        ${escapeHtml(purposeText)}.
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
          ${escapeHtml(otp)}
        </div>

      </div>

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

      <hr
        style="
          border:0;
          border-top:1px solid #eee5dc;
          margin:28px 0;
        "
      />

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

const sendEmail = async (
  email,
  otp
) => {
  return sendOtpEmail({
    email,
    otp,
    purpose: "email verification",
  });
};

// ==========================================
// Send Order Status Email
// ==========================================

export const sendOrderStatusEmail = async ({
  email,
  order,
  previousStatus,
}) => {
  try {
    if (!order) {
      throw new Error(
        "Order details are required."
      );
    }

    // ==========================================
    // Get Email
    // ==========================================

    const recipientEmail =
      email || order.email;

    if (!recipientEmail) {
      throw new Error(
        "Customer email is required."
      );
    }

    // ==========================================
    // Prevent Duplicate Status Email
    // ==========================================

    if (
      previousStatus &&
      previousStatus === order.orderStatus
    ) {
      return true;
    }

    const transporter =
      createTransporter();

    const status =
      order.orderStatus || "Pending";

    // ==========================================
    // Status Content
    // ==========================================

    const statusContent = {
      Pending: {
        title:
          "Order Placed Successfully",
        message:
          "We have received your order successfully. Your order is currently being processed.",
        emoji: "🛍️",
      },

      Confirmed: {
        title:
          "Order Confirmed",
        message:
          "Great news! Your order has been confirmed and will be prepared shortly.",
        emoji: "✅",
      },

      Packed: {
        title:
          "Your Order Has Been Packed",
        message:
          "Your jewellery has been carefully packed and is ready to be shipped.",
        emoji: "📦",
      },

      Shipped: {
        title:
          "Your Order Has Been Shipped",
        message:
          "Your order is on its way! You can use the tracking details below to follow your shipment.",
        emoji: "🚚",
      },

      "Out for Delivery": {
        title:
          "Your Order Is Out for Delivery",
        message:
          "Your order is currently out for delivery and should reach you soon.",
        emoji: "🛵",
      },

      Delivered: {
        title:
          "Your Order Has Been Delivered",
        message:
          "Your order has been successfully delivered. We hope you love your jewellery!",
        emoji: "🎉",
      },

      Cancelled: {
        title:
          "Your Order Has Been Cancelled",
        message:
          "Your order has been cancelled. Please contact our customer care team if you need any assistance.",
        emoji: "❌",
      },
    };

    const content =
      statusContent[status] || {
        title:
          "Order Status Updated",
        message:
          "Your order status has been updated.",
        emoji: "📦",
      };

    // ==========================================
    // Order Number
    // ==========================================

    const orderNumber =
      order._id
        ?.toString()
        .slice(-8)
        .toUpperCase() ||
      "N/A";

    // ==========================================
    // Order Date
    // ==========================================

    const orderDate =
      formatDateTime(
        order.createdAt
      );

    // ==========================================
    // Product Rows
    // ==========================================

    const productRows =
      Array.isArray(order.products)
        ? order.products
            .map((product) => {
              const quantity =
                Number(
                  product.quantity || 0
                );

              const unitPrice =
                Number(
                  product.price || 0
                );

              const itemTotal =
                unitPrice * quantity;

              const image =
                product.image ||
                product.images?.[0] ||
                "";

              const imageHtml =
                image
                  ? `
                    <img
                      src="${escapeHtml(image)}"
                      alt="${escapeHtml(
                        product.name ||
                          "Product"
                      )}"
                      width="70"
                      height="70"
                      style="
                        width:70px;
                        height:70px;
                        object-fit:cover;
                        border-radius:10px;
                        border:1px solid #eadfd5;
                        display:block;
                      "
                    />
                  `
                  : `
                    <div
                      style="
                        width:70px;
                        height:70px;
                        background:#faf7f2;
                        border:1px solid #eadfd5;
                        border-radius:10px;
                        text-align:center;
                        line-height:70px;
                        color:#9b8582;
                        font-size:11px;
                      "
                    >
                      Jewellery
                    </div>
                  `;

              const variantDetails = `
                ${
                  product.color
                    ? `
                      <div
                        style="
                          margin-top:5px;
                          font-size:12px;
                          color:#75696a;
                        "
                      >
                        Color:
                        ${escapeHtml(
                          product.color
                        )}
                      </div>
                    `
                    : ""
                }

                ${
                  product.size
                    ? `
                      <div
                        style="
                          margin-top:3px;
                          font-size:12px;
                          color:#75696a;
                        "
                      >
                        Size:
                        ${escapeHtml(
                          product.size
                        )}
                      </div>
                    `
                    : ""
                }
              `;

              return `
                <tr>

                  <!-- IMAGE -->

                  <td
                    style="
                      padding:14px 8px;
                      vertical-align:top;
                      border-bottom:1px solid #eee5dc;
                    "
                  >
                    ${imageHtml}
                  </td>

                  <!-- PRODUCT -->

                  <td
                    style="
                      padding:14px 8px;
                      vertical-align:top;
                      border-bottom:1px solid #eee5dc;
                    "
                  >

                    <div
                      style="
                        font-size:14px;
                        font-weight:bold;
                        color:#3a2528;
                        line-height:1.5;
                      "
                    >
                      ${escapeHtml(
                        product.name ||
                          "Product"
                      )}
                    </div>

                    ${variantDetails}

                  </td>

                  <!-- QTY -->

                  <td
                    style="
                      padding:14px 8px;
                      text-align:center;
                      vertical-align:top;
                      border-bottom:1px solid #eee5dc;
                      color:#66595a;
                    "
                  >
                    ${quantity}
                  </td>

                  <!-- PRICE -->

                  <td
                    style="
                      padding:14px 8px;
                      text-align:right;
                      vertical-align:top;
                      border-bottom:1px solid #eee5dc;
                      color:#3a2528;
                    "
                  >

                    <div
                      style="
                        font-size:13px;
                        color:#75696a;
                      "
                    >
                      ${formatCurrency(
                        unitPrice
                      )}
                    </div>

                    <div
                      style="
                        margin-top:5px;
                        font-weight:bold;
                        font-size:14px;
                      "
                    >
                      ${formatCurrency(
                        itemTotal
                      )}
                    </div>

                  </td>

                </tr>
              `;
            })
            .join("")
        : "";

    // ==========================================
    // Subtotal
    // ==========================================

    const subtotal =
      Number(
        order.subtotal || 0
      );

    // ==========================================
    // Discount
    // ==========================================

    const discount =
      Number(
        order.discountAmount || 0
      );

    // ==========================================
    // Shipping
    // ==========================================

    const shipping =
      Number(
        order.shippingAmount || 0
      );

    // ==========================================
    // Total
    // ==========================================

    const total =
      Number(
        order.totalAmount || 0
      );

    // ==========================================
    // Coupon
    // ==========================================

    const couponSection =
      order.couponCode
        ? `
          <tr>

            <td
              style="
                padding:7px 0;
                color:#75696a;
              "
            >
              Coupon
            </td>

            <td
              style="
                padding:7px 0;
                text-align:right;
                color:#3a2528;
                font-weight:bold;
              "
            >
              ${escapeHtml(
                order.couponCode
              )}
            </td>

          </tr>
        `
        : "";

    // ==========================================
    // Discount Row
    // ==========================================

    const discountRow =
      discount > 0
        ? `
          <tr>

            <td
              style="
                padding:7px 0;
                color:#75696a;
              "
            >
              Discount
            </td>

            <td
              style="
                padding:7px 0;
                text-align:right;
                color:#3a2528;
              "
            >
              -${formatCurrency(
                discount
              )}
            </td>

          </tr>
        `
        : "";

    // ==========================================
    // Payment Method
    // ==========================================

    const paymentMethod =
      escapeHtml(
        order.paymentMethod ||
          "Not specified"
      );

    // ==========================================
    // Payment Status
    // ==========================================

    const paymentStatus =
      escapeHtml(
        order.paymentStatus ||
          "Pending"
      );

    // ==========================================
    // Delivery Address
    // ==========================================

    const deliveryAddress = `
      <div
        style="
          font-size:14px;
          line-height:1.7;
          color:#66595a;
        "
      >

        <strong
          style="
            color:#3a2528;
          "
        >
          ${escapeHtml(
            order.customerName ||
              "Customer"
          )}
        </strong>

        <br />

        ${escapeHtml(
          order.address || ""
        )}

        <br />

        ${escapeHtml(
          order.city || ""
        )},

        ${escapeHtml(
          order.state || ""
        )}

        -
        ${escapeHtml(
          order.pincode || ""
        )}

        <br />

        Phone:
        ${escapeHtml(
          order.phone || ""
        )}

      </div>
    `;

    // ==========================================
    // Shipping Information
    // ==========================================

    const shippingInformation = `
      ${
        order.courierName
          ? `
            <div
              style="
                margin-bottom:8px;
                color:#66595a;
              "
            >
              <strong>
                Courier:
              </strong>
              ${escapeHtml(
                order.courierName
              )}
            </div>
          `
          : ""
      }

      ${
        order.trackingNumber
          ? `
            <div
              style="
                margin-bottom:8px;
                color:#66595a;
              "
            >
              <strong>
                Tracking Number:
              </strong>
              ${escapeHtml(
                order.trackingNumber
              )}
            </div>
          `
          : ""
      }

      ${
        order.estimatedDelivery
          ? `
            <div
              style="
                margin-bottom:8px;
                color:#66595a;
              "
            >
              <strong>
                Estimated Delivery:
              </strong>
              ${formatDate(
                order.estimatedDelivery
              )}
            </div>
          `
          : ""
      }

      ${
        !order.courierName &&
        !order.trackingNumber &&
        !order.estimatedDelivery
          ? `
            <div
              style="
                color:#75696a;
                font-size:13px;
              "
            >
              Shipping information will be
              updated once your order is prepared
              for dispatch.
            </div>
          `
          : ""
      }
    `;

    // ==========================================
    // Admin Notes
    // ==========================================

    const adminNotesSection =
      order.adminNotes
        ? `
          <div
            style="
              margin-top:22px;
              padding:16px;
              background:#fffaf4;
              border:1px solid #eadfd5;
              border-radius:12px;
            "
          >

            <div
              style="
                font-family:Georgia,serif;
                font-size:16px;
                font-weight:bold;
                color:#3a2528;
                margin-bottom:7px;
              "
            >
              Order Note
            </div>

            <div
              style="
                font-size:13px;
                line-height:1.6;
                color:#66595a;
              "
            >
              ${escapeHtml(
                order.adminNotes
              )}
            </div>

          </div>
        `
        : "";

    // ==========================================
    // UPI Information
    // ==========================================

    const upiInformation =
      order.paymentMethod === "UPI" &&
      order.upiPaymentProof
        ? `
          <div
            style="
              margin-top:22px;
              padding:16px;
              background:#faf7f2;
              border:1px solid #eadfd5;
              border-radius:12px;
            "
          >

            <div
              style="
                font-family:Georgia,serif;
                font-size:16px;
                font-weight:bold;
                color:#3a2528;
                margin-bottom:8px;
              "
            >
              UPI Payment
            </div>

            <div
              style="
                font-size:13px;
                color:#66595a;
              "
            >
              Payment Proof Status:
              <strong>
                ${escapeHtml(
                  order.upiPaymentProof.status ||
                    "Not Submitted"
                )}
              </strong>
            </div>

            ${
              order.upiPaymentProof.adminNote
                ? `
                  <div
                    style="
                      margin-top:7px;
                      font-size:13px;
                      color:#66595a;
                    "
                  >
                    Admin Note:
                    ${escapeHtml(
                      order.upiPaymentProof
                        .adminNote
                    )}
                  </div>
                `
                : ""
            }

          </div>
        `
        : "";

    // ==========================================
    // Cancellation Information
    // ==========================================

    const cancellationInformation =
      status === "Cancelled"
        ? `
          <div
            style="
              margin-top:22px;
              padding:16px;
              background:#fff7f7;
              border:1px solid #eadfd5;
              border-radius:12px;
            "
          >

            <div
              style="
                font-family:Georgia,serif;
                font-size:16px;
                font-weight:bold;
                color:#3a2528;
                margin-bottom:8px;
              "
            >
              Cancellation Information
            </div>

            ${
              order.cancellationFeedback
                ?.reason
                ? `
                  <div
                    style="
                      font-size:13px;
                      color:#66595a;
                      line-height:1.6;
                    "
                  >
                    <strong>
                      Reason:
                    </strong>

                    ${escapeHtml(
                      order.cancellationFeedback
                        .reason
                    )}
                  </div>
                `
                : ""
            }

            ${
              order.cancellationFeedback
                ?.comment
                ? `
                  <div
                    style="
                      margin-top:6px;
                      font-size:13px;
                      color:#66595a;
                      line-height:1.6;
                    "
                  >
                    <strong>
                      Comment:
                    </strong>

                    ${escapeHtml(
                      order.cancellationFeedback
                        .comment
                    )}
                  </div>
                `
                : ""
            }

          </div>
        `
        : "";

    // ==========================================
    // Send Email
    // ==========================================

    await transporter.sendMail({
      from:
        `"Mahalaksmi Jewellery" <${process.env.EMAIL_USER}>`,

      to: recipientEmail,

      subject:
        `${content.emoji} ${content.title} - Mahalaksmi Jewellery`,

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
    ${escapeHtml(content.title)}
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
    max-width:700px;
    margin:30px auto;
    padding:15px;
  "
>

  <div
    style="
      background:#ffffff;
      border:1px solid #eadfd5;
      border-radius:18px;
      padding:30px 24px;
    "
  >

    <!-- ====================================== -->
    <!-- BRAND -->
    <!-- ====================================== -->

    <div
      style="
        text-align:center;
        margin-bottom:28px;
      "
    >

      <div
        style="
          font-family:Georgia,serif;
          font-size:27px;
          font-weight:bold;
          letter-spacing:1px;
          color:#3a2528;
        "
      >
        Mahalaksmi Jewellery
      </div>

      <div
        style="
          margin-top:7px;
          font-size:10px;
          letter-spacing:4px;
          text-transform:uppercase;
          color:#c98c78;
        "
      >
        ${escapeHtml(
          content.title
        )}
      </div>

    </div>

    <!-- ====================================== -->
    <!-- STATUS -->
    <!-- ====================================== -->

    <div
      style="
        text-align:center;
        margin-bottom:25px;
      "
    >

      <div
        style="
          font-size:42px;
          margin-bottom:8px;
        "
      >
        ${content.emoji}
      </div>

      <h2
        style="
          margin:0 0 12px;
          font-family:Georgia,serif;
          font-size:24px;
          color:#3a2528;
        "
      >
        ${escapeHtml(
          content.title
        )}
      </h2>

      <p
        style="
          margin:0;
          font-size:15px;
          line-height:1.7;
          color:#66595a;
        "
      >
        Hello
        ${escapeHtml(
          order.customerName ||
            "Customer"
        )},
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#66595a;
        "
      >
        ${escapeHtml(
          content.message
        )}
      </p>

    </div>

    <!-- ====================================== -->
    <!-- ORDER SUMMARY -->
    <!-- ====================================== -->

    <div
      style="
        background:#faf7f2;
        border:1px solid #eadfd5;
        border-radius:14px;
        padding:18px;
        margin-bottom:25px;
      "
    >

      <table
        width="100%"
        cellspacing="0"
        cellpadding="0"
      >

        <tr>

          <td
            style="
              color:#9b8582;
              font-size:11px;
              letter-spacing:1px;
              text-transform:uppercase;
            "
          >
            Order Number
          </td>

          <td
            style="
              text-align:right;
              font-size:18px;
              font-weight:bold;
              color:#3a2528;
            "
          >
            #${escapeHtml(
              orderNumber
            )}
          </td>

        </tr>

        <tr>

          <td
            style="
              padding-top:10px;
              color:#9b8582;
              font-size:11px;
              letter-spacing:1px;
              text-transform:uppercase;
            "
          >
            Order Date
          </td>

          <td
            style="
              padding-top:10px;
              text-align:right;
              font-size:13px;
              color:#66595a;
            "
          >
            ${escapeHtml(
              orderDate
            )}
          </td>

        </tr>

      </table>

    </div>

    <!-- ====================================== -->
    <!-- PRODUCTS -->
    <!-- ====================================== -->

    <h3
      style="
        font-family:Georgia,serif;
        color:#3a2528;
        margin:0 0 12px;
        font-size:20px;
      "
    >
      Your Items
    </h3>

    <div
      style="
        border:1px solid #eadfd5;
        border-radius:12px;
        overflow:hidden;
      "
    >

      <table
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          border-collapse:collapse;
          font-size:13px;
        "
      >

        <thead>

          <tr
            style="
              background:#faf7f2;
            "
          >

            <th
              style="
                text-align:left;
                padding:11px 8px;
                color:#9b8582;
                font-size:11px;
              "
            >
              Image
            </th>

            <th
              style="
                text-align:left;
                padding:11px 8px;
                color:#9b8582;
                font-size:11px;
              "
            >
              Product
            </th>

            <th
              style="
                text-align:center;
                padding:11px 8px;
                color:#9b8582;
                font-size:11px;
              "
            >
              Qty
            </th>

            <th
              style="
                text-align:right;
                padding:11px 8px;
                color:#9b8582;
                font-size:11px;
              "
            >
              Amount
            </th>

          </tr>

        </thead>

        <tbody>

          ${productRows}

        </tbody>

      </table>

    </div>

    <!-- ====================================== -->
    <!-- PRICE SUMMARY -->
    <!-- ====================================== -->

    <div
      style="
        margin-top:22px;
        padding:18px;
        background:#faf7f2;
        border:1px solid #eadfd5;
        border-radius:12px;
      "
    >

      <table
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          font-size:14px;
        "
      >

        <tr>

          <td
            style="
              padding:7px 0;
              color:#75696a;
            "
          >
            Subtotal
          </td>

          <td
            style="
              padding:7px 0;
              text-align:right;
              color:#3a2528;
            "
          >
            ${formatCurrency(
              subtotal
            )}
          </td>

        </tr>

        ${couponSection}

        ${discountRow}

        <tr>

          <td
            style="
              padding:7px 0;
              color:#75696a;
            "
          >
            Shipping
          </td>

          <td
            style="
              padding:7px 0;
              text-align:right;
              color:#3a2528;
            "
          >
            ${
              shipping === 0
                ? "FREE"
                : formatCurrency(
                    shipping
                  )
            }
          </td>

        </tr>

        <tr>

          <td
            colspan="2"
            style="
              padding-top:14px;
              border-top:1px solid #eadfd5;
            "
          >
          </td>

        </tr>

        <tr>

          <td
            style="
              padding-top:5px;
              font-size:17px;
              font-weight:bold;
              color:#3a2528;
            "
          >
            Total
          </td>

          <td
            style="
              padding-top:5px;
              text-align:right;
              font-size:20px;
              font-weight:bold;
              color:#3a2528;
            "
          >
            ${formatCurrency(
              total
            )}
          </td>

        </tr>

      </table>

    </div>

    <!-- ====================================== -->
    <!-- PAYMENT -->
    <!-- ====================================== -->

    <div
      style="
        margin-top:22px;
        padding:18px;
        background:#ffffff;
        border:1px solid #eadfd5;
        border-radius:12px;
      "
    >

      <h3
        style="
          margin:0 0 12px;
          font-family:Georgia,serif;
          color:#3a2528;
          font-size:18px;
        "
      >
        Payment Details
      </h3>

      <table
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          font-size:13px;
        "
      >

        <tr>

          <td
            style="
              padding:6px 0;
              color:#75696a;
            "
          >
            Payment Method
          </td>

          <td
            style="
              padding:6px 0;
              text-align:right;
              font-weight:bold;
              color:#3a2528;
            "
          >
            ${paymentMethod}
          </td>

        </tr>

        <tr>

          <td
            style="
              padding:6px 0;
              color:#75696a;
            "
          >
            Payment Status
          </td>

          <td
            style="
              padding:6px 0;
              text-align:right;
              font-weight:bold;
              color:#3a2528;
            "
          >
            ${paymentStatus}
          </td>

        </tr>

      </table>

    </div>

    <!-- ====================================== -->
    <!-- DELIVERY ADDRESS -->
    <!-- ====================================== -->

    <div
      style="
        margin-top:22px;
        padding:18px;
        background:#faf7f2;
        border:1px solid #eadfd5;
        border-radius:12px;
      "
    >

      <h3
        style="
          margin:0 0 12px;
          font-family:Georgia,serif;
          color:#3a2528;
          font-size:18px;
        "
      >
        Delivery Address
      </h3>

      ${deliveryAddress}

    </div>

    <!-- ====================================== -->
    <!-- SHIPPING -->
    <!-- ====================================== -->

    <div
      style="
        margin-top:22px;
        padding:18px;
        background:#faf7f2;
        border:1px solid #eadfd5;
        border-radius:12px;
      "
    >

      <h3
        style="
          margin:0 0 12px;
          font-family:Georgia,serif;
          color:#3a2528;
          font-size:18px;
        "
      >
        Shipping Details
      </h3>

      ${shippingInformation}

    </div>

    <!-- ====================================== -->
    <!-- UPI -->
    <!-- ====================================== -->

    ${upiInformation}

    <!-- ====================================== -->
    <!-- CANCELLATION -->
    <!-- ====================================== -->

    ${cancellationInformation}

    <!-- ====================================== -->
    <!-- ADMIN NOTES -->
    <!-- ====================================== -->

    ${adminNotesSection}

    <!-- ====================================== -->
    <!-- FOOTER -->
    <!-- ====================================== -->

    <hr
      style="
        border:0;
        border-top:1px solid #eee5dc;
        margin:30px 0 20px;
      "
    />

    <div
      style="
        text-align:center;
        font-size:12px;
        line-height:1.7;
        color:#a69a99;
      "
    >

      Thank you for shopping with
      <strong>
        Mahalaksmi Jewellery
      </strong>.

      <br />

      If you have any questions regarding
      your order, please contact our
      customer support team.

      <br /><br />

      © ${new Date().getFullYear()}
      Mahalaksmi Jewellery

      <br />

      This is an automated order update email.
      Please do not reply directly to this email.

    </div>

  </div>

</div>

</body>

</html>
      `,
    });

    console.log(
      `✅ Order status email sent to ${recipientEmail} - ${status}`
    );

    return true;

  } catch (error) {
    console.error(
      "❌ Order Status Email Error:",
      error.message
    );

    return false;
  }
};

// ==========================================
// Send Restock Email
// ==========================================

export const sendRestockEmail = async ({ email, product }) => {
  try {
    if (!email || !product) {
      throw new Error("Email and product data are required.");
    }

    const transporter = createTransporter();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const productUrl = `${frontendUrl.replace(/\/$/, "")}/shop/${product._id}`;
    const productImage = product.images?.[0] || product.image || "";
    const productName = escapeHtml(product.name || "Jewellery Item");
    const productPrice = formatCurrency(
      product.discountPrice && product.discountPrice > 0
        ? product.discountPrice
        : product.price
    );
    const productCategory = escapeHtml(product.category || "Antique Jewellery");

    await transporter.sendMail({
      from: `"Mahalaksmi Jewellery" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${productName} is back in stock! - Mahalaksmi Jewellery`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Back In Stock - Mahalaksmi Jewellery</title>
</head>
<body style="margin:0; padding:0; background:#FDFBF9; font-family:Arial,Helvetica,sans-serif; color:#3A2528;">
  <div style="max-width:600px; margin:40px auto; padding:24px; background:#FFFFFF; border:1px solid #EEE5DE; border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,0.05);">
    
    <!-- HEADER BRANDING -->
    <div style="text-align:center; padding-bottom:20px; border-bottom:1px solid #F4EEE9;">
      <h1 style="margin:0; font-family:Georgia,serif; font-size:24px; font-weight:bold; color:#3A2528; letter-spacing:0.05em;">
        Mahalaksmi Jewellery
      </h1>
      <p style="margin:4px 0 0; text-transform:uppercase; font-size:9px; letter-spacing:0.25em; color:#9A7B70;">
        Antique &amp; Fine Jewellery
      </p>
    </div>

    <!-- HERO MESSAGE -->
    <div style="padding:24px 0 16px; text-align:center;">
      <div style="display:inline-block; background:#F8EEE9; width:52px; height:52px; line-height:52px; border-radius:50%; margin-bottom:16px;">
        <span style="font-size:24px;">🔔</span>
      </div>
      <h2 style="margin:0 0 8px; font-family:Georgia,serif; font-size:22px; color:#3A2528;">
        Back In Stock!
      </h2>
      <p style="margin:0; font-size:14px; color:#666666; line-height:1.5;">
        Good news! An item you were waiting for is available again in our catalogue.
      </p>
    </div>

    <!-- PRODUCT CARD -->
    <div style="margin:20px 0; padding:20px; background:#FCFAF7; border:1px solid #E8DFD9; border-radius:14px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          ${
            productImage
              ? `<td width="100" style="vertical-align:top; padding-right:16px;">
                   <img src="${productImage}" alt="${productName}" width="90" style="width:90px; height:90px; object-fit:cover; border-radius:10px; border:1px solid #EEE5DE;" />
                 </td>`
              : ""
          }
          <td style="vertical-align:top;">
            <p style="margin:0 0 4px; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.15em; color:#A78C82;">
              ${productCategory}
            </p>
            <h3 style="margin:0 0 8px; font-family:Georgia,serif; font-size:18px; color:#3A2528;">
              ${productName}
            </h3>
            <p style="margin:0; font-size:16px; font-weight:bold; color:#8D4E67;">
              ${productPrice}
            </p>
          </td>
        </tr>
      </table>
    </div>

    <!-- CALL TO ACTION BUTTON -->
    <div style="text-align:center; padding:16px 0 24px;">
      <a href="${productUrl}" target="_blank" style="display:inline-block; padding:14px 32px; background:#3A2528; color:#FFFFFF; font-size:13px; font-weight:bold; text-transform:uppercase; letter-spacing:0.12em; text-decoration:none; border-radius:12px; box-shadow:0 4px 12px rgba(58,37,40,0.2);">
        VIEW &amp; BUY NOW →
      </a>
    </div>

    <!-- FOOTER -->
    <div style="border-top:1px solid #F4EEE9; text-align:center; font-size:11px; color:#999999; line-height:1.6; padding-top:20px;">
      <p style="margin:0 0 6px;">
        You received this notification because you subscribed to back-in-stock alerts for this item at Mahalaksmi Jewellery.
      </p>
      <p style="margin:0;">
        © ${new Date().getFullYear()} Mahalaksmi Jewellery. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
      `,
    });

    console.log(`✅ Restock email sent successfully to ${email} for product: ${product.name}`);
    return true;
  } catch (error) {
    console.error(`❌ Restock Email Error for ${email}:`, error.message);
    return false;
  }
};

// ==========================================
// Send Admin Alert for New Stock Notification Request
// ==========================================

export const sendAdminStockNotificationEmail = async ({ customerEmail, product }) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!adminEmail || !customerEmail || !product) {
      return false;
    }

    const transporter = createTransporter();
    const productName = escapeHtml(product.name || "Jewellery Item");
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const adminStockUrl = `${frontendUrl.replace(/\/$/, "")}/admin/stock-notifications`;

    await transporter.sendMail({
      from: `"Mahalaksmi System" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `[Admin Alert] Restock Request for ${productName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>New Stock Notification Request</title>
</head>
<body style="margin:0; padding:0; background:#FDFBF9; font-family:Arial,Helvetica,sans-serif; color:#3A2528;">
  <div style="max-width:600px; margin:30px auto; padding:24px; background:#FFFFFF; border:1px solid #EEE5DE; border-radius:16px;">
    
    <h2 style="margin:0 0 12px; font-family:Georgia,serif; color:#3A2528; font-size:20px;">
      🔔 New Restock Alert Request
    </h2>
    <p style="margin:0 0 16px; font-size:14px; color:#555555; line-height:1.5;">
      A customer has requested to be notified when the following item is restocked:
    </p>

    <div style="margin:16px 0; padding:16px; background:#FCFAF7; border:1px solid #E8DFD9; border-radius:12px;">
      <p style="margin:0 0 6px; font-size:13px;"><strong>Customer Email:</strong> ${escapeHtml(customerEmail)}</p>
      <p style="margin:0 0 6px; font-size:13px;"><strong>Product Name:</strong> ${productName}</p>
      <p style="margin:0 0 6px; font-size:13px;"><strong>Product ID:</strong> ${product._id}</p>
      <p style="margin:0; font-size:13px;"><strong>Requested At:</strong> ${formatDateTime(new Date())}</p>
    </div>

    <div style="text-align:center; padding-top:12px;">
      <a href="${adminStockUrl}" target="_blank" style="display:inline-block; padding:12px 24px; background:#3A2528; color:#FFFFFF; font-size:12px; font-weight:bold; text-transform:uppercase; text-decoration:none; border-radius:10px;">
        View Stock Notifications Page →
      </a>
    </div>

  </div>
</body>
</html>
      `,
    });

    console.log(`✅ Admin stock alert email sent to ${adminEmail} for product: ${product.name}`);
    return true;
  } catch (error) {
    console.error("❌ Admin Stock Notification Email Error:", error.message);
    return false;
  }
};

// ==========================================
// Default Export
// ==========================================

export default sendEmail;