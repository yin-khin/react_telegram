// // src/api/axios.js
// import axios from "axios";

// const instance = axios.create({
//   baseURL: process.env.REACT_APP_API_URL || "http://localhost:3001",
//   timeout: 10000,
//   headers: { "Content-Type": "application/json" },
// });

// instance.interceptors.request.use(
//   (config) => {
//     const token =
//       localStorage.getItem("token") || sessionStorage.getItem("token");

//     if (token) config.headers.Authorization = `Bearer ${token}`;
//     return config;
//   },
//   (error) => Promise.reject(error)
// );

// instance.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       localStorage.removeItem("token");
//       localStorage.removeItem("user");
//       sessionStorage.removeItem("token");
//       sessionStorage.removeItem("user");
//       window.location.href = "/login";
//     }
//     return Promise.reject(error);
//   }
// );

// export default instance;


import axios from "axios";

const API_ORIGIN = process.env.REACT_APP_API_URL || "http://localhost:3001";

const instance = axios.create({
  baseURL: `${API_ORIGIN}`, // ✅ important
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ===== REQUEST =====
instance.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");

    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// ===== RESPONSE =====
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || "";

    // ✅ public endpoints (no redirect)
    const isPublic =
      url.includes("/api/user/sendOtp") ||
      url.includes("/api/user/verifyOtp") ||
      url.includes("/api/user/resetPassword") ||
      url.includes("/api/login") ||
      url.includes("/api/register");

    if (error.response?.status === 401 && !isPublic) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default instance;
