// src/pages/products/ProductList.jsx
import React, { useEffect, useState, useMemo } from "react";
import { fetchProducts, deleteProduct } from "../../api/product.api";
import { fetchCategories } from "../../api/category.api";
import { fetchBrands } from "../../api/brand.api";
import { fetchSuppliers } from "../../api/supplier.api";
import ProductModal from "./ProductModal";
import { useAuth } from "../../context/AuthContext";
import { AdminOnly, can } from "../../utils/permissions";

const ProductList = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(40);
  const [totalItems, setTotalItems] = useState(0);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Permission checks
  const canCreate = can(user, "product", "create");
  const canEdit = can(user, "product", "edit");
  const canDelete = can(user, "product", "delete");

  // Compute displayed products with enriched data (Category, Brand, Supplier names)
  const displayedProducts = useMemo(() => {
    return products.map((product) => {
      // Get Category Name
      let categoryName = "-";
      if (product.Category?.name) {
        categoryName = product.Category.name;
      } else if (product.category_name) {
        categoryName = product.category_name;
      } else if (product.category_id) {
        const category = categories.find(
          (c) => c.id === parseInt(product.category_id),
        );
        categoryName = category
          ? category.name
          : `ប្រភេទ ${product.category_id}`;
      }

      // Get Brand Name
      let brandName = "-";
      if (product.Brand?.name) {
        brandName = product.Brand.name;
      } else if (product.brand_name) {
        brandName = product.brand_name;
      } else if (product.brand_id) {
        const brand = brands.find((b) => b.id === parseInt(product.brand_id));
        brandName = brand ? brand.name : `ម៉ាក ${product.brand_id}`;
      }

      // Get Supplier Name - FIXED FOR MISSING supplier_id
      let supplierName = "-";

      if (product.Supplier?.name) {
        // If product has Supplier object from API (most reliable)
        supplierName = product.Supplier.name;
      } else if (product.supplier_name) {
        // If API returns supplier_name directly
        supplierName = product.supplier_name;
      } else if (product.supplier_id) {
        // Look up supplier from the suppliers array
        const supplier = suppliers.find(
          (s) => s.id === parseInt(product.supplier_id),
        );
        if (supplier) {
          supplierName = supplier.name;
        } else {
          supplierName = `អ្នកផ្គត់ផ្គង់ #${product.supplier_id}`;
        }
      }
      // If no supplier data at all, show message
      if (supplierName === "-" && product.id) {
        supplierName = "មិនបានកំណត់"; // "Not specified"
      }

      return {
        ...product,
        category_display_name: categoryName,
        brand_display_name: brandName,
        supplier_display_name: supplierName,
      };
    });
  }, [products, categories, brands, suppliers]);

  // Load suppliers, categories, and brands on component mount
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [categoriesData, brandsData, suppliersData] = await Promise.all([
          fetchCategories(),
          fetchBrands(),
          fetchSuppliers(),
        ]);
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        setBrands(Array.isArray(brandsData) ? brandsData : []);
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      } catch (error) {
        console.error("Error fetching filter data:", error);
      }
    };
    fetchFilterData();
  }, []);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setCurrentPage(1);
        getProducts();
      },
      searchTerm ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reload products when filters change
  useEffect(() => {
    getProducts();
  }, [currentPage, categoryFilter, brandFilter, supplierFilter, statusFilter]);

  const getProducts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        ...(searchTerm && { search: searchTerm }),
        ...(categoryFilter && { category_id: categoryFilter }),
        ...(brandFilter && { brand_id: brandFilter }),
        ...(supplierFilter && { supplier_id: supplierFilter }),
        ...(statusFilter && { status: statusFilter }),
      };

      const response = await fetchProducts(params);

      // Handle different API response structures
      let productData = [];
      let total = 0;

      if (response && response.products && Array.isArray(response.products)) {
        productData = response.products;
        total = response.total || response.products.length;
      } else if (Array.isArray(response)) {
        productData = response;
        total = response.length;
      } else if (response && response.data && Array.isArray(response.data)) {
        productData = response.data;
        total = response.total || response.data.length;
      }

      // Sort by ID DESC (newest first)
      productData.sort((a, b) => b.id - a.id);

      setProducts(productData);
      setTotalItems(total);
    } catch (error) {
      console.error("Error fetching products:", error);
      setError("មានបញ្ហាក្នុងការទាញយកបញ្ជីផលិតផល");
      setProducts([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("តើអ្នកពិតជាចង់លុបផលិតផលនេះមែនទេ?")) {
      return;
    }
    try {
      await deleteProduct(id);
      getProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      setError("មិនអាចលុបផលិតផលបានទេ");
    }
  };

  const handleOpenModal = (id = null) => {
    setSelectedProductId(id);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedProductId(null);
  };

  const handleRefresh = () => {
    getProducts();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCategoryFilter("");
    setBrandFilter("");
    setSupplierFilter("");
    setStatusFilter("");
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Table columns configuration
  const columns = [
    {
      key: "image",
      title: "រូបភាព",
      render: (item) => {
        const hasImage = item.image && item.image.trim() !== "";
        return (
          <div className="w-12 h-12">
            {hasImage ? (
              <img
                src={item.image}
                alt={item.name || "Product image"}
                className="w-full h-full object-cover rounded"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src =
                    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iMjQiIHk9IjI0IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5Y2EwYjAiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==";
                }}
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">
                គ្មានរូប
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "name",
      title: "ឈ្មោះផលិតផល",
      render: (item) => <span className="font-medium">{item.name || "-"}</span>,
    },
    {
      key: "category",
      title: "ប្រភេទ",
      render: (item) => (
        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
          {item.category_display_name}
        </span>
      ),
    },
    {
      key: "brand",
      title: "ម៉ាក",
      render: (item) => (
        <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-xs">
          {item.brand_display_name}
        </span>
      ),
    },
    {
      key: "supplier",
      title: "អ្នកផ្គត់ផ្គង់",
      render: (item) => (
        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
          {item.supplier_display_name || "-"}
        </span>
      ),
    },
    ...(user?.role === "Admin"
      ? [
          {
            key: "price",
            title: "តម្លៃ",
            render: (item) => (
              <span className="text-gray-700 font-medium">
                ${parseFloat(item.price || 0).toFixed(2)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "sale_price",
      title: "តម្លៃលក់",
      render: (item) =>
        item.sale_price ? (
          <span className="text-green-600 font-semibold">
            ${parseFloat(item.sale_price).toFixed(2)}
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "qty",
      title: "ចំនួន",
      render: (item) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            (item.qty || 0) > 10
              ? "bg-green-100 text-green-800"
              : (item.qty || 0) > 0
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
          }`}
        >
          {item.qty || 0}
        </span>
      ),
    },
    {
      key: "barcode",
      title: "លេខកូដ",
      render: (item) => (
        <span className="text-gray-600 font-mono text-sm">
          {item.barcode || "-"}
        </span>
      ),
    },
    {
      key: "status",
      title: "ស្ថានភាព",
      render: (item) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            (item.status || 0) == 1
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {(item.status || 0) == 1 ? "សកម្ម" : "មិនសកម្ម"}
        </span>
      ),
    },
    {
      key: "expire_date",
      title: "ផុតកំណត់",
      render: (item) => {
        if (!item.expire_date) return "-";
        const expireDate = new Date(item.expire_date);
        const today = new Date();
        const diffTime = expireDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        let className = "px-2 py-1 rounded-full text-xs font-semibold ";
        if (diffDays < 0) {
          className += "bg-red-100 text-red-800";
        } else if (diffDays < 7) {
          className += "bg-yellow-100 text-yellow-800";
        } else {
          className += "bg-green-100 text-green-800";
        }
        return (
          <span className={className}>
            {expireDate.toLocaleDateString("km-KH")}
          </span>
        );
      },
    },
    {
      key: "actions",
      title: "សកម្មភាព",
      render: (item) => (
        <div className="flex justify-center space-x-2">
          {canEdit && (
            <button
              onClick={() => handleOpenModal(item.id)}
              className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              កែសម្រួល
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => handleDelete(item.id)}
              className="bg-red-600 text-white hover:bg-red-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              លុប
            </button>
          )}
          {!canEdit && !canDelete && (
            <span className="text-gray-400 text-sm">មិនមានសកម្មភាព</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h2 className="text-xl md:text-[19px] font-bold text-gray-800">
            បញ្ជីផលិតផល
          </h2>
          <p className="text-gray-600 text-sm mt-1">
            គ្រប់គ្រងផលិតផលទាំងអស់ក្នុងហាងរបស់អ្នក ({totalItems})
          </p>
        </div>
        <AdminOnly>
          {canCreate && (
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 md:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              បន្ថែមផលិតផលថ្មី
            </button>
          )}
        </AdminOnly>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ស្វែងរក
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ស្វែងរកតាមឈ្មោះ លេខកូដ..."
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ប្រភេទ
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">ទាំងអស់</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ម៉ាក
            </label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">ទាំងអស់</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              អ្នកផ្គត់ផ្គង់
            </label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">ទាំងអស់</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ស្ថានភាព
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">ទាំងអស់</option>
              <option value="1">សកម្ម</option>
              <option value="0">មិនសកម្ម</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <button
            type="button"
            onClick={handleResetFilters}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            សម្អាតតម្រង
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            ផ្ទុកឡើងវិញ
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">កំពុងទាញយកទិន្នន័យ...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Products Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {displayedProducts.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  គ្មានផលិតផលទេ
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  ចាប់ផ្តើមដោយការបង្កើតផលិតផលថ្មី។
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {columns.map((column, index) => (
                          <th
                            key={index}
                            className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {column.title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {displayedProducts.map((product) => (
                        <tr
                          key={product.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          {columns.map((column, colIndex) => (
                            <td
                              key={colIndex}
                              className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"
                            >
                              {column.render(product)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      បង្ហាញ{" "}
                      <span className="font-medium">
                        {(currentPage - 1) * itemsPerPage + 1}
                      </span>{" "}
                      {/* ទៅ{" "} */}
                      {/* <span className="font-medium">
                        {Math.min(currentPage * itemsPerPage, totalItems)}
                      </span>{" "} */}
                      នៃ <span className="font-medium">{totalItems}</span>{" "}
                      លទ្ធផល
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setCurrentPage((prev) => Math.max(prev - 1, 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        ថយក្រោយ
                      </button>

                      {/* Fixed page number buttons */}
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            // Show all pages if total is 5 or less
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            // Show first 5 pages
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            // Show last 5 pages
                            pageNum = totalPages - 4 + i;
                          } else {
                            // Show current page in the middle
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-2 border text-sm font-medium rounded-md transition-colors ${
                                currentPage === pageNum
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}

                      <button
                        onClick={() =>
                          setCurrentPage((prev) =>
                            Math.min(prev + 1, totalPages),
                          )
                        }
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        ទៅមុខ
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Product Modal */}
      <ProductModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        productId={selectedProductId}
        refreshProducts={handleRefresh}
      />
    </div>
  );
};

export default ProductList;
