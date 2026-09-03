import { createRequire } from "module";
import Order from "../models/Order.js";

// =====================================================
// PDFKIT - FORCE NODE VERSION
// =====================================================

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

// =====================================================
// HELPERS
// =====================================================

const money = (value) => {
  const amount = Number(value || 0);

  return `Rs.${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const safeText = (value, fallback = "-") => {
  const text = String(value ?? "").trim();

  return text || fallback;
};

const formatDate = (date) => {
  if (!date) return "-";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return "-";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const createInvoiceNumber = (order) => {
  const date = new Date(
    order.createdAt || Date.now()
  );

  const year = String(
    date.getFullYear()
  ).slice(-2);

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  const id = String(order._id)
    .slice(-8)
    .toUpperCase();

  return `MH-${year}${month}${day}-${id}`;
};

const getPaymentReference = (order) => {
  if (order.razorpayPaymentId) {
    return order.razorpayPaymentId;
  }

  if (order.razorpayOrderId) {
    return order.razorpayOrderId;
  }

  return "";
};

const getPaymentStatus = (order) => {
  const paymentStatus = String(
    order.paymentStatus || ""
  ).toLowerCase();

  if (paymentStatus === "paid") {
    return "Paid";
  }

  if (
    String(order.paymentMethod || "")
      .toUpperCase() === "COD"
  ) {
    return "Pay on Delivery";
  }

  return safeText(
    order.paymentStatus,
    "Pending"
  );
};

// =====================================================
// GENERATE PDF BUFFER
// =====================================================
//
// IMPORTANT:
// We generate the complete PDF first.
// Only after successful generation do we send it.
//
// This prevents:
// ERR_STREAM_WRITE_AFTER_END
// =====================================================

const generateInvoicePDF = async (order) => {
  return new Promise((resolve, reject) => {
    let settled = false;

    const chunks = [];

    const invoiceNumber =
      createInvoiceNumber(order);

    let doc;

    try {
      // =================================================
      // CREATE PDF DOCUMENT
      // =================================================

      doc = new PDFDocument({
        size: "A4",
        margin: 45,
        info: {
          Title: `Invoice ${invoiceNumber}`,
          Author: "Mahalaksmi Jewellery",
          Subject: `Order Invoice ${order._id}`,
        },
      });

      // =================================================
      // PDF EVENTS
      // =================================================

      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });

      doc.on("error", (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      doc.on("end", () => {
        if (!settled) {
          settled = true;

          resolve(
            Buffer.concat(chunks)
          );
        }
      });

      // =================================================
      // PAGE DIMENSIONS
      // =================================================

      const pageWidth =
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right;

      // =================================================
      // HEADER
      // =================================================

      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#211815")
        .text(
          "MAHALAKSMI",
          45,
          45
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#8a6a5c")
        .text(
          "JEWELLERY",
          45,
          71
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(20)
        .fillColor("#211815")
        .text(
          "INVOICE",
          390,
          48,
          {
            width: 160,
            align: "right",
          }
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#666666")
        .text(
          `Invoice No: ${invoiceNumber}`,
          390,
          75,
          {
            width: 160,
            align: "right",
          }
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#666666")
        .text(
          `Invoice Date: ${formatDate(
            order.createdAt
          )}`,
          390,
          89,
          {
            width: 160,
            align: "right",
          }
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Order ID: ${String(
            order._id
          ).toUpperCase()}`,
          390,
          103,
          {
            width: 160,
            align: "right",
          }
        );

      // =================================================
      // DIVIDER
      // =================================================

      doc
        .moveTo(45, 125)
        .lineTo(550, 125)
        .strokeColor("#dbc8c0")
        .lineWidth(1)
        .stroke();

      // =================================================
      // BILL TO / SHIP TO
      // =================================================

      const infoTop = 145;

      // -------------------------------------------------
      // BILL TO
      // -------------------------------------------------

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#211815")
        .text(
          "BILL TO",
          45,
          infoTop
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#444444")
        .text(
          safeText(
            order.customerName
          ),
          45,
          infoTop + 18
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          safeText(order.address),
          45,
          infoTop + 33,
          {
            width: 220,
          }
        );

      doc.text(
        `${safeText(
          order.city
        )}, ${safeText(
          order.state
        )} - ${safeText(
          order.pincode
        )}`,
        45,
        infoTop + 63
      );

      doc.text(
        `Phone: ${safeText(
          order.phone
        )}`,
        45,
        infoTop + 78
      );

      if (order.email) {
        doc.text(
          `Email: ${safeText(
            order.email
          )}`,
          45,
          infoTop + 93
        );
      }

      // -------------------------------------------------
      // SHIP TO
      // -------------------------------------------------

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#211815")
        .text(
          "SHIP TO",
          310,
          infoTop
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#444444")
        .text(
          safeText(
            order.customerName
          ),
          310,
          infoTop + 18
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .text(
          safeText(order.address),
          310,
          infoTop + 33,
          {
            width: 220,
          }
        );

      doc.text(
        `${safeText(
          order.city
        )}, ${safeText(
          order.state
        )} - ${safeText(
          order.pincode
        )}`,
        310,
        infoTop + 63
      );

      doc.text(
        `Phone: ${safeText(
          order.phone
        )}`,
        310,
        infoTop + 78
      );

      // =================================================
      // PAYMENT INFORMATION
      // =================================================

      const paymentTop = 275;

      doc
        .roundedRect(
          45,
          paymentTop,
          pageWidth,
          72,
          6
        )
        .fillAndStroke(
          "#faf6f4",
          "#eadbd5"
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#211815")
        .text(
          "PAYMENT INFORMATION",
          60,
          paymentTop + 13
        );

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#444444")
        .text(
          `Method: ${safeText(
            order.paymentMethod
          )}`,
          60,
          paymentTop + 32
        );

      doc.text(
        `Status: ${getPaymentStatus(
          order
        )}`,
        60,
        paymentTop + 49
      );

      const reference =
        getPaymentReference(order);

      if (reference) {
        doc.text(
          `Reference: ${reference}`,
          300,
          paymentTop + 32,
          {
            width: 220,
          }
        );
      }

      doc.text(
        `Order Status: ${safeText(
          order.orderStatus
        )}`,
        300,
        paymentTop + 49,
        {
          width: 220,
        }
      );

      // =================================================
      // PRODUCT TABLE
      // =================================================

      const tableTop = 375;

      const colProduct = 45;
      const colQty = 335;
      const colPrice = 395;
      const colTotal = 475;

      // -------------------------------------------------
      // TABLE HEADER
      // -------------------------------------------------

      doc
        .rect(
          45,
          tableTop,
          pageWidth,
          30
        )
        .fill("#211815");

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#ffffff")
        .text(
          "PRODUCT",
          colProduct + 8,
          tableTop + 10
        );

      doc.text(
        "QTY",
        colQty,
        tableTop + 10
      );

      doc.text(
        "PRICE",
        colPrice,
        tableTop + 10
      );

      doc.text(
        "TOTAL",
        colTotal,
        tableTop + 10
      );

      // =================================================
      // PRODUCTS
      // =================================================

      let rowY =
        tableTop + 30;

      const products =
        Array.isArray(order.products)
          ? order.products
          : [];

      if (products.length === 0) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#777777")
          .text(
            "No products found.",
            colProduct + 8,
            rowY + 14
          );

        rowY += 42;
      }

      products.forEach(
        (product, index) => {
          const quantity =
            Number(
              product.quantity || 0
            );

          const price =
            Number(
              product.price || 0
            );

          const lineTotal =
            quantity * price;

          const rowHeight = 42;

          // Alternating background
          if (index % 2 === 0) {
            doc
              .rect(
                45,
                rowY,
                pageWidth,
                rowHeight
              )
              .fill("#fcfaf9");
          }

          // Product name
          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#333333")
            .text(
              safeText(
                product.name
              ),
              colProduct + 8,
              rowY + 9,
              {
                width: 270,
              }
            );

          // Variant
          const variantParts = [];

          if (product.color) {
            variantParts.push(
              `Color: ${product.color}`
            );
          }

          if (product.size) {
            variantParts.push(
              `Size: ${product.size}`
            );
          }

          if (
            variantParts.length > 0
          ) {
            doc
              .font("Helvetica")
              .fontSize(7)
              .fillColor("#888888")
              .text(
                variantParts.join(
                  " | "
                ),
                colProduct + 8,
                rowY + 24,
                {
                  width: 270,
                }
              );
          }

          // Quantity
          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#333333")
            .text(
              String(quantity),
              colQty,
              rowY + 14
            );

          // Price
          doc.text(
            money(price),
            colPrice,
            rowY + 14
          );

          // Total
          doc
            .font("Helvetica-Bold")
            .text(
              money(lineTotal),
              colTotal,
              rowY + 14
            );

          rowY += rowHeight;

          // Divider
          doc
            .moveTo(
              45,
              rowY
            )
            .lineTo(
              550,
              rowY
            )
            .strokeColor(
              "#eee4df"
            )
            .lineWidth(0.5)
            .stroke();
        }
      );

      // =================================================
      // TOTALS
      // =================================================

      rowY += 20;

      const totalsX = 350;
      const totalsValueX = 475;

      // -------------------------------------------------
      // SUBTOTAL
      // -------------------------------------------------

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#555555")
        .text(
          "Subtotal",
          totalsX,
          rowY
        );

      doc
        .text(
          money(order.subtotal),
          totalsValueX,
          rowY,
          {
            width: 75,
            align: "right",
          }
        );

      rowY += 18;

      // -------------------------------------------------
      // DISCOUNT
      // -------------------------------------------------

      if (
        Number(
          order.discountAmount || 0
        ) > 0
      ) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#555555")
          .text(
            "Discount",
            totalsX,
            rowY
          );

        doc
          .fillColor("#2e7d32")
          .text(
            `-${money(
              order.discountAmount
            )}`,
            totalsValueX,
            rowY,
            {
              width: 75,
              align: "right",
            }
          );

        rowY += 18;

        if (order.couponCode) {
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#888888")
            .text(
              `Coupon: ${safeText(
                order.couponCode
              )}`,
              totalsX,
              rowY
            );

          rowY += 14;
        }
      }

      // -------------------------------------------------
      // SHIPPING
      // -------------------------------------------------

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#555555")
        .text(
          "Shipping",
          totalsX,
          rowY
        );

      doc.text(
        money(
          order.shippingAmount
        ),
        totalsValueX,
        rowY,
        {
          width: 75,
          align: "right",
        }
      );

      rowY += 25;

      // -------------------------------------------------
      // TOTAL DIVIDER
      // -------------------------------------------------

      doc
        .moveTo(
          totalsX,
          rowY
        )
        .lineTo(
          550,
          rowY
        )
        .strokeColor(
          "#dbc8c0"
        )
        .lineWidth(1)
        .stroke();

      rowY += 15;

      // -------------------------------------------------
      // GRAND TOTAL
      // -------------------------------------------------

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#211815")
        .text(
          "GRAND TOTAL",
          totalsX,
          rowY
        );

      doc
        .font("Helvetica-Bold")
        .text(
          money(
            order.totalAmount
          ),
          totalsValueX,
          rowY,
          {
            width: 75,
            align: "right",
          }
        );

      // =================================================
      // SHIPPING DETAILS
      // =================================================

      const shippingTop =
        Math.max(
          rowY + 55,
          650
        );

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#211815")
        .text(
          "SHIPPING DETAILS",
          45,
          shippingTop
        );

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#555555");

      if (order.courierName) {
        doc.text(
          `Courier: ${safeText(
            order.courierName
          )}`,
          45,
          shippingTop + 18
        );
      }

      if (order.trackingNumber) {
        doc.text(
          `Tracking Number: ${safeText(
            order.trackingNumber
          )}`,
          45,
          shippingTop + 33
        );
      }

      if (
        order.estimatedDelivery
      ) {
        doc.text(
          `Estimated Delivery: ${formatDate(
            order.estimatedDelivery
          )}`,
          45,
          shippingTop + 48
        );
      }

      // =================================================
      // FOOTER
      // =================================================

      const footerY =
        doc.page.height - 85;

      doc
        .moveTo(
          45,
          footerY - 12
        )
        .lineTo(
          550,
          footerY - 12
        )
        .strokeColor(
          "#eadbd5"
        )
        .lineWidth(1)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#211815")
        .text(
          "Thank you for shopping with Mahalaksmi Jewellery.",
          45,
          footerY
        );

      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#888888")
        .text(
          "This is a computer-generated invoice and does not require a signature.",
          45,
          footerY + 16
        );

      doc.text(
        `Generated: ${formatDateTime(
          new Date()
        )}`,
        45,
        footerY + 29
      );

      // =================================================
      // FINISH
      // =================================================

      doc.end();
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
};

// =====================================================
// SEND PDF RESPONSE
// =====================================================

const sendInvoicePDF = async (
  order,
  res
) => {
  const invoiceNumber =
    createInvoiceNumber(order);

  const filename =
    `${invoiceNumber}.pdf`;

  const pdfBuffer =
    await generateInvoicePDF(
      order
    );

  res.setHeader(
    "Content-Type",
    "application/pdf"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  res.setHeader(
    "Content-Length",
    String(pdfBuffer.length)
  );

  return res.end(pdfBuffer);
};

// =====================================================
// CUSTOMER — DOWNLOAD OWN INVOICE
// =====================================================

export const downloadMyInvoice = async (
  req,
  res
) => {
  try {
    const orderId =
      req.params.orderId;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "Order ID is required.",
      });
    }

    const userId =
      req.user?._id ||
      req.user?.id ||
      req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required.",
      });
    }

    console.log(
      "Customer invoice request:",
      {
        orderId,
        userId:
          String(userId),
      }
    );

    const order =
      await Order.findOne({
        _id: orderId,
        user: userId,
      }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found or you are not authorized to access this invoice.",
      });
    }

    return await sendInvoicePDF(
      order,
      res
    );
  } catch (error) {
    console.error(
      "Download customer invoice error:",
      error
    );

    // IMPORTANT:
    // No PDF data has been sent because
    // we generate the complete PDF first.
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to generate invoice.",
        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  }
};

// =====================================================
// ADMIN — DOWNLOAD ANY ORDER INVOICE
// =====================================================

export const downloadAdminInvoice = async (
  req,
  res
) => {
  try {
    const orderId =
      req.params.orderId;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message:
          "Order ID is required.",
      });
    }

    const order =
      await Order.findById(
        orderId
      ).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    return await sendInvoicePDF(
      order,
      res
    );
  } catch (error) {
    console.error(
      "Download admin invoice error:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to generate invoice.",
        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  }
};