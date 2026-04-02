import axios from "axios";

// Shared API client for server endpoints. Adjust baseURL per environment.
const api = axios.create({
  baseURL: "http://localhost:5000/api",
  timeout: 5000,
});

export default api;
