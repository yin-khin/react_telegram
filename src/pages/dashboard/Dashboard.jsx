import React, { useEffect, useMemo, useState } from "react";
import { fetchDashboardData as apiFetchDashboardData } from "../../api/dashboard.api";
import { fetchProducts } from "../../api/product.api";
import { fetchSales } from "../../api/sale.api";
import { fetchPurchases } from "../../api/purchase.api";
import { fetchCustomers } from "../../api/customer.api";

import ProductSalesChart from "../../components/dashboard/ProductSalesChart";

import {
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  DollarSign,
  Box,
  Clock,
  AlertTriangle,
  AlertCircle,
  Zap,
  CalendarClock,
  RefreshCw,
} from "lucide-react";

const LOW_STOCK_QTY = 10;
const CRITICAL_STOCK_QTY = 5;
const EXPIRE_SOON_DAYS = 30;

const toNumber = (v) => Number(v ?? 0) || 0;

// date helpers
const parseDateSafe = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = parseDateSafe(value);
  if (!d) return "N/A";
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const daysDiffFromNow = (value) => {
  const d = parseDateSafe(value);
  if (!d) return null;
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const getExpireType = (expire_date) => {
  const diff = daysDiffFromNow(expire_date);
  if (diff === null) return null;
  if (diff < 0) return "expired";
  if (diff <= EXPIRE_SOON_DAYS)
    return diff <= 7 ? "expire_critical" : "expire_soon";
  return null;
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalSales: 0,
    totalPurchases: 0,
    totalCustomers: 0,
    totalRevenue: 0,
    totalStock: 0,
    outOfStock: 0,
    lowStock: 0,
    expiringSoon: 0,
    expired: 0,
  });

  const [productSalesData, setProductSalesData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [expireAlerts, setExpireAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Try backend dashboard endpoint first
      const response = await apiFetchDashboardData();

      if (response?.success) {
        const dashboardStats = response?.data?.stats || {};
        const productSales = response?.data?.productSales || [];

        setStats((prev) => ({
          ...prev,
          totalProducts: dashboardStats.totalProducts || 0,
          totalSales: dashboardStats.totalSales || 0,
          totalPurchases: dashboardStats.totalPurchases || 0,
          totalCustomers: dashboardStats.totalCustomers || 0,
          totalRevenue: toNumber(dashboardStats.totalRevenue),
          totalStock: toNumber(dashboardStats.totalStock),
          outOfStock: dashboardStats.outOfStock || 0,
          lowStock: dashboardStats.lowStock || 0,
          expiringSoon: dashboardStats.expiringSoon ?? prev.expiringSoon,
          expired: dashboardStats.expired ?? prev.expired,
        }));

        setProductSalesData(Array.isArray(productSales) ? productSales : []);

        await Promise.all([fetchRecentActivity(), fetchStockAndExpireAlerts()]);
        return;
      }

      throw new Error(response?.message || "Failed to fetch dashboard data");
    } catch (error) {
      console.error("Error fetching dashboard data:", error);

      // Fallback: compute from existing endpoints
      try {
        const [productsRes, salesRes, purchasesRes, customersRes] =
          await Promise.all([
            fetchProducts(),
            fetchSales(),
            fetchPurchases(),
            fetchCustomers(),
          ]);

        const products = Array.isArray(productsRes)
          ? productsRes
          : productsRes?.product || [];
        const sales = Array.isArray(salesRes) ? salesRes : salesRes?.data || [];
        const purchases = Array.isArray(purchasesRes)
          ? purchasesRes
          : purchasesRes?.data || [];
        const customers = Array.isArray(customersRes)
          ? customersRes
          : customersRes?.data || [];

        const totalRevenue = sales.reduce(
          (sum, sale) => sum + toNumber(sale.total),
          0,
        );
        const totalStock = products.reduce(
          (sum, p) => sum + toNumber(p.qty),
          0,
        );

        const outOfStock = products.filter((p) => toNumber(p.qty) === 0).length;
        const lowStock = products.filter((p) => {
          const qty = toNumber(p.qty);
          return qty > 0 && qty <= LOW_STOCK_QTY;
        }).length;

        const expired = products.filter(
          (p) => getExpireType(p.expire_date) === "expired",
        ).length;
        const expiringSoon = products.filter((p) => {
          const t = getExpireType(p.expire_date);
          return t === "expire_soon" || t === "expire_critical";
        }).length;

        setStats({
          totalProducts: products.length,
          totalSales: sales.length,
          totalPurchases: purchases.length,
          totalCustomers: customers.length,
          totalRevenue,
          totalStock,
          outOfStock,
          lowStock,
          expired,
          expiringSoon,
        });

        setProductSalesData([]);

        await Promise.all([fetchRecentActivity(), fetchStockAndExpireAlerts()]);
      } catch (fallbackError) {
        console.error("Error in fallback data fetching:", fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStockAndExpireAlerts = async () => {
    try {
      const productsRes = await fetchProducts();
      const products = Array.isArray(productsRes)
        ? productsRes
        : productsRes?.product || [];

      const stock = [];
      const expire = [];

      products.forEach((product) => {
        const qty = toNumber(product.qty);
        const expireType = getExpireType(product.expire_date);

        if (qty === 0) {
          stock.push({
            id: product.id,
            name: product.name,
            qty: 0,
            type: "out",
            brand: product.Brand?.name || "Unknown",
            barcode: product.barcode || "N/A",
            expire_date: product.expire_date || null,
          });
        } else if (qty <= LOW_STOCK_QTY) {
          stock.push({
            id: product.id,
            name: product.name,
            qty,
            type: qty <= CRITICAL_STOCK_QTY ? "critical" : "low",
            brand: product.Brand?.name || "Unknown",
            barcode: product.barcode || "N/A",
            expire_date: product.expire_date || null,
          });
        }

        if (expireType) {
          expire.push({
            id: product.id,
            name: product.name,
            qty,
            brand: product.Brand?.name || "Unknown",
            barcode: product.barcode || "N/A",
            expire_date: product.expire_date || null,
            type: expireType,
            daysLeft: daysDiffFromNow(product.expire_date),
          });
        }
      });

      stock.sort((a, b) => {
        const order = { out: 0, critical: 1, low: 2 };
        return order[a.type] - order[b.type];
      });

      expire.sort((a, b) => {
        const oa =
          a.type === "expired" ? 0 : a.type === "expire_critical" ? 1 : 2;
        const ob =
          b.type === "expired" ? 0 : b.type === "expire_critical" ? 1 : 2;
        if (oa !== ob) return oa - ob;
        return (a.daysLeft ?? 999999) - (b.daysLeft ?? 999999);
      });

      setStockAlerts(stock.slice(0, 20));
      setExpireAlerts(expire.slice(0));

      const expiredCount = expire.filter((e) => e.type === "expired").length;
      const expSoonCount = expire.filter(
        (e) => e.type === "expire_soon" || e.type === "expire_critical",
      ).length;

      setStats((prev) => ({
        ...prev,
        expired: expiredCount,
        expiringSoon: expSoonCount,
      }));
    } catch (error) {
      console.error("Error fetching stock/expire alerts:", error);
      setStockAlerts([]);
      setExpireAlerts([]);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const [salesRes, purchasesRes] = await Promise.all([
        fetchSales(),
        fetchPurchases(),
      ]);
      const sales = Array.isArray(salesRes) ? salesRes : salesRes?.data || [];
      const purchases = Array.isArray(purchasesRes)
        ? purchasesRes
        : purchasesRes?.data || [];

      const activities = [];

      sales.slice(0, 10).forEach((sale) => {
        const firstItem = sale.SaleItems?.[0];
        const productName = firstItem?.Product?.name || "Other Product";
        activities.push({
          type: "sale",
          id: sale.id,
          title: "New Sale",
          description: `Sale #${sale.id} - ${productName}`,
          amount: toNumber(sale.total),
          time: sale.sale_date || sale.created_at,
        });
      });

      purchases.slice(0, 9).forEach((purchase) => {
        activities.push({
          type: "purchase",
          id: purchase.id,
          title: "New Purchase",
          description: `Purchase #${purchase.id}`,
          amount: toNumber(purchase.total),
          time: purchase.created_at,
        });
      });

      activities.sort((a, b) => new Date(b.time) - new Date(a.time));
      setRecentActivity(activities.slice(0, 8));
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      setRecentActivity([]);
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return "Recently";

    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const moneyText = useMemo(() => {
    return `$${Number(stats.totalRevenue).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [stats.totalRevenue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-700 text-lg font-semibold">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Wider container - changed from max-w-[1120px] to max-w-[1600px] */}
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-5">
        {/* Header */}
        <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Dashboard Overview
              </h1>
              <p className="mt-1 text-blue-100 text-sm">
                Real-time business insights
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <Zap className="h-4 w-4 text-yellow-300 animate-pulse" />
              <span className="text-white font-medium text-xs">Live</span>
            </div>
          </div>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="group rounded-xl bg-white border-2 border-blue-200 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalProducts}
            </p>
            <p className="text-sm text-gray-600 mt-1">Products</p>
          </div>

          <div className="group rounded-xl bg-white border-2 border-emerald-200 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalSales}
            </p>
            <p className="text-sm text-gray-600 mt-1">Sales</p>
          </div>

          <div className="group rounded-xl bg-white border-2 border-violet-200 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-violet-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-violet-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalPurchases}
            </p>
            <p className="text-sm text-gray-600 mt-1">Purchases</p>
          </div>

          <div className="group rounded-xl bg-white border-2 border-orange-200 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-orange-100 rounded-lg">
                <Users className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalCustomers}
            </p>
            <p className="text-sm text-gray-600 mt-1">Customers</p>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white border-2 border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Total Revenue
                </p>
                <p className="text-xl font-bold text-gray-900">{moneyText}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border-2 border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-indigo-100 rounded-lg">
                <Box className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Stock</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats.totalStock}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stats.outOfStock > 0 && (
                <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-md px-2 py-1 text-xs font-bold">
                  <AlertCircle className="h-3 w-3" />
                  {stats.outOfStock} Out
                </span>
              )}
              {stats.lowStock > 0 && (
                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 rounded-md px-2 py-1 text-xs font-bold">
                  <AlertTriangle className="h-3 w-3" />
                  {stats.lowStock} Low
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white border-2 border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-rose-100 rounded-lg">
                <CalendarClock className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Expiry Alerts
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {stats.expiringSoon + stats.expired}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {stats.expired > 0 && (
                <span className="inline-flex items-center bg-red-100 text-red-700 rounded-md px-2 py-1 text-xs font-bold">
                  {stats.expired} Expired
                </span>
              )}
              {stats.expiringSoon > 0 && (
                <span className="inline-flex items-center bg-orange-100 text-orange-700 rounded-md px-2 py-1 text-xs font-bold">
                  {stats.expiringSoon} ≤ {EXPIRE_SOON_DAYS}d
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Grid - Adjusted proportions for wider layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Chart - Takes more space on wider screens */}
          <div className="xl:col-span-8">
            <div className="rounded-xl bg-white border-2 border-gray-200 shadow-sm p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Product Sales
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Top selling products
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="min-h-[450px]">
                <ProductSalesChart data={productSalesData} />
              </div>
            </div>
          </div>

          {/* Right Column - Stock & Activity */}
          <div className="xl:col-span-4 space-y-5">
            {/* Stock Alerts */}
            <div className="rounded-xl bg-white border-2 border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    Stock Alerts
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Critical inventory
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar">
                {stockAlerts.length === 0 ? (
                  <div className="rounded-lg bg-emerald-50 p-5 text-center">
                    <div className="mx-auto h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Box className="h-5 w-5 text-emerald-600" />
                    </div>
                    <p className="mt-2 font-semibold text-emerald-900 text-sm">
                      All Good!
                    </p>
                    <p className="text-xs text-emerald-600">
                      No critical alerts
                    </p>
                  </div>
                ) : (
                  stockAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border-2 p-3 transition-all hover:shadow-sm ${
                        alert.type === "out"
                          ? "bg-red-50 border-red-200"
                          : alert.type === "critical"
                            ? "bg-orange-50 border-orange-200"
                            : "bg-yellow-50 border-yellow-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex-shrink-0 p-2 rounded-lg ${
                            alert.type === "out"
                              ? "bg-red-100"
                              : alert.type === "critical"
                                ? "bg-orange-100"
                                : "bg-yellow-100"
                          }`}
                        >
                          {alert.type === "out" ? (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">
                            {alert.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-600">
                              {alert.brand}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                                alert.type === "out"
                                  ? "bg-red-200 text-red-800"
                                  : alert.type === "critical"
                                    ? "bg-orange-200 text-orange-800"
                                    : "bg-yellow-200 text-yellow-800"
                              }`}
                            >
                              {alert.type === "out"
                                ? "OUT"
                                : alert.type === "critical"
                                  ? "CRITICAL"
                                  : "LOW"}
                            </span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <div
                            className={`px-2.5 py-1 rounded-lg font-bold text-sm ${
                              alert.type === "out"
                                ? "bg-red-200 text-red-800"
                                : alert.type === "critical"
                                  ? "bg-orange-200 text-orange-800"
                                  : "bg-yellow-200 text-yellow-800"
                            }`}
                          >
                            {alert.qty}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl bg-white border-2 border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-emerald-500" />
                    Recent Activity
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Latest transactions
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[800px] overflow-y-auto custom-scrollbar">
                {recentActivity.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-6 text-center">
                    <Clock className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">
                      No Activity
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Transactions will appear here
                    </p>
                  </div>
                ) : (
                  recentActivity.map((a, idx) => (
                    <div
                      key={`${a.type}-${a.id}-${idx}`}
                      className="rounded-lg border-2 border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200 transition-all p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-white ${
                            a.type === "sale"
                              ? "bg-emerald-500"
                              : "bg-violet-500"
                          }`}
                        >
                          {a.type === "sale" ? (
                            <ShoppingCart className="h-4 w-4" />
                          ) : (
                            <TrendingUp className="h-4 w-4" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-bold text-gray-900 text-xs">
                              {a.title}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                a.type === "sale"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-violet-100 text-violet-700"
                              }`}
                            >
                              {a.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 truncate mb-1">
                            {a.description}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimeAgo(a.time)}</span>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <div
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs ${
                              a.type === "sale"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-violet-50 text-violet-700"
                            }`}
                          >
                            $
                            {Number(a.amount).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expire Alerts Table - Full Width */}
        <div className="rounded-xl bg-white border-2 border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-rose-500" />
                Expire Alerts
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Expired or expiring within {EXPIRE_SOON_DAYS} days
              </p>
            </div>

            <button
              type="button"
              onClick={fetchStockAndExpireAlerts}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {expireAlerts.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 p-5 text-center">
              <CalendarClock className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
              <p className="font-semibold text-emerald-900 text-sm">
                No Expiry Alerts
              </p>
              <p className="text-xs text-emerald-600">All products are safe</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b-2 border-gray-200">
                    <th className="py-2 pr-3 font-bold">Product</th>
                    <th className="py-2 pr-3 font-bold">Brand</th>
                    <th className="py-2 pr-3 font-bold">Barcode</th>
                    <th className="py-2 pr-3 font-bold">Expire Date</th>
                    <th className="py-2 pr-3 font-bold">Days</th>
                    <th className="py-2 text-right font-bold">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {expireAlerts.map((e) => {
                    const isExpired = e.type === "expired";
                    const isCritical = e.type === "expire_critical";

                    const rowBg = isExpired
                      ? "bg-rose-50"
                      : isCritical
                        ? "bg-orange-50"
                        : "bg-yellow-50";

                    const badge = isExpired
                      ? "bg-rose-200 text-rose-900"
                      : isCritical
                        ? "bg-orange-200 text-orange-900"
                        : "bg-yellow-200 text-yellow-900";

                    const label = isExpired
                      ? "EXPIRED"
                      : isCritical
                        ? "≤ 7D"
                        : "SOON";

                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-gray-100 ${rowBg}`}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="font-bold text-gray-900 text-sm truncate max-w-[220px]">
                            {e.name}
                          </div>
                          <span
                            className={`inline-flex mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${badge}`}
                          >
                            {label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700">{e.brand}</td>
                        <td className="py-2.5 pr-3 text-gray-600">
                          {e.barcode}
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-gray-800">
                          {formatDate(e.expire_date)}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-700">
                          {typeof e.daysLeft === "number"
                            ? e.daysLeft < 0
                              ? `${Math.abs(e.daysLeft)}d ago`
                              : `${e.daysLeft}d left`
                            : "N/A"}
                        </td>
                        <td className="py-2.5 text-right font-bold text-gray-900">
                          {e.qty}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default Dashboard;
