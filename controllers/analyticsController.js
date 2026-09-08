import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const istDateString = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
    const [defYearStr, defMonthStr] = istDateString.split("-");
    const currentYear = parseInt(defYearStr, 10);
    const currentMonth = parseInt(defMonthStr, 10);

    const viewMode = ["year", "month", "date"].includes(req.query.viewMode)
      ? req.query.viewMode
      : "year";

    const targetYear = req.query.year
      ? parseInt(req.query.year, 10) || currentYear
      : currentYear;

    const targetMonth = req.query.month
      ? parseInt(req.query.month, 10) || currentMonth
      : currentMonth;

    const targetDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : istDateString;

    // Available Years from Order Data
    const yearsResult = await Order.aggregate([
      {
        $match: {
          createdAt: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: {
            $year: {
              date: "$createdAt",
              timezone: "Asia/Kolkata",
            },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    let availableYears = yearsResult
      .map((y) => y._id)
      .filter((y) => typeof y === "number" && !isNaN(y));

    if (!availableYears.includes(currentYear)) {
      availableYears.push(currentYear);
    }
    availableYears.sort((a, b) => a - b);

    let salesOverviewData = [];

    if (viewMode === "year") {
      const rawMonthlyRevenue = await Order.aggregate([
        {
          $match: {
            paymentStatus: "Paid",
            $expr: {
              $eq: [
                {
                  $year: {
                    date: "$createdAt",
                    timezone: "Asia/Kolkata",
                  },
                },
                targetYear,
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              month: {
                $month: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },
            },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { "_id.month": 1 } },
      ]);

      const map = new Map();
      for (const item of rawMonthlyRevenue) {
        if (item?._id?.month) {
          map.set(item._id.month, {
            revenue: Number(item.revenue || 0),
            orders: Number(item.orders || 0),
          });
        }
      }

      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];

      for (let m = 1; m <= 12; m++) {
        const d = map.get(m) || { revenue: 0, orders: 0 };
        salesOverviewData.push({
          label: monthNames[m - 1],
          monthIndex: m,
          revenue: d.revenue,
          orders: d.orders,
        });
      }
    } else if (viewMode === "month") {
      const rawDailyRevenue = await Order.aggregate([
        {
          $match: {
            paymentStatus: "Paid",
            $expr: {
              $and: [
                {
                  $eq: [
                    { $year: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                    targetYear,
                  ],
                },
                {
                  $eq: [
                    { $month: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                    targetMonth,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              day: {
                $dayOfMonth: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },
            },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]);

      const map = new Map();
      for (const item of rawDailyRevenue) {
        if (item?._id?.day) {
          map.set(item._id.day, {
            revenue: Number(item.revenue || 0),
            orders: Number(item.orders || 0),
          });
        }
      }

      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const data = map.get(d) || { revenue: 0, orders: 0 };
        salesOverviewData.push({
          label: `${d}`,
          dayIndex: d,
          revenue: data.revenue,
          orders: data.orders,
        });
      }
    } else if (viewMode === "date") {
      const [yStr, mStr, dStr] = targetDate.split("-");
      const dYear = parseInt(yStr, 10);
      const dMonth = parseInt(mStr, 10);
      const dDay = parseInt(dStr, 10);

      const rawHourlyRevenue = await Order.aggregate([
        {
          $match: {
            paymentStatus: "Paid",
            $expr: {
              $and: [
                {
                  $eq: [
                    { $year: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                    dYear,
                  ],
                },
                {
                  $eq: [
                    { $month: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                    dMonth,
                  ],
                },
                {
                  $eq: [
                    { $dayOfMonth: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                    dDay,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              hour: {
                $hour: {
                  date: "$createdAt",
                  timezone: "Asia/Kolkata",
                },
              },
            },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { "_id.hour": 1 } },
      ]);

      const map = new Map();
      for (const item of rawHourlyRevenue) {
        if (typeof item?._id?.hour === "number") {
          map.set(item._id.hour, {
            revenue: Number(item.revenue || 0),
            orders: Number(item.orders || 0),
          });
        }
      }

      for (let h = 0; h < 24; h++) {
        const data = map.get(h) || { revenue: 0, orders: 0 };
        const labelStr = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
        salesOverviewData.push({
          label: labelStr,
          hourIndex: h,
          revenue: data.revenue,
          orders: data.orders,
        });
      }
    }

    const monthlyRevenue = salesOverviewData.map((item, idx) => ({
      _id: { month: item.monthIndex || idx + 1 },
      revenue: item.revenue,
      orders: item.orders,
    }));

    // Top Customers
    const topCustomers = await Order.aggregate([
      {
        $group: {
          _id: "$phone",
          customerName: { $first: "$customerName" },
          totalSpent: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
      {
        $sort: {
          totalSpent: -1,
        },
      },
      {
        $limit: 5,
      },
    ]);

    // Top Selling Products
    const topProducts = await Order.aggregate([
      {
        $unwind: "$products",
      },
      {
        $group: {
          _id: "$products.productId",
          name: {
            $first: "$products.name",
          },
          sold: {
            $sum: "$products.quantity",
          },
        },
      },
      {
        $sort: {
          sold: -1,
        },
      },
      {
        $limit: 5,
      },
    ]);

    // Category Sales
    const categorySales = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalProducts: {
            $sum: 1,
          },
        },
      },
    ]);

    res.json({
      success: true,
      viewMode,
      selectedYear: targetYear,
      selectedMonth: targetMonth,
      selectedDate: targetDate,
      availableYears,
      salesOverviewData,
      monthlyRevenue,
      topCustomers,
      topProducts,
      categorySales,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};